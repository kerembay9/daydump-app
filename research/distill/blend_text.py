"""WiSE-FT for the student text tower: mix train_text.py's weights with its init (TinyCLIP-45M's text tower + the
least-squares projection), so words the CC3M fine-tune never saw (Turkish, emoji, brands) keep what TinyCLIP knew.
Per mix: VIST-val R@1 and top-10 overlap with the full teacher on photo-dump queries by group (VIST-val photos).
usage (repo root): .venv/bin/python -I research/distill/blend_text.py <image run> <text run> -> {D}/<text run>_a<mix>.pt"""
import json, os, sys
import numpy as np, torch, torch.nn.functional as F

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__)), os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts")]
from train import D, r1  # sets SPLIT=val
from embed_vist import CACHE, load
import build_assets as B

Q = {
    "control": ["a dog on the beach", "sunset over the ocean", "birthday cake with candles", "a red car", "people dancing at a party",
                "snow covered mountains", "a plate of pasta", "kids playing in the park"],
    "place": ["dubai", "paris", "istanbul", "tokyo", "new york", "london", "barcelona", "rome", "izmir", "cappadocia", "santorini", "bali",
              "eiffel tower", "hagia sophia", "colosseum", "big ben", "statue of liberty", "golden gate bridge", "burj khalifa", "pyramids of giza"],
    "name": ["starbucks", "ikea", "iphone", "playstation", "coca cola", "mcdonalds", "tesla", "lego", "nike shoes", "anfield", "camp nou",
             "galatasaray", "fenerbahce", "real madrid", "formula 1", "nba game", "pikachu", "mickey mouse", "batman", "minecraft", "harry potter", "hello kitty"],
    "food/event": ["baklava", "sushi", "ramen", "kebab", "croissant", "lahmacun", "turkish breakfast", "bubble tea", "christmas tree", "halloween costume",
                   "ramadan", "new year's eve fireworks", "wedding", "graduation", "concert", "festival"],
    "screen": ["screenshot", "receipt", "boarding pass", "meme", "qr code", "whatsapp chat", "instagram story", "spotify", "passport"],
    "emoji": ["❤️", "😂", "🎉", "🐶", "🍕", "🏖️"],
    "turkish": ["deniz", "kedi", "köpek", "düğün", "doğum günü", "çay", "kar", "plaj"],
}
MIX = [0.0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

if __name__ == "__main__":
    img_run, run = sys.argv[1:3]
    P = torch.load(f"{D}/{img_run}_pca.pt").cuda().float()
    m, tok, _ = B.load_model()
    t = m.text_encoder_without_ddp.cuda()
    enc = lambda x: torch.cat([F.normalize(t(torch.tensor(B.token_ids(tok, x[i:i + 512])).cuda().int()).float(), dim=-1) for i in range(0, len(x), 512)])

    # init = train_text.py's step 0 (same recipe, fresh 100k sample)
    X = np.load(f"{D}/text/teacher_text_pel336.npz")
    s = np.sort(np.random.default_rng(0).choice(len(X["tok"]), 100000, replace=False))
    ids = torch.from_numpy(X["tok"][s].astype(np.int32)).cuda()
    tgt = F.normalize(torch.from_numpy(X["emb"][s]).cuda().float() @ P, dim=-1)
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        t.get_proj_feature = lambda x: x
        f = torch.cat([t(i).float() for i in ids.split(1000)])
        del t.get_proj_feature
    with torch.no_grad():
        t.text_projection.copy_(torch.linalg.lstsq(f, tgt).solution)
    init = {k: v.clone() for k, v in t.state_dict().items()}
    ft = torch.load(f"{D}/{run}.pt", map_location="cuda")
    del X, ids, tgt, f

    ref = dict(np.load(f"{D}/vist_emb_val/{img_run}.npz"))
    have = set(ref["ids"])
    dii = json.load(open(f"{CACHE}/vist/ann/dii/val.description-in-isolation.json"))["annotations"]
    qv = [a[0]["text"] for a in dii if a[0]["photo_flickr_id"] in have]
    assert len(qv) == len(ref["q"])
    qs = [q for v in Q.values() for q in v]
    cat = np.array([c for c, v in Q.items() for _ in v])

    for k in [k for k in sys.modules if k.split(".")[0] == "open_clip"]:  # TinyCLIP's fork shadows the stock open_clip
        del sys.modules[k]
    sys.path[:] = [p for p in sys.path if "tinyclip" not in p.lower()]
    tm, ttok, *_ = load("pel336", "cuda")
    with torch.no_grad():
        tf = F.normalize(tm.encode_text(ttok(qs)).float(), dim=-1)
    del tm
    V = {k: np.load(f"{D}/vist_emb_val/{k}.npz") for k in [img_run, "pel336"]}
    assert (V[img_run]["ids"] == V["pel336"]["ids"]).all()
    img, gimg = (torch.from_numpy(V[k]["img"]).cuda().float() for k in V)
    gt = (tf @ gimg.T).topk(10).indices

    def overlap(e):
        top = (e @ img.T).topk(10).indices
        o = np.array([len(set(a.tolist()) & set(b.tolist())) / 10 for a, b in zip(top, gt)])
        return {c: o[cat == c].mean() for c in Q}

    print(f"{'mix':5s} {'R@1':5s} " + " ".join(f"{c:>10s}" for c in Q), flush=True)
    for a in MIX:
        t.load_state_dict({k: (1 - a) * init[k] + a * ft[k] for k in init})
        with torch.no_grad():
            e = {**ref, "q": enc(qv).cpu().numpy()}
            o = overlap(enc(qs))
        print(f"{a:<5.1f} {r1(e):5.1f} " + " ".join(f"{o[c]:10.2f}" for c in Q), flush=True)
        torch.save(t.state_dict(), f"{D}/{run}_a{a:.1f}.pt")
    print("done", flush=True)
