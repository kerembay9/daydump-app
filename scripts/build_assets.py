"""Build on-device ML/geo assets. Outputs are gitignored (big) except cities.json + clipGolden.json.

Setup:  python -m venv --system-site-packages .venv && .venv/bin/pip install wordfreq ftfy regex litert-torch ai-edge-quantizer torchvision timm
        (needs torch + transformers already installed; the TinyCLIP open_clip fork is cloned on first run)
Run:    .venv/bin/python scripts/build_assets.py [clip] [phrases] [gpu] [vocab] [concepts] [cities] [bench] [yunet] [sface] [gate] [fonts]   (no args = all but bench)

clip   - TinyCLIP (MIT, see MODELS) -> LiteRT text.tflite (int8 weights, CPU) + tokenizer.json (both the textpack asset pack), golden vectors,
         phrases.json (FIXED_PHRASES embedded, so they work before the pack arrives)
gpu    - the same vision tower -> LiteRT vision_dw8.tflite (int8 weights, CPU; visionpack) + vision_gpu.skel (bundled) (the phone rebuilds the fp16 GPU model
         from both, see gpu_skel). vision_dw8 is the CPU helper
         (and the fallback when the GPU can't run). Everything runs on LiteRT; there is no ONNX Runtime in the app.
vocab  - Open Images V7 class names (CC BY 4.0) + hand-written concepts -> text embeddings -> concepts.tflite (visionpack)
cities - GeoNames cities15000 (CC BY 4.0) -> compact cities.json for offline reverse geocoding
bench  - int8 LiteRT vision towers of the other MODELS, for the index bench (prints the adb commands to push them)
yunet  - YuNet face detector (OpenCV Zoo, MIT) -> LiteRT yunet_320.tflite (bundled, findSelfies) + yunet_640 for the face bench (prints the adb commands)
gate   - MobileNetV3-Small (timm, Apache 2.0) -> LiteRT gate.tflite (bundled): the selfie step's "not a selfie" score before visionpack
fonts  - Inter (OFL, @expo-google-fonts) cut to Latin + punctuation/symbols -> assets/fonts (1.4 -> 0.6 MB). Other scripts
         fall back per glyph to the system font; __tests__/fonts.test.ts fails if a string the app ships needs a dropped glyph
sface  - SFace face recognition (OpenCV Zoo, Apache 2.0) -> LiteRT sface.tflite (facepack; int8 weights, high-res per-channel): 112x112 aligned face -> L2-normalized 128-d
"""
import csv, io, json, os, struct, subprocess, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "modules/clip-embedder/android/src/main/assets/clip"
# Play asset packs, downloaded after the install in this order (ModelPacks.kt); debug builds carry them in the APK.
VPACK = ROOT / "modules/clip-embedder/android/visionpack/src/main/assets/clip"
FPACK = ROOT / "modules/clip-embedder/android/facepack/src/main/assets/clip"
PACK = ROOT / "modules/clip-embedder/android/textpack/src/main/assets/clip"
JS = ROOT / "src/services/index"
CACHE = ROOT / "scripts/.cache"  # downloads; gitignored
VOCAB = CACHE / "vocab.bin"  # concept text embeddings, rows of [float32 scale][512 x int8]; baked into concepts.tflite
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
# The selfie finder's queries (src/services/selfie.ts), shipped as vectors: findSelfies works without the text model.
FIXED_PHRASES = ["a selfie of a person, close-up face", "a sharp, in-focus photo", "a blurry, out-of-focus photo"]

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
    p = CACHE / name
    p.parent.mkdir(parents=True, exist_ok=True)
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
                e = self.m.encode_text(input_ids.int())  # int32: LiteRT has no int64 arg_max (the EOT pick)
                return e / e.norm(dim=-1, keepdim=True)

        self.vision, self.text = Vision(), Text()


def export_tflite(mod, x, out, rp=None, floor=0.98):
    """torch module -> LiteRT, batch 1 (exported on x[:1]), quantized with recipe rp (default: dynamic int8 weights,
    for XNNPACK on the CPU) and checked against torch on every row of x. Returns the LiteRT outputs for x."""
    import numpy as np, torch, litert_torch
    from ai_edge_quantizer import quantizer, recipe
    from ai_edge_litert.interpreter import Interpreter
    with torch.no_grad():
        ref = mod(x).numpy()
    f32 = CACHE / "fp32" / f"{out.stem}.tflite"; f32.parent.mkdir(parents=True, exist_ok=True)
    litert_torch.convert(mod.eval(), (x[:1],)).export(str(f32))
    q = quantizer.Quantizer(str(f32)); q.load_quantization_recipe(rp or recipe.dynamic_wi8_afp32())
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(q.quantize().quantized_model)
    it = Interpreter(model_path=str(out)); it.allocate_tensors()
    got = []
    for row in x.numpy():
        inp = it.get_input_details()[0]
        it.set_tensor(inp["index"], row[None].astype(inp["dtype"])); it.invoke()  # int64 ids come in as int32
        got.append(it.get_tensor(it.get_output_details()[0]["index"])[0].copy())
    got = np.stack(got)
    cos = (ref * got).sum(-1) / np.linalg.norm(ref, axis=-1) / np.linalg.norm(got, axis=-1)
    print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB, vs torch cosine min {cos.min():.5f}")
    assert cos.min() > floor, f"{out.name}: LiteRT export drifted"
    return got


def build_clip():
    import torch, shutil
    m, tok, tok_file = load_model()
    t = Towers(m)
    pix = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    ids = torch.tensor(token_ids(tok, GOLDEN_PHRASES), dtype=torch.long)
    with torch.no_grad():
        q_v = t.vision(pix).numpy()  # fp32 reference: the GPU's fp16 tower matches it to cosine 1.0
    q_t = export_tflite(t.text, ids, PACK / "text.tflite")
    shutil.copy(tok_file, PACK / "tokenizer.json")
    JS.mkdir(parents=True, exist_ok=True)
    golden = {"model": "-".join(MODELS[SHIPPED]), "phrases": GOLDEN_PHRASES, "ids": ids.tolist(), "text": q_t.round(5).tolist(),
              "image": {"file": GOLDEN_IMAGE.name, "vec": q_v[0].round(5).tolist()}}
    (JS / "clipGolden.json").write_text(json.dumps(golden))
    build_phrases()


def build_phrases():
    import base64, numpy as np
    from transformers import CLIPTokenizerFast
    from ai_edge_litert.interpreter import Interpreter
    tok = CLIPTokenizerFast(tokenizer_file=str(PACK / "tokenizer.json"))
    it = Interpreter(model_path=str(PACK / "text.tflite")); it.allocate_tensors()
    inp, out = it.get_input_details()[0], it.get_output_details()[0]
    vecs = {}
    for p, ids in zip(FIXED_PHRASES, token_ids(tok, FIXED_PHRASES)):
        it.set_tensor(inp["index"], np.array([ids], dtype=inp["dtype"])); it.invoke()
        vecs[p] = base64.b64encode(it.get_tensor(out["index"])[0].astype("<f4").tobytes()).decode()
    (NATIVE / "phrases.json").write_text(json.dumps(vecs))
    print(f"  phrases.json: {len(vecs)} phrases")


def build_gpu():
    """Vision tower for the Mali GPU delegate (LiteRT CompiledModel), batch 1, same weights with the forward rewritten:
    the delegate rejects TinyCLIP's 3D class-token concat and 2D broadcasts, and fails "Unrecognized Write selector" on
    any batch > 1 (tried NLD, batch-first 4D and all-2D graphs). Output is NOT L2-normalized (the converter turns that
    into L2_NORMALIZATION, CPU-only); Kotlin does it. int8 weights don't compile on the GPU, so fp16 (cosine 1.0 vs fp32)."""
    import numpy as np, torch, torch.nn.functional as F, litert_torch
    from ai_edge_quantizer import quantizer, recipe, recipe_manager, algorithm_manager
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
    # vision_dw8: int8 weights, fp32 math (XNNPACK quantizes activations per run), for the CPU helping the GPU.
    # The fp16 vision.tflite isn't shipped: the phone builds its GPU twin from vision_dw8 (gpu_skel). It stays in the cache.
    gpu = CACHE / "gpu"; gpu.mkdir(parents=True, exist_ok=True); VPACK.mkdir(parents=True, exist_ok=True)
    for name, rp, floor in [("vision", rm.get_quantization_recipe(), 0.999), ("vision_dw8", recipe.dynamic_wi8_afp32(), 0.98),
                            ("vision_from_dw8", None, 0.98)]:
        out = (VPACK if name == "vision_dw8" else gpu) / f"{name}.tflite"
        if rp:
            q = quantizer.Quantizer(str(f32)); q.load_quantization_recipe(rp)
            out.write_bytes(q.quantize().quantized_model)
        else:
            out.write_bytes(gpu_skel(gpu / "vision.tflite", VPACK / "vision_dw8.tflite", NATIVE / "vision_gpu.skel"))
        it = Interpreter(model_path=str(out)); it.allocate_tensors()
        it.set_tensor(it.get_input_details()[0]["index"], x.numpy()); it.invoke()
        e = it.get_tensor(it.get_output_details()[0]["index"])[0]
        cos = float(ref @ e / np.linalg.norm(e))
        print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB, vs torch cosine {cos:.5f}")
        assert cos > floor, "LiteRT export drifted"


def gpu_skel(fp16, dw8, skel):
    """The GPU model rebuilt from dw8: each fp16 weight becomes fp16(int8 * its row's scale), as VisionGpu.kt does on the
    phone. Writes skel: int32 big-endian [b"DDG1", CRC32 of the result, n, n x (offset, count, rows, dw8 offset, dw8
    scales offset)], then fp16 with those n weights zeroed (deflated in the APK: ~0.5 MB for 90). Saves ~84 MB of
    download, and GPU and CPU photos share weights. COCO 5k R@1 36.9 vs 37.0 fp32 (dw8 36.8). Returns the result."""
    import zlib, numpy as np
    from ai_edge_litert import schema_py_generated as S

    def load(p):
        b = p.read_bytes(); m = S.Model.GetRootAs(b, 0); sg = m.Subgraphs(0)
        return b, m, {sg.Tensors(i).Name(): sg.Tensors(i) for i in range(sg.TensorsLength())}
    fb, f, ft = load(fp16)
    db, d, dt = load(dw8)
    built, zeroed, rows = bytearray(fb), bytearray(fb), []
    for name, x in ft.items():
        if x.Type() != S.TensorType.FLOAT16:
            continue
        y = dt[name]; q = y.Quantization(); bf, bd = f.Buffers(x.Buffer()), d.Buffers(y.Buffer())
        assert y.Type() == S.TensorType.INT8 and q.QuantizedDimension() == 0 and not q.ZeroPointAsNumpy().any()
        n, s = q.ScaleLength(), q._tab.Vector(q._tab.Offset(8))  # QuantizationParameters.scale
        assert (np.frombuffer(db, "<f4", n, s) == q.ScaleAsNumpy()).all()
        w = np.frombuffer(db, np.int8, bd.Size(), bd.Offset()).reshape(n, -1)
        built[bf.Offset():bf.Offset() + bf.Size()] = (w.astype(np.float32) * q.ScaleAsNumpy()[:, None]).astype(np.float16).tobytes()
        zeroed[bf.Offset():bf.Offset() + bf.Size()] = bytes(bf.Size())
        rows += [bf.Offset(), w.size, n, bd.Offset(), s]
    skel.write_bytes(b"DDG1" + struct.pack(f">Ii{len(rows)}i", zlib.crc32(built), len(rows) // 5, *rows) + zeroed)
    return bytes(built)


def build_bench():
    """Vision towers of the non-shipped models (dynamic int8, engine cpu8). The bench loads files/models/vision_<name>.tflite."""
    import torch
    pix = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    for name in MODELS:
        if name == SHIPPED:
            continue
        f = CACHE / "bench" / f"vision_{name}.tflite"
        export_tflite(Towers(load_model(name)[0]).vision, pix, f)
        print(f"  adb push {f} /data/local/tmp/ && adb shell \"run-as com.horizonzeta.picdump sh -c 'mkdir -p files/models && "
              f"cat /data/local/tmp/{f.name} > files/models/{f.name}'\"")


YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
YUNET_SIZES = (320, 640)


def yunet_input(path, size):
    """Letterbox as the app does: longest side -> size, padded bottom/right with black. Returns ([1,size,size,3] RGB 0-255, scale)."""
    import numpy as np
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    k = size / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BILINEAR)
    x = np.zeros((1, size, size, 3), np.float32)
    x[0, :im.height, :im.width] = np.asarray(im, np.float32)
    return x, k


def build_yunet():
    """YuNet 2023mar, any input size (its reshapes are -1 and its upsampling is by scale). The graph takes [1,S,S,3] RGB 0-255
    and returns [N,15] rows of (score, cx, cy, w, h, then 5 landmarks as x, y) in input pixels, decoded as OpenCV's
    FaceDetectorYN does, so the app only thresholds and merges overlaps."""
    import shutil
    import numpy as np, onnx, onnxruntime, torch, litert_torch
    from onnx2torch import convert
    from ai_edge_litert.interpreter import Interpreter
    src = fetch(YUNET_URL, "yunet/face_detection_yunet_2023mar.onnx")

    class Up2(torch.nn.Module):
        def forward(self, x, *_):
            return torch.nn.functional.interpolate(x, scale_factor=2, mode="nearest")

    class Fixed(torch.nn.Module):
        def __init__(self, shape):
            super().__init__(); self.shape = shape

        def forward(self, x, *_):
            return x.reshape(self.shape)

    class YuNet(torch.nn.Module):
        def __init__(self, size):
            super().__init__()
            self.net = convert(onnx.load(str(src)))
            # onnx2torch's Resize and Reshape read their constant scale / shape at runtime, which export can't trace: bake them in
            for node in self.net.graph.nodes:
                kind = type(getattr(self.net, node.target, None)).__name__ if node.op == "call_module" else ""
                if kind == "OnnxResize":
                    setattr(self.net, node.target, Up2())
                elif kind == "OnnxReshape":
                    shape = node.args[1]
                    setattr(self.net, node.target, Fixed(tuple(self.net.get_buffer(shape.target).tolist()
                                                               if shape.op == "get_attr" else shape)))
            pri = []  # (col, row, stride) per output cell, strides 8 / 16 / 32 in output order
            for st in (8, 16, 32):
                n = size // st
                r, c = torch.meshgrid(torch.arange(n), torch.arange(n), indexing="ij")
                pri.append(torch.stack([c.flatten(), r.flatten(), torch.full((n * n,), st)], 1))
            self.register_buffer("pri", torch.cat(pri).float())

        def forward(self, x):
            o = self.net(x.permute(0, 3, 1, 2).flip(1))  # the model wants BGR NCHW, 0-255
            cls, obj, box = (torch.cat(o[i:i + 3], 1)[0] for i in (0, 3, 6))
            score = (cls.clamp(0, 1) * obj.clamp(0, 1)).sqrt()[:, 0]
            st = self.pri[:, 2]
            kps = torch.cat(o[9:12], 1)[0]  # 5 landmarks (right eye, left eye, nose, right / left mouth corner) as cell offsets
            kx = (kps[:, 0::2] + self.pri[:, 0:1]) * st[:, None]
            ky = (kps[:, 1::2] + self.pri[:, 1:2]) * st[:, None]
            return torch.cat([torch.stack([score, (self.pri[:, 0] + box[:, 0]) * st, (self.pri[:, 1] + box[:, 1]) * st,
                                           box[:, 2].exp() * st, box[:, 3].exp() * st], 1),
                              torch.stack([kx, ky], 2).flatten(1)], 1)

    face = ROOT / ".maestro/.cache/photos/dd_005.jpg"  # a close-up face from the e2e photo set
    for size in YUNET_SIZES:
        x, _ = yunet_input(face if face.exists() else GOLDEN_IMAGE, size)
        mod = YuNet(size).eval()
        out = CACHE / "bench" / f"yunet_{size}.tflite"; out.parent.mkdir(parents=True, exist_ok=True)
        litert_torch.convert(mod, (torch.from_numpy(x),)).export(str(out))
        # the raw ONNX model's scores (any size works in ORT too) vs the exported graph's
        m = onnx.load(str(src))
        for d in m.graph.input[0].type.tensor_type.shape.dim[2:]:
            d.dim_param = "s"
        sess = onnxruntime.InferenceSession(m.SerializeToString())
        raw = sess.run(None, {"input": np.ascontiguousarray(x.transpose(0, 3, 1, 2)[:, ::-1])})
        ref = np.sqrt(np.clip(np.concatenate(raw[0:3], 1), 0, 1) * np.clip(np.concatenate(raw[3:6], 1), 0, 1))[0, :, 0]
        it = Interpreter(model_path=str(out)); it.allocate_tensors()
        it.set_tensor(it.get_input_details()[0]["index"], x); it.invoke()
        got = it.get_tensor(it.get_output_details()[0]["index"])
        err = np.abs(got[:, 0] - ref).max()
        print(f"  {out.name}: {out.stat().st_size / 1e6:.2f} MB, best face score {got[:, 0].max():.3f}, max score diff vs ONNX {err:.4f}")
        assert err < 1e-3, f"{out.name}: export drifted"
        if size == 320:
            shutil.copy(out, NATIVE / out.name)
        print(f"  adb push {out} /data/local/tmp/ && adb shell \"run-as com.horizonzeta.picdump sh -c 'mkdir -p files/models && "
              f"cat /data/local/tmp/{out.name} > files/models/{out.name}'\"")


SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
# OpenCV's FaceRecognizerSF alignment target: the 5 YuNet landmarks in a 112x112 crop
SFACE_TEMPLATE = [(38.2946, 51.6963), (73.5318, 51.5014), (56.0252, 71.7366), (41.5493, 92.3655), (70.7299, 92.2041)]


def build_sface():
    """SFace 2021dec. The graph takes [1,112,112,3] RGB 0-255 (a face aligned to SFACE_TEMPLATE, as FaceRecognizerSF.alignCrop
    does) and returns the L2-normalized 128-d feature: same person when cosine > 0.363 (OpenCV's threshold)."""
    import numpy as np, onnx, onnxruntime, torch
    from onnx2torch import convert
    from ai_edge_quantizer import recipe
    src = fetch(SFACE_URL, "sface/face_recognition_sface_2021dec.onnx")

    class SFace(torch.nn.Module):
        def __init__(self):
            super().__init__(); self.net = convert(onnx.load(str(src)))

        def forward(self, x):
            f = self.net(x.permute(0, 3, 1, 2))
            return f / (f * f).sum(-1, keepdim=True).sqrt()  # no L2_NORMALIZATION op: keeps the graph plain

    rng = np.random.default_rng(0)
    x = torch.from_numpy(rng.uniform(0, 255, (4, 112, 112, 3)).astype(np.float32))
    out = FPACK / "sface.tflite"; FPACK.mkdir(parents=True, exist_ok=True)
    # plain int8 weights drift to cosine 0.955 on a real face vs OpenCV; Hadamard-rotated int8 (the FCs) stays at 1.000.
    # The rotation doesn't take convs, so they get fp16 weights (fp32 math), and so does its +-1/32 rotation matrix
    # (exact in fp16) in a second pass: 23.5 -> 15.1 MB; 30 vs 29 flipped same-person pairs of 104k vs fp32.
    from ai_edge_quantizer import quantizer, recipe_manager, algorithm_manager
    from ai_edge_quantizer.qtyping import TFLOperationName
    def fp16(regex, op):
        rm = recipe_manager.RecipeManager()
        rm.add_weight_only_config(regex=regex, operation_name=op, num_bits=16, algorithm_key=algorithm_manager.AlgorithmName.FLOAT_CASTING)
        return rm.get_quantization_recipe()
    hr = recipe.dynamic_wi8c_hr_afp32(); hr[0]["operation"] = "FULLY_CONNECTED"
    got = export_tflite(SFace().eval(), x, out, fp16(".*", TFLOperationName.ALL_SUPPORTED) + hr, floor=0.999)
    q = quantizer.Quantizer(str(out)); q.load_quantization_recipe(fp16(".*_rotated", TFLOperationName.FULLY_CONNECTED))
    out.write_bytes(q.quantize().quantized_model)
    print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB with an fp16 rotation")
    sess = onnxruntime.InferenceSession(str(src))
    ref = np.concatenate([sess.run(None, {"data": r[None].transpose(0, 3, 1, 2)})[0] for r in x.numpy()])
    ref /= np.linalg.norm(ref, axis=-1, keepdims=True)
    print(f"  vs ONNX cosine min {(ref * got).sum(-1).min():.4f}")


def build_gate():
    """The selfie step's "not a selfie" gate before visionpack lands: MobileNetV3-Small (timm mobilenetv3_small_100.lamb_in1k,
    Apache 2.0, ImageNet) with its softmax summed over GATE_REJECT in the graph. Takes [1,224,224,3] RGB 0-255 (the photo's
    shorter side scaled to 256, center 224) and returns [1,1025]: P(document, screen or pet), then the L2-normalized 1024-d
    pre-logits feature (near-copy check: a burst copy > 0.90). Bundled: clip/gate.tflite (fp16 weights)."""
    import numpy as np, timm, torch
    from timm.data import ImageNetInfo
    net = timm.create_model("mobilenetv3_small_100.lamb_in1k", pretrained=True).eval()
    desc = [ImageNetInfo().index_to_description(i) for i in range(1000)]
    rej = sorted(set(range(151, 269)) | set(range(281, 286)) | {i for i, d in enumerate(desc) if any(d.startswith(w) or ", " + w in d for w in GATE_REJECT)})
    print(f"  {len(rej)} reject classes")

    class Gate(torch.nn.Module):
        def __init__(self):
            super().__init__(); self.net = net
            self.register_buffer("mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1) * 255)
            self.register_buffer("std", torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1) * 255)
            self.register_buffer("rej", torch.zeros(1000).index_fill_(0, torch.tensor(rej), 1.0))

        def forward(self, x):
            f = self.net.forward_head(self.net.forward_features((x.permute(0, 3, 1, 2) - self.mean) / self.std), pre_logits=True)
            p = self.net.classifier(f).softmax(-1)
            return torch.cat([(p * self.rej).sum(-1, keepdim=True), f / f.norm(dim=-1, keepdim=True)], -1)

    from PIL import Image
    im = Image.open(GOLDEN_IMAGE).convert("RGB"); s = 256 / min(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.BILINEAR)
    l, t = (im.width - 224) // 2, (im.height - 224) // 2
    real = np.asarray(im.crop((l, t, l + 224, t + 224)), dtype=np.float32)[None]
    x = torch.from_numpy(np.concatenate([real, np.random.default_rng(0).uniform(0, 255, (3, 224, 224, 3)).astype(np.float32)]))
    m = Gate().eval()
    with torch.no_grad():
        ref = m(x).numpy()
    # fp16 weights, fp32 math: dynamic int8 moves P by up to 0.9 (19/30 pets pass, 13 more selfies drop on the test set)
    from ai_edge_quantizer import recipe_manager, algorithm_manager
    from ai_edge_quantizer.qtyping import TFLOperationName
    rm = recipe_manager.RecipeManager()
    rm.add_weight_only_config(regex=".*", operation_name=TFLOperationName.ALL_SUPPORTED, num_bits=16, algorithm_key=algorithm_manager.AlgorithmName.FLOAT_CASTING)
    got = export_tflite(m, x, NATIVE / "gate.tflite", rm.get_quantization_recipe(), floor=-1)  # P checked by its value below
    cos = (ref[:, 1:] * got[:, 1:]).sum(-1)
    print(f"  reject P vs torch: max diff {np.abs(ref[:, 0] - got[:, 0]).max():.4f} (torch {ref[:, 0].round(3)}), feature cosine min {cos.min():.5f}")
    assert np.abs(ref[:, 0] - got[:, 0]).max() < 0.02 and cos.min() > 0.999, "gate.tflite drifted"


# ImageNet classes the gate rejects besides dogs (151-268) and cats (281-285): documents, screens, signs (an ID card lands on these).
GATE_REJECT = ["web site", "envelope", "menu", "book jacket", "comic book", "crossword", "packet", "binder", "notebook", "monitor", "screen, CRT",
               "television", "home theater", "desktop computer", "laptop", "iPod", "cellular telephone", "hand-held computer", "scoreboard", "street sign",
               "jigsaw puzzle", "bookshop", "library", "toyshop", "cinema", "theater curtain", "window shade", "mailbox", "slide rule", "rule,", "Band Aid"]


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
    with open(VOCAB, "wb") as f:
        for s, row in zip(scale, q):
            f.write(struct.pack("<f", s)); f.write(row.tobytes())
    (NATIVE / "vocab.json").write_text(json.dumps({"source": LICENSE_NOTE, "names": [n for n, _ in entries]}))
    print(f"  vocab.bin: {VOCAB.stat().st_size / 1e6:.1f} MB")
    build_concepts()


def build_concepts():
    """scores = q . vocab^T for one vector (the app takes the top k): the vocab as fp16 weights of one FULLY_CONNECTED,
    fp32 math. Dynamic int8 would quantize q per run and reorder close concepts."""
    import numpy as np, torch
    from ai_edge_quantizer import recipe_manager, algorithm_manager
    from ai_edge_quantizer.qtyping import TFLOperationName
    raw = np.fromfile(VOCAB, dtype=np.uint8).reshape(-1, 4 + 512)
    v = raw[:, 4:].copy().view(np.int8).astype(np.float32) * raw[:, :4].copy().view("<f4")
    w = torch.from_numpy(v)

    class Concepts(torch.nn.Module):
        def forward(self, q):
            return torch.nn.functional.linear(q, w)

    rm = recipe_manager.RecipeManager()
    rm.add_weight_only_config(regex=".*", operation_name=TFLOperationName.ALL_SUPPORTED, num_bits=16,
                              algorithm_key=algorithm_manager.AlgorithmName.FLOAT_CASTING)
    q = torch.from_numpy(v[:8] / np.linalg.norm(v[:8], axis=-1, keepdims=True))
    export_tflite(Concepts(), q, VPACK / "concepts.tflite", rm.get_quantization_recipe(), floor=0.9999)


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


# Latin incl. Turkish/Azerbaijani/Vietnamese, IPA, modifiers (ʻ), combining marks, then punctuation, currency, letterlike, arrows, math, shapes, symbols, dingbats.
FONT_RANGES = [(0x0, 0x36F), (0x1E00, 0x1EFF), (0x2000, 0x22FF), (0x25A0, 0x27BF)]
# Source Serif 4 stays whole: its OFL reserves the name "Source", so a cut copy would have to be renamed.
FONTS = ["inter/400Regular/Inter_400Regular", "inter/500Medium/Inter_500Medium", "inter/600SemiBold/Inter_600SemiBold", "inter/700Bold/Inter_700Bold"]


def build_fonts():
    from fontTools import subset
    from fontTools.ttLib import TTFont
    out = ROOT / "assets/fonts"
    out.mkdir(exist_ok=True)
    for f in FONTS:
        font = TTFont(ROOT / "node_modules/@expo-google-fonts" / f"{f}.ttf")
        o = subset.Options()
        o.name_IDs, o.name_languages, o.notdef_outline = ["*"], ["*"], True  # names (incl. license) and .notdef kept whole
        s = subset.Subsetter(o)
        s.populate(unicodes=[c for c in font.getBestCmap() if any(a <= c <= b for a, b in FONT_RANGES)])
        s.subset(font)
        font.save(out / f"{Path(f).name}.ttf")
    print(f"fonts: {sum(p.stat().st_size for p in out.glob('*.ttf')) / 1e6:.2f} MB")


if __name__ == "__main__":
    steps = sys.argv[1:] or ["clip", "gpu", "vocab", "cities", "yunet", "sface", "gate", "fonts"]
    for s in steps:
        {"clip": build_clip, "phrases": build_phrases, "gpu": build_gpu, "vocab": build_vocab, "concepts": build_concepts, "cities": build_cities, "bench": build_bench, "yunet": build_yunet, "sface": build_sface, "gate": build_gate, "fonts": build_fonts}[s]()
