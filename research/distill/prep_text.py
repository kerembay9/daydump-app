"""Teacher text embeddings for the student text tower (PLAN.md step 4), once: no teacher at train time.
Texts: CC3M captions (text only; Google: free for any use) + VIST train DII descriptions; VIST val/test texts dropped.
usage (repo root): .venv/bin/python -I research/distill/prep_text.py <cc3m parquet> ... -> {D}/text/teacher_text_pel336.npz:
tok (the student's TinyCLIP ids, as the app tokenizes, uint16 [N, 77]), emb (teacher, unit, fp16 [N, 1024])."""
import json, os, sys
import numpy as np, pyarrow.parquet as pq, torch

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__)), os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts")]
from embed_vist import CACHE, load
import build_assets as B

D = f"{CACHE}/distill"
dii = lambda s: {a[0]["text"].strip() for a in json.load(open(f"{CACHE}/vist/ann/dii/{s}.description-in-isolation.json"))["annotations"]}
held = dii("val") | dii("test")
texts = {t.strip() for f in sys.argv[1:] for t in pq.read_table(f, columns=["caption"])["caption"].to_pylist()} | dii("train")
texts = sorted(t for t in texts - held if t)
print(len(texts), "texts", flush=True)

_, stok, _ = B.load_model()
tok = np.array([ids for i in range(0, len(texts), 10000) for ids in B.token_ids(stok, texts[i:i + 10000])], dtype=np.uint16)
print("tokenized", tok.shape, flush=True)
for k in [k for k in sys.modules if k.split(".")[0] == "open_clip"]:  # TinyCLIP's fork shadows the stock open_clip
    del sys.modules[k]
sys.path[:] = [p for p in sys.path if "tinyclip" not in p.lower()]
m, ttok, *_ = load("pel336", "cuda")
m.eval()
emb = np.empty((len(texts), 1024), np.float16)
with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
    for i in range(0, len(texts), 1024):
        emb[i:i + 1024] = torch.nn.functional.normalize(m.encode_text(ttok(texts[i:i + 1024])).float(), dim=-1).half().cpu().numpy()
        if i % 204800 == 0:
            print(f"{i}/{len(texts)}", flush=True)
os.makedirs(f"{D}/text", exist_ok=True)
np.savez(f"{D}/text/teacher_text_pel336.npz", tok=tok, emb=emb)
print("done", flush=True)
