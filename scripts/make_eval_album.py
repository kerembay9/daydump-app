"""Curate a diverse eval album from the phone's Camera roll (wireless/USB adb) for EXPO_PUBLIC_EVAL_ALBUM.

Run:  .venv/bin/python scripts/make_eval_album.py [pull] [pick] [push]   (no args = all)

pull - stream the first 64 KB of every DCIM/Camera JPEG (EXIF date, GPS, embedded thumbnail) to scripts/.cache
pick - TinyCLIP on the thumbnails: whole trips (GPS runs away from home) + recurring subjects (clusters seen on
       many days) + a k-center diversity fill. Writes scripts/.cache/eval_manifest.json with the expected stories.
push - on-device `cp` (originals untouched) into Pictures/<album>, plus the golden self-check image, then a media scan.
Personal photos never enter the repo; everything lands in the gitignored cache.
"""
import io, json, math, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from build_assets import CACHE, GOLDEN_IMAGE, NATIVE, load_model, preprocess

ALBUM = "DayDump Eval"
SRC = "/sdcard/DCIM/Camera"
DST = f"/sdcard/Pictures/{ALBUM}"
HEADERS = CACHE / "camera_headers.bin"
MANIFEST = CACHE / "eval_manifest.json"
TARGET, MAX_TRIPS, TRIP_PICKS, N_TOPICS, TOPIC_PICKS = 150, 3, 14, 6, 8


def adb(*args, **kw):
    return subprocess.run(["adb", *args], check=True, **kw)


def pull():
    CACHE.mkdir(parents=True, exist_ok=True)
    with open(HEADERS, "wb") as f:
        adb("exec-out", f'for f in {SRC}/*.jpg; do echo "@@FILE@@$f@@"; head -c 65536 "$f"; done', stdout=f)
    print(f"{HEADERS.stat().st_size / 1e6:.0f} MB of headers")


def parse_headers():
    from PIL import Image
    out = []
    for chunk in HEADERS.read_bytes().split(b"@@FILE@@")[1:]:
        path, _, data = chunk.partition(b"@@\n")
        if data[2:4] != b"\xff\xe1":  # APP1 (EXIF) must come first; PIL can't open the truncated JPEG itself
            continue
        data = data[4:4 + int.from_bytes(data[4:6], "big")]
        exif = Image.Exif()
        try:
            exif.load(data[8:])  # skip length + "Exif\0\0"
        except Exception:
            continue
        sub, gps = exif.get_ifd(0x8769), exif.get_ifd(0x8825)
        when = sub.get(0x9003) or exif.get(0x0132)
        if not when:
            continue
        t = datetime.strptime(when.strip("\x00"), "%Y:%m:%d %H:%M:%S").timestamp()
        lat = lon = None
        if gps.get(2) and gps.get(4):
            dms = lambda v: float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            lat = dms(gps[2]) * (-1 if gps.get(1) == "S" else 1)
            lon = dms(gps[4]) * (-1 if gps.get(3) == "W" else 1)
            if abs(lat) < 1e-6 and abs(lon) < 1e-6:
                lat = lon = None
        s = data.find(b"\xff\xd8", 2)  # EXIF thumbnail: the second JPEG inside APP1
        e = data.find(b"\xff\xd9", s)
        if s < 0 or e < 0:
            continue
        out.append({"path": path.decode(), "t": t, "lat": lat, "lon": lon, "thumb": data[s:e + 2], "orient": exif.get(0x0112, 1)})
    return out


def km(a, b):
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def day(p):
    return datetime.fromtimestamp(p["t"]).date()


def spread(items, n):
    """n items evenly spaced through a time-sorted list."""
    items = sorted(items, key=lambda p: p["t"])
    if len(items) <= n:
        return items
    return [items[round(i * (len(items) - 1) / (n - 1))] for i in range(n)]


def find_trips(photos):
    geo = sorted((p for p in photos if p["lat"] is not None), key=lambda p: p["t"])
    if not geo:
        return [], None
    cells = Counter()
    for d, ps in groupby_day(geo).items():
        cells.update({(round(p["lat"], 1), round(p["lon"], 1)) for p in ps})
    home = cells.most_common(1)[0][0]
    runs, cur = [], []
    for p in geo:
        away = km(home, (p["lat"], p["lon"])) > 80
        if cur and (not away or p["t"] - cur[-1]["t"] > 36 * 3600):
            runs.append(cur); cur = []
        if away:
            cur.append(p)
    runs.append(cur)
    runs = [r for r in runs if len(r) >= 6]
    # one trip per destination, biggest first
    seen, trips = [], []
    for r in sorted(runs, key=len, reverse=True):
        c = (sum(p["lat"] for p in r) / len(r), sum(p["lon"] for p in r) / len(r))
        if all(km(c, s) > 50 for s in seen):
            seen.append(c); trips.append(r)
    return trips[:MAX_TRIPS], home


def groupby_day(ps):
    g = defaultdict(list)
    for p in ps:
        g[day(p)].append(p)
    return g


def embed(photos):
    import numpy as np, torch
    from PIL import Image, ImageOps
    m, _, _ = load_model()
    vecs = []
    with torch.no_grad():
        for i in range(0, len(photos), 64):
            batch = []
            for p in photos[i:i + 64]:
                im = Image.open(io.BytesIO(p["thumb"]))
                im.getexif()[0x0112] = p["orient"]  # thumbnails carry no orientation of their own
                batch.append(preprocess(im))
            e = m.get_image_features(pixel_values=torch.from_numpy(np.concatenate(batch)))
            vecs.append((e / e.norm(dim=-1, keepdim=True)).numpy())
            print(f"  embedded {min(i + 64, len(photos))}/{len(photos)}", end="\r")
    print()
    return np.concatenate(vecs)


def concept_names(v, k=3):
    import numpy as np
    raw = (NATIVE / "vocab.bin").read_bytes()
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 516)
    scale = rows[:, :4].copy().view(np.float32)[:, 0]
    vocab = rows[:, 4:].copy().view(np.int8).astype(np.float32) * scale[:, None]
    names = json.loads((NATIVE / "vocab.json").read_text())["names"]
    return [names[i] for i in np.argsort(-(vocab @ v))[:k]]


def pick():
    import numpy as np
    from sklearn.cluster import KMeans
    photos = parse_headers()
    print(len(photos), "camera photos,", sum(p["lat"] is not None for p in photos), "geotagged")
    chosen, why = {}, {}

    trips, home = find_trips(photos)
    for i, r in enumerate(trips):
        lat, lon = sum(p["lat"] for p in r) / len(r), sum(p["lon"] for p in r) / len(r)
        label = f"trip {i + 1}: {lat:.2f},{lon:.2f} · {day(r[0])}–{day(r[-1])} · {len(r)} photos"
        for p in spread(r, TRIP_PICKS):
            chosen[p["path"]] = p; why[p["path"]] = label

    V = embed(photos)
    idx = {p["path"]: i for i, p in enumerate(photos)}
    km_ = KMeans(n_clusters=40, n_init=4, random_state=0).fit(V)
    clusters = defaultdict(list)
    for i, c in enumerate(km_.labels_):
        clusters[c].append(i)
    def recurring(c):
        ps = [photos[i] for i in clusters[c]]
        days = len({day(p) for p in ps})
        tight = float(np.mean(V[clusters[c]] @ km_.cluster_centers_[c]))
        return days * tight
    topics = []
    for c in sorted(clusters, key=recurring, reverse=True):
        ps = [photos[i] for i in clusters[c] if photos[i]["path"] not in chosen]
        by_day = groupby_day(ps)
        if len(by_day) < 3:
            continue
        # one photo per day (closest to the centroid), spread over the cluster's days
        best = [max(d, key=lambda p: V[idx[p["path"]]] @ km_.cluster_centers_[c]) for d in by_day.values()]
        label = f"topic: {', '.join(concept_names(km_.cluster_centers_[c]))} · {len(by_day)} days"
        topics.append(label)
        for p in spread(best, TOPIC_PICKS):
            chosen[p["path"]] = p; why[p["path"]] = label
        if len(topics) == N_TOPICS:
            break

    # k-center fill: repeatedly add the photo farthest from everything chosen
    sel = [idx[k] for k in chosen]
    dist = np.min(1 - V @ V[sel].T, axis=1) if sel else np.ones(len(photos))
    while len(chosen) < TARGET:
        i = int(np.argmax(dist))
        p = photos[i]
        chosen[p["path"]] = p; why[p["path"]] = "diverse: " + ", ".join(concept_names(V[i], 2))
        dist = np.minimum(dist, 1 - V @ V[i])

    MANIFEST.write_text(json.dumps({
        "album": ALBUM, "home": home,
        "expected": [f"trip {i + 1}" for i in range(len(trips))] + topics,
        "photos": [{"path": k, "why": why[k], "date": str(day(chosen[k])), "gps": chosen[k]["lat"] is not None}
                   for k in sorted(chosen, key=lambda k: chosen[k]["t"])],
    }, indent=1))
    print(f"picked {len(chosen)} -> {MANIFEST}")
    for line in Counter(why.values()).most_common():
        if not line[0].startswith("diverse"):
            print(f"  {line[1]:3d}  {line[0]}")
    print(f"  {sum(v.startswith('diverse') for v in why.values()):3d}  diverse fill")


def push():
    paths = [p["path"] for p in json.loads(MANIFEST.read_text())["photos"]]
    script = f'mkdir -p "{DST}" && cd "{SRC}" && cp -p ' + " ".join(f'"{Path(p).name}"' for p in paths) + f' "{DST}/"'
    adb("shell", script)
    adb("push", str(GOLDEN_IMAGE), f"{DST}/{GOLDEN_IMAGE.name}", stdout=subprocess.DEVNULL)
    adb("shell", "content", "call", "--uri", "content://media", "--method", "scan_volume", "--arg", "external_primary",
        stdout=subprocess.DEVNULL)
    n = adb("shell", f'ls "{DST}" | wc -l', capture_output=True, text=True).stdout.strip()
    print(f"{n} files in {DST}")


if __name__ == "__main__":
    for s in sys.argv[1:] or ["pull", "pick", "push"]:
        {"pull": pull, "pick": pick, "push": push}[s]()
