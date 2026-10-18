"""Build on-device ML/geo assets. Outputs are gitignored (big) except cities.json + clipGolden.json.

Setup:  python -m venv --system-site-packages .venv && .venv/bin/pip install onnx onnxruntime onnxscript wordfreq ftfy regex litert-torch ai-edge-quantizer
        (needs torch + torchvision + transformers already installed; the TinyCLIP open_clip fork is cloned on first run)
Run:    .venv/bin/python scripts/build_assets.py [clip] [gpu] [vocab] [concepts] [cities] [bench]   (no args = all but bench)

clip   - TinyCLIP (MIT, see MODELS) -> int8 ONNX vision + text towers, tokenizer.json, golden vectors
gpu    - the same vision tower -> fp16-weight LiteRT vision.tflite for the GPU (the ONNX one stays as CPU fallback)
vocab  - Open Images V7 class names (CC BY 4.0) + hand-written concepts -> int8 text embeddings
cities - GeoNames cities15000 (CC BY 4.0) -> compact cities.json for offline reverse geocoding
bench  - int8 vision towers of the other MODELS, for the index bench (prints the adb commands to push them)
"""
import csv, io, json, os, struct, subprocess, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "modules/clip-embedder/android/src/main/assets/clip"
JS = ROOT / "src/services/index"
CACHE = ROOT / "scripts/.cache"  # downloads; gitignored
# name -> (open_clip arch, pretrained tag). ImageNet top-1 on a 4.7k-image val subset, one prompt; vision ms/photo on a Galaxy A54.
MODELS = {
    "45m": ("TinyCLIP-auto-ViT-45M-32-Text-18M", "LAIONYFCC400M"),  # 61.4%, 73 ms
    # HF port, exported exactly as shipped until Oct 2026: open_clip's export of it leaves its Linears as fp32 Gemm.
    "40m": ("hf", "wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M"),  # 57.5%, 64 ms
    "22m": ("TinyCLIP-auto-ViT-22M-32-Text-10M", "LAION400M"),  # 52.0%, 38 ms
}
SHIPPED = "45m"
TOKENIZER = "wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M"  # OpenAI CLIP BPE, shared by every TinyCLIP model
TINYCLIP = CACHE / "tinyclip"
CTX = 77
EOT = 49407
GOLDEN_PHRASES = ["a photo of a dog", "cinnamon bun", "wearing red", "A week in Seattle!", "café crème brûlée 123"]
GOLDEN_IMAGE = ROOT / "screenshots/screenshot_1_hook.jpg"

# Concepts Open Images lacks or names awkwardly: colors, clothing, light, moods, events, places.
EXTRA = {
    "wearing {}": ["red", "black", "white", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "denim", "a hat", "sunglasses", "a suit", "a dress", "a hoodie", "a scarf", "a costume"],
    "{} colors": ["warm", "cool", "pastel", "neon", "muted", "earthy", "monochrome"],
    "{}": [
        "golden hour", "sunset", "sunrise", "blue hour", "night city lights", "fog", "rain", "snow", "autumn leaves", "spring blossoms",
        "a beach day", "a hike", "a road trip", "a camping trip", "a ski trip", "a festival", "a concert", "a wedding", "a birthday party",
        "a picnic", "a dinner party", "a coffee date", "brunch", "street food", "a home-cooked meal", "baking", "a cocktail bar", "a wine tasting",
        "a museum visit", "an art gallery", "a bookstore", "a farmers market", "a flea market", "a city walk", "street art", "architecture",
        "a cozy home", "a plant collection", "a workout", "a run", "a yoga session", "a football match", "a gig", "a night out", "a selfie",
        "a group of friends", "a family gathering", "a baby", "a pet dog", "a pet cat", "a sleepy pet", "a mirror selfie", "an outfit of the day",
        "a sunset over the sea", "a mountain view", "a lake", "a forest", "a desert", "a waterfall", "an island", "a harbor", "a train journey",
        "an airport", "a view from an airplane window", "a hotel room", "a pool", "a garden", "flowers", "a bouquet", "a cathedral", "a castle",
        "a skyline", "a bridge", "a market stall", "a cafe interior", "latte art", "a croissant", "a cinnamon roll", "a pastry", "a cake",
        "ice cream", "pizza", "sushi", "ramen", "tacos", "a burger", "a salad", "a cheese board", "a cocktail", "a glass of wine", "a beer",
        "vinyl records", "a film camera", "a sketchbook", "knitting", "pottery", "a bicycle", "a vintage car", "neon signs", "christmas lights",
        "halloween", "fireworks", "a candlelit dinner", "a rainy window", "a messy desk", "a laptop at work", "a screenshot", "a document", "a receipt",
    ],
}
MIN_ZIPF = 4.0
# Never a story title. Word-level (any word matches) and whole-phrase lists.
BLOCK = set("""orgasm sex sexual erotic erotica nude nudity naked porn pornography lingerie condom penis vagina breast breasts
buttocks nipple genitals umbilical placenta childbirth corpse cadaver blood wound injury vomit feces urine diarrhea autopsy
suicide murder gun rifle weapon bomb drug drugs cocaine heroin syringe tumor cancer disease rash acne fetish bondage stripper""".split())
BLOCK_PHRASES = {"making out", "human body", "hair removal", "begging"}
LICENSE_NOTE = "Open Images V7 class names (CC BY 4.0, Google LLC) + hand-written concepts"


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    if not p.exists():
        print("downloading", url)
        urllib.request.urlretrieve(url, p)
    return p


def load_model(name=SHIPPED):
    """open_clip model (encode_image / encode_text) from the TinyCLIP fork: the "auto" models need its pruning loader."""
    repo = TINYCLIP / "TinyCLIP"
    if not repo.exists():
        subprocess.run(["git", "clone", "https://github.com/wkcn/TinyCLIP", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "checkout", "ad981bf"], check=True)
    sys.path.insert(0, str(repo / "src"))
    import open_clip
    from transformers import CLIPTokenizerFast
    from huggingface_hub import hf_hub_download
    arch, tag = MODELS[name]
    if arch == "hf":
        from transformers import CLIPModel
        m = CLIPModel.from_pretrained(tag).eval().requires_grad_(False)
        m.encode_image, m.encode_text = m.get_image_features, m.get_text_features
    else:
        m = open_clip.create_model(arch, pretrained=tag, cache_dir=str(TINYCLIP)).eval().requires_grad_(False)
    tok_file = hf_hub_download(TOKENIZER, "tokenizer.json")
    return m, CLIPTokenizerFast(tokenizer_file=tok_file), tok_file


def token_ids(tok, texts):
    out = []
    for t in texts:
        ids = tok(t)["input_ids"][:CTX]  # [SOT, ..., EOT]
        ids[-1] = EOT
        out.append(ids + [EOT] * (CTX - len(ids)))  # pad with EOT; pooling takes the first EOT (argmax)
    return out


def preprocess(path):  # path or PIL image
    """Mirror of the Kotlin path: shortest side -> 224, center crop, CLIP mean/std."""
    import numpy as np
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(path if isinstance(path, Image.Image) else Image.open(path)).convert("RGB")
    s = 224 / min(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.BILINEAR)
    l, t = (im.width - 224) // 2, (im.height - 224) // 2
    a = np.asarray(im.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255
    a = (a - [0.48145466, 0.4578275, 0.40821073]) / [0.26862954, 0.26130258, 0.27577711]
    return a.transpose(2, 0, 1)[None].astype(np.float32)


class Towers:
    """L2-normalized vision (pixel_values) and text (input_ids) towers of an open_clip model, as exportable modules."""
    def __init__(self, m):
        import torch

        class Vision(torch.nn.Module):
            def __init__(self): super().__init__(); self.m = m
            def forward(self, pixel_values):
                e = self.m.encode_image(pixel_values)
                return e / e.norm(dim=-1, keepdim=True)

        class Text(torch.nn.Module):
            def __init__(self): super().__init__(); self.m = m
            def forward(self, input_ids):
                e = self.m.encode_text(input_ids)
                return e / e.norm(dim=-1, keepdim=True)

        self.vision, self.text = Vision(), Text()


def const_to_init(m):
    """Pruned TinyCLIP weights export as Constant nodes; the quantizer only touches initializers."""
    import onnx
    keep = []
    for n in m.graph.node:
        if n.op_type == "Constant" and n.attribute[0].name == "value" and onnx.numpy_helper.to_array(n.attribute[0].t).size > 64:
            t = onnx.TensorProto(); t.CopyFrom(n.attribute[0].t); t.name = n.output[0]; m.graph.initializer.append(t)
        else:
            keep.append(n)
    del m.graph.node[:]; m.graph.node.extend(keep)
    return m


def export_int8(mod, x, inp, out):
    """fp32 ONNX -> weight-only int8, checked against torch. Returns the int8 outputs for x."""
    import torch, onnx, onnxruntime as ort, shutil
    from onnxruntime.quantization import quantize_dynamic, QuantType
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    tmp = CACHE / "fp32"; tmp.mkdir(parents=True, exist_ok=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    f32 = tmp / f"{out.stem}.onnx"
    torch.onnx.export(mod, (x,), f32, input_names=[inp], output_names=["embeds"], opset_version=17,
                      dynamic_axes={inp: {0: "n"}, "embeds": {0: "n"}}, dynamo=False)
    # Weight-only int8 MatMuls (activations stay fp32): full int8 dynamic quant dropped text cosine to ~0.8.
    q = MatMulNBitsQuantizer(const_to_init(onnx.load(f32)), bits=8, block_size=32, is_symmetric=True); q.process()
    q.model.save_model_to_file(str(tmp / f"{out.stem}.nbits.onnx"), False)
    if inp == "input_ids":  # the 49408x512 token embedding is most of the text tower: int8 Gather
        quantize_dynamic(tmp / f"{out.stem}.nbits.onnx", out, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"])
    else:
        shutil.copy(tmp / f"{out.stem}.nbits.onnx", out)
    with torch.no_grad():
        ref = mod(x).numpy()
    got = ort.InferenceSession(str(out)).run(None, {inp: x.numpy()})[0]
    cos = (ref * got).sum(-1)
    print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB, int8 vs fp32 cosine min {cos.min():.4f}")
    assert cos.min() > 0.98, "int8 quantization drifted too far"
    return got


def build_clip():
    import torch, shutil
    m, tok, tok_file = load_model()
    t = Towers(m)
    pix = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    ids = torch.tensor(token_ids(tok, GOLDEN_PHRASES), dtype=torch.long)
    q_v = export_int8(t.vision, pix, "pixel_values", NATIVE / "vision.onnx")
    q_t = export_int8(t.text, ids, "input_ids", NATIVE / "text.onnx")
    shutil.copy(tok_file, NATIVE / "tokenizer.json")
    JS.mkdir(parents=True, exist_ok=True)
    golden = {"model": "-".join(MODELS[SHIPPED]), "phrases": GOLDEN_PHRASES, "ids": ids.tolist(), "text": q_t.round(5).tolist(),
              "image": {"file": GOLDEN_IMAGE.name, "vec": q_v[0].round(5).tolist()}}
    (JS / "clipGolden.json").write_text(json.dumps(golden))


def build_gpu():
    """Vision tower for the Mali GPU delegate (LiteRT CompiledModel), batch 1, same weights with the forward rewritten:
    the delegate rejects TinyCLIP's 3D class-token concat and 2D broadcasts, and fails "Unrecognized Write selector" on
    any batch > 1 (tried NLD, batch-first 4D and all-2D graphs). Output is NOT L2-normalized (the converter turns that
    into L2_NORMALIZATION, CPU-only); Kotlin does it. int8 weights don't compile on the GPU, so fp16 (cosine 1.0 vs fp32)."""
    import numpy as np, torch, torch.nn.functional as F, litert_torch
    from ai_edge_quantizer import quantizer, recipe_manager, algorithm_manager
    from ai_edge_quantizer.qtyping import TFLOperationName
    from ai_edge_litert.interpreter import Interpreter
    m = load_model()[0].eval()
    v = next(x for x in m.modules() if hasattr(x, "class_embedding"))

    class Vision(torch.nn.Module):
        def __init__(self):
            super().__init__()
            tok = v.positional_embedding.detach().clone()
            tok[0] += v.class_embedding.detach()
            self.tok = torch.nn.Parameter(tok[None], requires_grad=False)  # [1, 50, D]: pos, with cls folded into row 0
        def forward(self, px):
            x = v.conv1(px).flatten(2).transpose(1, 2)  # [1, 49, D]
            x = F.pad(x, (0, 0, 1, 0)) + self.tok  # empty row 0 becomes cls + pos
            x = v.transformer(v.ln_pre(x).permute(1, 0, 2)).permute(1, 0, 2)
            return (v.ln_post(x[:, :1]) @ v.proj).flatten(1)  # 3D through ln_post: its 2D broadcasts fall off the GPU

    x = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    with torch.no_grad():
        ref = Towers(m).vision(x).numpy()[0]
    f32 = CACHE / "fp32" / "vision.tflite"; f32.parent.mkdir(parents=True, exist_ok=True)
    litert_torch.convert(Vision().eval(), (x,)).export(str(f32))
    rm = recipe_manager.RecipeManager()
    rm.add_weight_only_config(regex=".*", operation_name=TFLOperationName.ALL_SUPPORTED, num_bits=16,
                              algorithm_key=algorithm_manager.AlgorithmName.FLOAT_CASTING)
    q = quantizer.Quantizer(str(f32)); q.load_quantization_recipe(rm.get_quantization_recipe())
    out = NATIVE / "vision.tflite"
    out.write_bytes(q.quantize().quantized_model)
    it = Interpreter(model_path=str(out)); it.allocate_tensors()
    it.set_tensor(it.get_input_details()[0]["index"], x.numpy()); it.invoke()
    e = it.get_tensor(it.get_output_details()[0]["index"])[0]
    cos = float(ref @ e / np.linalg.norm(e))
    print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB, vs torch cosine {cos:.5f}")
    assert cos > 0.999, "LiteRT export drifted"


def build_bench():
    """Vision towers of the non-shipped models. The bench loads files/models/vision_<name>.onnx when present."""
    import torch
    pix = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    for name in MODELS:
        if name == SHIPPED:
            continue
        f = CACHE / "bench" / f"vision_{name}.onnx"
        export_int8(Towers(load_model(name)[0]).vision, pix, "pixel_values", f)
        print(f"  adb push {f} /data/local/tmp/ && adb shell \"run-as com.daydump.app sh -c 'mkdir -p files/models && "
              f"cat /data/local/tmp/{f.name} > files/models/{f.name}'\"")


def build_vocab():
    import numpy as np, torch
    m, tok, _ = load_model()
    csv_path = fetch("https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv", "oidv7-class-descriptions.csv")
    import re, wordfreq
    entries, seen = [], set()
    def add(n):
        key = re.sub(r"^(a|an|the) ", "", n)  # "a selfie" == "selfie": one concept, not two half-sized topics
        if key not in seen and not BLOCK & set(re.split(r"[\s-]+", n)) and n not in BLOCK_PHRASES:
            seen.add(key); entries.append((n, f"a photo of {n}."))
    for tmpl, items in EXTRA.items():  # hand-written first, so they win dedup
        for x in items:
            add(tmpl.format(x))
    with open(csv_path, newline="", encoding="utf-8") as f:
        oi = sorted({r["DisplayName"].strip().lower() for r in csv.DictReader(f)})
    # Common words only: long-tail names ("polydactyl cat", "umeboshi") outscore "cat"/"food" and split every
    # subject across rare words, so no word gathers enough photos to become a topic. Tuned on the eval album.
    for n in oi:
        if 2 < len(n) < 40 and not any(c.isdigit() for c in n) and wordfreq.zipf_frequency(n, "en") >= MIN_ZIPF:
            add(n)
    print(len(entries), "concepts")
    vecs = []
    with torch.no_grad():
        for i in range(0, len(entries), 512):
            ids = torch.tensor(token_ids(tok, [p for _, p in entries[i:i + 512]]), dtype=torch.long)
            e = m.encode_text(ids)
            vecs.append((e / e.norm(dim=-1, keepdim=True)).numpy())
    v = np.concatenate(vecs).astype(np.float32)
    # Row layout: float32 scale + 512 int8. Per-row scale keeps every concept at full int8 resolution.
    scale = np.abs(v).max(1) / 127
    q = np.round(v / scale[:, None]).astype(np.int8)
    NATIVE.mkdir(parents=True, exist_ok=True)
    with open(NATIVE / "vocab.bin", "wb") as f:
        for s, row in zip(scale, q):
            f.write(struct.pack("<f", s)); f.write(row.tobytes())
    (NATIVE / "vocab.json").write_text(json.dumps({"source": LICENSE_NOTE, "names": [n for n, _ in entries]}))
    print(f"  vocab.bin: {(NATIVE / 'vocab.bin').stat().st_size / 1e6:.1f} MB")
    build_concepts()


def build_concepts():
    """Weightless graph: scores = q . vocab^T, then TopK per row. The app feeds the dequantized vocab as an input,
    so this file never changes with the vocab. One ORT Gemm per batch instead of a scalar Kotlin loop."""
    import onnx
    from onnx import TensorProto as T, helper as h
    g = h.make_graph(
        [h.make_node("Gemm", ["q", "vocab"], ["scores"], transB=1),
         h.make_node("TopK", ["scores", "k"], ["values", "indices"], axis=-1)],
        "concepts",
        [h.make_tensor_value_info("q", T.FLOAT, ["n", 512]), h.make_tensor_value_info("vocab", T.FLOAT, ["rows", 512]),
         h.make_tensor_value_info("k", T.INT64, [1])],
        [h.make_tensor_value_info("values", T.FLOAT, ["n", "k"]), h.make_tensor_value_info("indices", T.INT64, ["n", "k"])])
    m = h.make_model(g, opset_imports=[h.make_opsetid("", 17)])
    m.ir_version = 8
    onnx.checker.check_model(m)
    onnx.save(m, NATIVE / "concepts.onnx")


def build_cities():
    z = fetch("https://download.geonames.org/export/dump/cities15000.zip", "cities15000.zip")
    info = fetch("https://download.geonames.org/export/dump/countryInfo.txt", "countryInfo.txt")
    countries = {}
    for line in info.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            c = line.split("\t"); countries[c[0]] = c[4]
    rows = []
    with zipfile.ZipFile(z) as zf, zf.open("cities15000.txt") as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            c = line.rstrip("\n").split("\t")
            # name, country code, lat, lon, population
            rows.append([c[1], c[8], round(float(c[4]), 3), round(float(c[5]), 3), int(c[14] or 0)])
    out = {"source": "GeoNames cities15000, CC BY 4.0, geonames.org", "countries": countries, "cities": rows}
    JS.mkdir(parents=True, exist_ok=True)
    (JS / "cities.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(len(rows), f"cities, {(JS / 'cities.json').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    steps = sys.argv[1:] or ["clip", "gpu", "vocab", "cities"]
    for s in steps:
        {"clip": build_clip, "gpu": build_gpu, "vocab": build_vocab, "concepts": build_concepts, "cities": build_cities, "bench": build_bench}[s]()
