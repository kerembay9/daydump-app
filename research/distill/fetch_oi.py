"""Open Images V4 train photos (all CC BY 2.0) from the public S3 mirror, shrunk to 288 px shortest side.
usage (repo root): .venv/bin/python -I research/distill/fetch_oi.py N  -> scripts/.cache/distill/oi/<id>.jpg (resumable;
a fixed seeded order, so a bigger N extends the same set)."""
import csv, io, os, random, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts/.cache/distill")
OUT = f"{D}/oi"; os.makedirs(OUT, exist_ok=True)
ids = [r["ImageID"] for r in csv.DictReader(open(f"{D}/oi_train.csv"))]
random.Random(0).shuffle(ids)
todo = [i for i in ids[:int(sys.argv[1])] if not os.path.exists(f"{OUT}/{i}.jpg")]


def get(i):
    try:
        b = urllib.request.urlopen(f"https://open-images-dataset.s3.amazonaws.com/train/{i}.jpg", timeout=30).read()
        im = Image.open(io.BytesIO(b)); im.draft("RGB", (576, 576))
        im = ImageOps.exif_transpose(im).convert("RGB")
        s = 288 / min(im.size)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)), Image.BICUBIC)
        im.save(f"{OUT}/{i}.jpg.tmp", "JPEG", quality=90); os.replace(f"{OUT}/{i}.jpg.tmp", f"{OUT}/{i}.jpg")
        return len(b)
    except Exception:
        return 0


n = mb = 0
with ThreadPoolExecutor(256) as ex:  # S3 gives ~70-140 KB/s per connection; on 2026-10-23 the home link (~7 MB/s, ~85k photos/h) was the cap, not threads
    for b in ex.map(get, todo):
        n += 1; mb += b / 1e6
        if n % 2000 == 0:
            print(f"{n}/{len(todo)} photos, {mb / 1e3:.1f} GB fetched", flush=True)
print("done", n, flush=True)
