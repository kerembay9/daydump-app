"""Score text towers as the phone runs them (LiteRT .tflite + the textpack tokenizer) against the shipped one, with the
shipped vision fixed: VIST search/tags/curation with paired 95% CIs (score_vist.py), plus agreement with the reference
on words VIST rarely has (emoji names, countries, big cities). Use the held-out test split (default) for decisions; val
picked the epoch and the calibration.
usage (repo root): [SPLIT=val] .venv/bin/python -I research/distill/eval_text.py name=path.tflite ...
the first name is the reference (run shipped=<textpack text.tflite> first, it is the BASE every later run compares to)
-> scripts/.cache/distill/vist_emb[_val]/<name>.npz"""
import json, os, subprocess, sys
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path[:0] = [os.path.dirname(__file__), f"{REPO}/scripts"]
import build_assets as B
from embed_vist import CLIP_MEAN, CLIP_STD, IMG, SPLIT, prep

EMB = f"{B.CACHE}/distill/vist_emb" + ("" if SPLIT == "test" else "_" + SPLIT)
REF = "shipped"


def images():
    """VIST photos through the shipped vision tower (fp32, app preprocessing), cached: every text candidate sees the same."""
    f = f"{EMB}/.shipped_vision.npz"  # dotfile: score_vist's *.npz glob skips it
    if os.path.exists(f):
        return dict(np.load(f))
    import torch
    from multiprocessing import Pool
    files = sorted(os.listdir(IMG))
    with Pool() as p:
        pix = p.map(prep, [(n, 224, np.float32(CLIP_MEAN), np.float32(CLIP_STD)) for n in files], chunksize=16)
    ok = [i for i, x in enumerate(pix) if x is not None]
    v = B.load_shipped()[0].cuda()
    x = np.stack([pix[i] for i in ok])
    with torch.no_grad():
        e = torch.cat([v(torch.from_numpy(x[i:i + 128]).cuda()) for i in range(0, len(x), 128)])
    e = torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    os.makedirs(EMB, exist_ok=True)
    np.savez(f, ids=np.array([files[i].rsplit(".", 1)[0] for i in ok]), img=e)
    return {"ids": np.array([files[i].rsplit(".", 1)[0] for i in ok]), "img": e}


def rare():
    """Words people search that VIST captions seldom have: they live in the rarely-trained rows of the token table."""
    emoji = json.load(open(f"{REPO}/src/services/index/emojiNames.json")).values()
    c = json.load(open(f"{REPO}/src/services/index/cities.json"))
    cities = [x[0] for x in sorted(c["cities"], key=lambda x: -x[4])[:1000]]
    return sorted(set(emoji) | set(c["countries"].values()) | set(cities))


def embed(path, texts):
    from transformers import CLIPTokenizerFast
    from ai_edge_litert.interpreter import Interpreter
    own = path.removesuffix(".tflite") + ".tokenizer.json"  # a candidate with its own (e.g. pruned) tokenizer
    tok = CLIPTokenizerFast(tokenizer_file=own if os.path.exists(own) else str(B.PACK / "tokenizer.json"))
    it = Interpreter(model_path=path, num_threads=os.cpu_count()); it.allocate_tensors()
    inp, out = it.get_input_details()[0], it.get_output_details()[0]
    vecs = []
    for ids in B.token_ids(tok, texts):
        it.set_tensor(inp["index"], np.array([ids], dtype=inp["dtype"])); it.invoke()
        vecs.append(it.get_tensor(out["index"])[0].copy())
    v = np.stack(vecs)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


if __name__ == "__main__":
    im = images()
    have = set(im["ids"])
    dii = json.load(open(f"{B.CACHE}/vist/ann/dii/{SPLIT}.description-in-isolation.json"))["annotations"]
    q = [(a[0]["photo_flickr_id"], a[0]["text"]) for a in dii if a[0]["photo_flickr_id"] in have]
    vocab = json.load(open(B.NATIVE / "vocab.json"))["names"]
    words = rare()
    texts = [x for _, x in q] + [f"a photo of {n}." for n in vocab] + words
    parts = {"q": (0, len(q)), "concepts": (len(q), len(q) + len(vocab)), "rare": (len(q) + len(vocab), len(texts))}
    names = []
    for arg in sys.argv[1:]:
        name, path = arg.split("=", 1)
        names.append(name)
        t = embed(path, texts)
        np.savez(f"{EMB}/{name}.npz", ids=im["ids"], img=im["img"], q_photo=np.array([p for p, _ in q]),
                 **{k: t[a:b] for k, (a, b) in parts.items()})
        print(f"{name}: {os.path.getsize(path) / 1e6:.1f} MB, {len(q)} queries, {len(vocab)} concepts, {len(words)} rare words", flush=True)
        if name == REF or not os.path.exists(f"{EMB}/{REF}.npz"):
            continue
        r, c = dict(np.load(f"{EMB}/{REF}.npz")), dict(np.load(f"{EMB}/{name}.npz"))
        top = lambda v: np.argsort(-(v @ im["img"].T), 1)[:, :10]
        for k, (a, _) in parts.items():
            cos = (r[k] * c[k]).sum(-1)
            ov = np.mean([len(set(x) & set(y)) / 10 for x, y in zip(top(r[k]), top(c[k]))])
            print(f"  {k:9s} cosine to {REF}: mean {cos.mean():.4f}  p1 {np.percentile(cos, 1):.4f}  min {cos.min():.4f}"
                  f" ({texts[a + cos.argmin()]!r})  top-10 photo overlap {100 * ov:.1f}%")
    sys.stdout.flush()
    others = [n for n in names if n != REF]
    if others and os.path.exists(f"{EMB}/{REF}.npz"):
        subprocess.run([sys.executable, "-I", f"{os.path.dirname(__file__)}/score_vist.py", REF, *others],
                       env={**os.environ, "BASE": REF, "SPLIT": SPLIT}, check=True)
