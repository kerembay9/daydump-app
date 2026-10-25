"""Embed the VIST subset with one model: photos, DII descriptions, the app's concept prompts.
usage (repo root): [SPLIT=val] .venv/bin/python research/distill/embed_vist.py <key> -> scripts/.cache/distill/vist_emb[_val]/<key>.npz"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
CACHE = f"{REPO}/scripts/.cache"
SPLIT = os.environ.get("SPLIT", "test")
IMG = f"{REPO}/scripts/.cache/vist/{SPLIT}"
OC = f"{CACHE}/oc"  # stock open_clip 3.3 (unpacked wheel)
CLIP_MEAN, CLIP_STD = [0.48145466, 0.4578275, 0.40821073], [0.26862954, 0.26130258, 0.27577711]

# key -> (loader, id, input px)
MODELS = {
    "tc45": ("tinyclip", "45m", 224),
    "tc22": ("tinyclip", "22m", 224),
    "tc63": ("tinyclip", "63m", 224),
    "pet224": ("oc", "hf-hub:timm/PE-Core-T-16-384", 224),
    "pes224": ("oc", "hf-hub:timm/PE-Core-S-16-384", 224),
    "pes256": ("oc", "hf-hub:timm/PE-Core-S-16-384", 256),
    "pes384": ("oc", "hf-hub:timm/PE-Core-S-16-384", 384),
    "ovs16": ("oc", "hf-hub:UCSC-VLAA/openvision-vit-small-patch16-160", 160),
    "dat_cls": ("oc", "hf-hub:DatologyAI/cls-opt-vit-b-32", 224),
    "dat_retr": ("oc", "hf-hub:DatologyAI/retr-opt-vit-b-32", 224),
    "b32_256": ("oc", "hf-hub:laion/CLIP-ViT-B-32-256x256-DataComp-s34B-b86K", 256),
    # distillation teacher candidates (native sizes)
    "pel336": ("oc", "hf-hub:timm/PE-Core-L-14-336", 336),
    "sl2so384": ("oc", "hf-hub:timm/ViT-SO400M-16-SigLIP2-384", 384),
    "l14dc": ("oc", "hf-hub:laion/CLIP-ViT-L-14-DataComp.XL-s13B-b90K", 224),
}


def prep(args):
    """The app's path (build_assets.preprocess): shortest side -> r (bilinear), center crop, model mean/std."""
    f, r, mean, std = args
    from PIL import Image, ImageOps
    try:
        im = Image.open(f"{IMG}/{f}")
        im.draft("RGB", (r * 2, r * 2))  # JPEG DCT downscale (like a decoded thumbnail): ~10x faster
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception:
        return None
    s = r / min(im.size)
    im = im.resize((max(r, round(im.width * s)), max(r, round(im.height * s))), Image.BILINEAR)
    l, t = (im.width - r) // 2, (im.height - r) // 2
    a = np.asarray(im.crop((l, t, l + r, t + r)), dtype=np.float32) / 255
    return ((a - mean) / std).transpose(2, 0, 1).astype(np.float32)


def load(key, dev):
    """-> model on dev, texts -> token tensor on dev, px, mean, std"""
    import torch
    kind, mid, r = MODELS[key]
    if kind == "tinyclip":
        sys.path.insert(0, f"{REPO}/scripts")
        import build_assets as B
        B.MODELS["63m"] = ("TinyCLIP-auto-ViT-63M-32-Text-31M", "LAIONYFCC400M")
        m, tok, _ = B.load_model(mid)
        return m.to(dev), lambda t: torch.tensor(B.token_ids(tok, t)).to(dev), r, np.float32(CLIP_MEAN), np.float32(CLIP_STD)
    sys.path.insert(0, OC)
    import open_clip
    m, _, pp = open_clip.create_model_and_transforms(mid)
    tok = open_clip.get_tokenizer(mid)
    if hasattr(m.visual, "trunk") and hasattr(m.visual.trunk, "set_input_size"):
        m.visual.trunk.set_input_size(img_size=(r, r))  # PE: resized RoPE/pos-emb grid
    norm = [t for t in pp.transforms if t.__class__.__name__ == "Normalize"][0]
    return m.to(dev), lambda t: tok(t).to(dev), r, np.float32(norm.mean), np.float32(norm.std)


def unit(x):
    return (x / x.norm(dim=-1, keepdim=True)).cpu().numpy().astype(np.float32)


if __name__ == "__main__":
    import torch
    key, dev = sys.argv[1], "cuda"
    dii = json.load(open(f"{CACHE}/vist/ann/dii/{SPLIT}.description-in-isolation.json"))["annotations"]
    vocab = json.load(open(f"{REPO}/modules/clip-embedder/android/src/main/assets/clip/vocab.json"))["names"]
    files = sorted(os.listdir(IMG))
    m, tok, r, mean, std = load(key, dev)
    m.eval()
    with Pool() as p:
        pix = p.map(prep, [(f, r, mean, std) for f in files], chunksize=16)
    ok = [i for i, x in enumerate(pix) if x is not None]
    ids = [files[i].rsplit(".", 1)[0] for i in ok]
    pix = np.stack([pix[i] for i in ok])
    have = set(ids)
    q = [(a[0]["photo_flickr_id"], a[0]["text"]) for a in dii if a[0]["photo_flickr_id"] in have]
    prompts = [f"a photo of {n}." for n in vocab]  # build_assets' concept prompt
    with torch.no_grad():
        img = torch.cat([m.encode_image(torch.from_numpy(pix[i:i + 32]).to(dev)).float() for i in range(0, len(pix), 32)])
        txt = lambda t: torch.cat([m.encode_text(tok(t[i:i + 512])).float() for i in range(0, len(t), 512)])
        qe, ce = txt([t for _, t in q]), txt(prompts)
    os.makedirs(f"{CACHE}/distill/vist_emb{'' if SPLIT == 'test' else '_' + SPLIT}", exist_ok=True)
    np.savez(f"{CACHE}/distill/vist_emb{'' if SPLIT == 'test' else '_' + SPLIT}/{key}.npz", ids=np.array(ids), img=unit(img), q_photo=np.array([p for p, _ in q]),
             q=unit(qe), concepts=unit(ce))
    print(key, f"@{r}", len(ids), "photos", len(q), "queries", flush=True)
