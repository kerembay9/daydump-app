"""Build on-device ML/geo assets. Outputs are gitignored (big) except cities.json + clipGolden.json.

Setup:  python -m venv --system-site-packages .venv && .venv/bin/pip install onnx onnxruntime onnxscript
        (needs torch + transformers already installed)
Run:    .venv/bin/python scripts/build_assets.py [clip] [vocab] [cities]   (no args = all)

clip   - TinyCLIP 40M/32 (MIT) -> int8 ONNX vision + text towers, tokenizer.json, golden vectors
vocab  - Open Images V7 class names (CC BY 4.0) + hand-written concepts -> int8 text embeddings
cities - GeoNames cities15000 (CC BY 4.0) -> compact cities.json for offline reverse geocoding
"""
import csv, io, json, os, struct, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "modules/clip-embedder/android/src/main/assets/clip"
JS = ROOT / "src/services/index"
CACHE = ROOT / "scripts/.cache"  # downloads; gitignored
MODEL = "wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M"
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
LICENSE_NOTE = "Open Images V7 class names (CC BY 4.0, Google LLC) + hand-written concepts"


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    if not p.exists():
        print("downloading", url)
        urllib.request.urlretrieve(url, p)
    return p


def load_model():
    from transformers import CLIPModel, CLIPTokenizerFast
    m = CLIPModel.from_pretrained(MODEL).eval()
    from huggingface_hub import hf_hub_download
    tok_file = hf_hub_download(MODEL, "tokenizer.json")
    return m, CLIPTokenizerFast(tokenizer_file=tok_file), tok_file


def token_ids(tok, texts):
    out = []
    for t in texts:
        ids = tok(t)["input_ids"][:CTX]  # [SOT, ..., EOT]
        ids[-1] = EOT
        out.append(ids + [EOT] * (CTX - len(ids)))  # pad with EOT; pooling takes the first EOT (argmax)
    return out


def preprocess(path):
    """Mirror of the Kotlin path: shortest side -> 224, center crop, CLIP mean/std."""
    import numpy as np
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    s = 224 / min(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.BILINEAR)
    l, t = (im.width - 224) // 2, (im.height - 224) // 2
    a = np.asarray(im.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255
    a = (a - [0.48145466, 0.4578275, 0.40821073]) / [0.26862954, 0.26130258, 0.27577711]
    return a.transpose(2, 0, 1)[None].astype(np.float32)


def build_clip():
    import numpy as np, torch, onnx, onnxruntime as ort, shutil
    from onnxruntime.quantization import quantize_dynamic, QuantType
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    m, tok, tok_file = load_model()
    m.requires_grad_(False)

    class Vision(torch.nn.Module):
        def __init__(self): super().__init__(); self.m = m
        def forward(self, pixel_values):
            e = self.m.get_image_features(pixel_values=pixel_values)
            return e / e.norm(dim=-1, keepdim=True)

    class Text(torch.nn.Module):
        def __init__(self): super().__init__(); self.m = m
        def forward(self, input_ids):
            e = self.m.get_text_features(input_ids=input_ids)
            return e / e.norm(dim=-1, keepdim=True)

    NATIVE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / "fp32"; tmp.mkdir(parents=True, exist_ok=True)
    pix = torch.from_numpy(preprocess(GOLDEN_IMAGE))
    ids = torch.tensor(token_ids(tok, GOLDEN_PHRASES), dtype=torch.long)
    for name, mod, x, inp in [("vision", Vision(), pix, "pixel_values"), ("text", Text(), ids, "input_ids")]:
        f32 = tmp / f"{name}.onnx"
        torch.onnx.export(mod, (x,), f32, input_names=[inp], output_names=["embeds"], opset_version=17,
                          dynamic_axes={inp: {0: "n"}, "embeds": {0: "n"}}, dynamo=False)
        # Weight-only int8 MatMuls (activations stay fp32): full int8 dynamic quant dropped text cosine to ~0.8.
        q = MatMulNBitsQuantizer(onnx.load(f32), bits=8, block_size=32, is_symmetric=True); q.process()
        out = NATIVE / f"{name}.onnx"
        q.model.save_model_to_file(str(tmp / f"{name}.nbits.onnx"), False)
        if name == "text":  # the 49408x512 token embedding is most of the text tower: int8 Gather
            quantize_dynamic(tmp / f"{name}.nbits.onnx", out, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"])
        else:
            shutil.copy(tmp / f"{name}.nbits.onnx", out)

    def run(path, inp, x):
        return ort.InferenceSession(str(path)).run(None, {inp: x})[0]

    with torch.no_grad():
        ref_t, ref_v = Text()(ids).numpy(), Vision()(pix).numpy()
    q_t = run(NATIVE / "text.onnx", "input_ids", ids.numpy())
    q_v = run(NATIVE / "vision.onnx", "pixel_values", pix.numpy())
    cos_t = (ref_t * q_t).sum(-1)
    cos_v = float((ref_v * q_v).sum())
    print("int8 vs fp32 cosine  text:", cos_t.round(4), " image:", round(cos_v, 4))
    assert cos_t.min() > 0.98 and cos_v > 0.98, "int8 quantization drifted too far"

    shutil.copy(tok_file, NATIVE / "tokenizer.json")
    JS.mkdir(parents=True, exist_ok=True)
    golden = {"phrases": GOLDEN_PHRASES, "ids": ids.tolist(), "text": q_t.round(5).tolist(),
              "image": {"file": GOLDEN_IMAGE.name, "vec": q_v[0].round(5).tolist()}}
    (JS / "clipGolden.json").write_text(json.dumps(golden))
    for f in NATIVE.iterdir():
        print(f"  {f.name}: {f.stat().st_size / 1e6:.1f} MB")


def build_vocab():
    import numpy as np, torch
    m, tok, _ = load_model()
    csv_path = fetch("https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv", "oidv7-class-descriptions.csv")
    names = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            n = row["DisplayName"].strip()
            if 2 < len(n) < 40 and not any(c.isdigit() for c in n):
                names.add(n.lower())
    entries = [(n, f"a photo of {n}.") for n in sorted(names)]
    for tmpl, items in EXTRA.items():
        entries += [(tmpl.format(x), "a photo of " + tmpl.format(x) + ".") for x in items]
    print(len(entries), "concepts")
    vecs = []
    with torch.no_grad():
        for i in range(0, len(entries), 512):
            ids = torch.tensor(token_ids(tok, [p for _, p in entries[i:i + 512]]), dtype=torch.long)
            e = m.get_text_features(input_ids=ids)
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
    steps = sys.argv[1:] or ["clip", "vocab", "cities"]
    for s in steps:
        {"clip": build_clip, "vocab": build_vocab, "cities": build_cities}[s]()
