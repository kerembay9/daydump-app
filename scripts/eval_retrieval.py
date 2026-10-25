"""Text -> photo search accuracy on everyday photos: COCO 5k test (Karpathy split), the standard retrieval benchmark.

Two ground truths:
- COCO: 25,000 human captions, each counts only its own photo as correct. Undercounts: "a dog on a beach" fits many photos.
- ECCV Caption (Chun et al., ECCV 2022): 1,332 of those captions with every matching photo verified by humans
  (8.5 per caption on average). Metric mAP@R rewards ranking all true matches first. Closest to "search my camera roll".

usage: python scripts/eval_retrieval.py [model ...]   (default: every model in build_assets.MODELS, plus the shipped int8 ONNX)
Data (~830 MB) goes to scripts/.cache/coco5k on first run.
"""
import io, json, sys, time, zipfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_assets as B

DATA = B.CACHE / "coco5k"
HF = "https://huggingface.co/datasets"
ECCV_WHEEL = "https://files.pythonhosted.org/packages/py3/e/eccv-caption/eccv_caption-0.1.0-py3-none-any.whl"


def load_data():
    import pandas as pd
    DATA.mkdir(parents=True, exist_ok=True)
    zp = B.fetch(f"{HF}/nlphuji/mscoco_2014_5k_test_image_text_retrieval/resolve/main/images_mscoco_2014_5k_test.zip", "coco5k/images.zip")
    meta = pd.read_parquet(B.fetch(f"{HF}/yerevann/coco-karpathy/resolve/main/data/test-00000-of-00001.parquet", "coco5k/test.parquet"))
    with zipfile.ZipFile(B.fetch(ECCV_WHEEL, "coco5k/eccv_caption.whl")) as z:  # read its label json only, never import it
        eccv = {int(k): v for k, v in json.loads(z.read("eccv_caption/data/eccv_caption_to_image.json")).items()}
    with zipfile.ZipFile(zp) as z:
        by_name = {Path(n).name: n for n in z.namelist() if n.endswith(".jpg")}
        jpgs = [z.read(by_name[f]) for f in meta.filename]
    caps = [(int(s), str(t).strip(), int(c)) for c, ss, ts in zip(meta.cocoid, meta.sentids, meta.sentences) for s, t in zip(ss[:5], ts[:5])]  # standard 25,000
    return list(meta.cocoid), jpgs, caps, eccv


def _prep(jpg):
    from PIL import Image
    return B.preprocess(Image.open(io.BytesIO(jpg)))


def scores(img, txt, ids, caps, eccv):
    """img [N,D], txt [M,D] normalized. Returns COCO R@1/5/10 and ECCV mAP@R / R-Precision / R@1, all %."""
    sim = txt @ img.T
    col = {c: i for i, c in enumerate(ids)}
    own = np.array([col[c] for _, _, c in caps])
    rank = (sim > sim[np.arange(len(caps)), own][:, None]).sum(1)
    out = {f"R@{k}": 100 * (rank < k).mean() for k in (1, 5, 10)}
    row = {sid: i for i, (sid, _, _) in enumerate(caps)}
    ap, rp, r1 = [], [], []
    for sid, pos in eccv.items():
        pos = {col[p] for p in pos}
        top = np.argsort(-sim[row[sid]])[:len(pos)]
        hit = np.array([t in pos for t in top])
        ap.append((hit * np.cumsum(hit) / np.arange(1, len(hit) + 1)).sum() / len(pos))
        rp.append(hit.mean())
        r1.append(hit[0])
    out |= {"mAP@R": 100 * np.mean(ap), "R-P": 100 * np.mean(rp), "ECCV R@1": 100 * np.mean(r1)}
    return out


def embed_torch(name, pix, caps):
    import torch
    m, tok, _ = B.load_model(name)
    t = B.Towers(m)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    t.vision.to(dev), t.text.to(dev)
    ids = np.array(B.token_ids(tok, [c for _, c, _ in caps]))
    with torch.no_grad():
        img = np.concatenate([t.vision(torch.from_numpy(pix[i:i + 256]).to(dev)).cpu().numpy() for i in range(0, len(pix), 256)])
        txt = np.concatenate([t.text(torch.from_numpy(ids[i:i + 1024]).to(dev)).cpu().numpy() for i in range(0, len(ids), 1024)])
    return img, txt


def embed_onnx(pix, caps):
    """The exact int8 files the phone runs."""
    import onnxruntime as ort
    from transformers import CLIPTokenizerFast
    from huggingface_hub import hf_hub_download
    tok = CLIPTokenizerFast(tokenizer_file=hf_hub_download(B.TOKENIZER, "tokenizer.json"))
    v, t = (ort.InferenceSession(str(B.NATIVE / f"{f}.onnx")) for f in ("vision", "text"))
    ids = np.array(B.token_ids(tok, [c for _, c, _ in caps]), dtype=np.int64)
    img = np.concatenate([v.run(None, {"pixel_values": pix[i:i + 64]})[0] for i in range(0, len(pix), 64)])
    txt = np.concatenate([t.run(None, {"input_ids": ids[i:i + 256]})[0] for i in range(0, len(ids), 256)])
    return img, txt


if __name__ == "__main__":
    names = sys.argv[1:] or [*B.MODELS, "onnx"]
    ids, jpgs, caps, eccv = load_data()
    t0 = time.time()
    with Pool() as p:
        pix = np.concatenate(p.map(_prep, jpgs, chunksize=32))
    print(f"{len(ids)} photos, {len(caps)} captions, {len(eccv)} ECCV queries; preprocessed in {time.time() - t0:.0f} s", flush=True)
    for n in names:
        img, txt = embed_onnx(pix, caps) if n == "onnx" else embed_torch(n, pix, caps)
        label = f"{B.SHIPPED} int8 ONNX (shipped file)" if n == "onnx" else f"{n} fp32"
        print(label.ljust(30), "  ".join(f"{k} {v:5.1f}" for k, v in scores(img, txt, ids, caps, eccv).items()), flush=True)
