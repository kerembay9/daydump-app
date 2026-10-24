"""Score every model in vist_emb/ on the VIST subset: search, tags, curation (the app's pick()). usage: score_vist.py [key ...]"""
import glob, json, os, re, sys
from collections import defaultdict
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
CACHE = f"{REPO}/scripts/.cache"
BASE = os.environ.get("BASE", "tc45")  # the model every other is compared to (paired bootstrap)
rng = np.random.default_rng(0)
SPLIT = os.environ.get("SPLIT", "test")
EMB = f"{CACHE}/distill/vist_emb" + ("" if SPLIT == "test" else "_" + SPLIT)

sis = json.load(open(f"{CACHE}/vist/ann/sis/{SPLIT}.story-in-sequence.json"))
meta = {i["id"]: i for i in sis["images"]}
stories = defaultdict(set)
for a in sis["annotations"]:
    a = a[0]; stories[a["story_id"]].add(a["photo_flickr_id"])
album_of = {i["id"]: i["album_id"] for i in sis["images"]}
album_all = defaultdict(set)
for p, a in album_of.items():
    album_all[a].add(p)
worth = json.load(open(f"{REPO}/src/services/stories/worth.json"))
vocab = json.load(open(f"{REPO}/modules/clip-embedder/android/src/main/assets/clip/vocab.json"))["names"]
W = np.array([(worth["w"][c] if c < len(worth["w"]) else 50) / 100 for c in range(len(vocab))])

keys = sys.argv[1:] or [os.path.basename(f)[:-4] for f in sorted(glob.glob(f"{EMB}/*.npz"))]
E = {k: dict(np.load(f"{EMB}/{k}.npz")) for k in keys}
# common photos and queries, so every model sees the same set
ids = sorted(set.intersection(*[set(e["ids"]) for e in E.values()]))
col = {p: i for i, p in enumerate(ids)}
for e in E.values():
    o = {p: i for i, p in enumerate(e["ids"])}
    e["img"] = e["img"][[o[p] for p in ids]]
qmask = np.array([p in col for p in E[keys[0]]["q_photo"]])
qown = np.array([col[p] for p in E[keys[0]]["q_photo"][qmask]])
have = set(ids)
full = [a for a, ps in album_all.items() if ps <= have and len(ps) >= 5]
alb_rows = {a: np.array(sorted((col[p] for p in album_all[a]), key=lambda i: (meta[ids[i]]["datetaken"], i))) for a in full}  # i breaks time ties: set order changes per process
alb_st = {a: [s for s in stories.values() if s <= album_all[a]] for a in full}
alb_st = {a: s for a, s in alb_st.items() if s}
STOP = set("with from that this they their there have photo picture image".split())
words = lambda s: {w.rstrip("s") for w in re.findall(r"[a-z]{4,}", s.lower())} - STOP
tagw = {p: words(meta[p].get("tags", "") + " " + meta[p].get("title", "")) for p in ids}
cw = [words(n) for n in vocab]


def pick(rows, img, quality, n, thr):
    """src/services/stories/index.ts pick(): best per time bucket, skipping near-duplicates; rows time-ordered."""
    chosen = []
    dup = lambda r: any(img[r] @ img[c] > thr for c in chosen)
    k = min(n, len(rows))
    for b in range(k):
        sl = [r for r in rows[b * len(rows) // k:(b + 1) * len(rows) // k] if not dup(r)]
        if sl:
            chosen.append(max(sl, key=lambda r: quality[r]))
    for r in rows:
        if len(chosen) < n and r not in chosen and not dup(r):
            chosen.append(r)
    return chosen


def boot(per_item, base_item):
    """paired bootstrap 95% CI of mean(per_item - base_item)"""
    d = np.asarray(per_item, float) - np.asarray(base_item, float)
    bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    return np.percentile(bs, [2.5, 97.5])


# near-duplicate threshold matched per model: the share of within-album pairs the base model calls duplicates at 0.95
pairs = [(i, j) for rows in alb_rows.values() for x, i in enumerate(rows) for j in rows[x + 1:]]
pi, pj = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
base_img = E[BASE]["img"] if BASE in E else None
dup_share = ((base_img[pi] * base_img[pj]).sum(1) > 0.95).mean() if base_img is not None else 0.05

res, per = {}, {}
for k, e in E.items():
    img, q, con = e["img"], e["q"][qmask], e["concepts"]
    sim = q @ img.T
    rank = (sim > sim[np.arange(len(q)), qown][:, None]).sum(1)
    # within the photo's own album (complete albums only)
    inalb = []
    for qi, r in enumerate(qown):
        a = album_of.get(ids[r])
        if a in alb_rows:
            rows = alb_rows[a]
            inalb.append(float((sim[qi, rows] > sim[qi, r]).sum() == 0))
    cs = img @ con.T
    top = np.argsort(-cs, 1)[:, :5]
    tsc = np.take_along_axis(cs, top, 1)
    wq = (W[top] * tsc).sum(1) / tsc.sum(1)  # photoWorth
    tagged = [i for i, p in enumerate(ids) if tagw[p]]
    taghit = [float(any(cw[c] & tagw[ids[i]] for c in top[i])) for i in tagged]
    ps = (img[pi] * img[pj]).sum(1)
    thr = np.quantile(ps, 1 - dup_share) if k != BASE else 0.95
    cur, cur0 = [], []
    for a, st in alb_st.items():
        rows = list(alb_rows[a])
        share = {r: sum(ids[r] in s for s in st) / len(st) for r in rows}
        cur.append(np.mean([share[r] for r in pick(rows, img, wq, 5, thr)]))
    res[k] = {"R@1": 100 * (rank < 1).mean(), "R@5": 100 * (rank < 5).mean(), "R@10": 100 * (rank < 10).mean(),
              "album R@1": 100 * np.mean(inalb), "tag hit": 100 * np.mean(taghit), "curation": 100 * np.mean(cur)}
    per[k] = {"R@1": (rank < 1).astype(float), "R@5": (rank < 5).astype(float), "R@10": (rank < 10).astype(float), "album R@1": np.array(inalb), "tag hit": np.array(taghit), "curation": np.array(cur)}

# model-free reference points for curation
rand, tb, best = [], [], []
for a, st in alb_st.items():
    rows = list(alb_rows[a])
    share = {r: sum(ids[r] in s for s in st) / len(st) for r in rows}
    rand.append(np.mean(list(share.values())))
    tb.append(np.mean([share[r] for r in pick(rows, E[keys[0]]["img"], {r: 0 for r in rows}, 5, 9)]))
    best.append(np.mean(sorted(share.values())[-5:]))

print(f"{len(ids)} photos, {qmask.sum()} queries, {len(alb_rows)} complete albums, {len(alb_st)} with stories, "
      f"{sum(len(s) for s in alb_st.values())} stories; dedupe share {100 * dup_share:.1f}% of album pairs")
cols = ["R@1", "R@5", "R@10", "album R@1", "tag hit", "curation"]
print("model".ljust(10), "  ".join(c.rjust(9) for c in cols))
for k in keys:
    print(k.ljust(10), "  ".join(f"{res[k][c]:9.1f}" for c in cols))
if BASE in res:
    print("\n95% CI of the difference vs", BASE)
    for k in keys:
        if k != BASE:
            print(k.ljust(10), "  ".join(("[%+.1f, %+.1f]" % tuple(100 * boot(per[k][c], per[BASE][c]))).rjust(13) for c in cols))
print(f"\ncuration reference: random {100 * np.mean(rand):.1f}, time buckets only {100 * np.mean(tb):.1f}, "
      f"best possible {100 * np.mean(best):.1f}")
