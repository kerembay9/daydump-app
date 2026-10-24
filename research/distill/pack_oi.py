"""Pack the Open Images photos into one file, sorted by id, for train.py: one disk read per photo instead of ~2.5
(directory + inode + data). At 1.38M photos on the SATA SSD, loose files held steps at ~0.135 s vs ~0.094 s.
usage (repo root): .venv/bin/python -I research/distill/pack_oi.py -> {D}/oi.pack, oi_pack_ids.npy, oi_pack_off.npy"""
import os, random
from concurrent.futures import ThreadPoolExecutor
import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts/.cache/distill")

if __name__ == "__main__":
    ids = sorted(f[:-4] for f in os.listdir(f"{D}/oi") if f.endswith(".jpg"))
    off = np.zeros(len(ids) + 1, np.int64)
    read = lambda i: open(f"{D}/oi/{i}.jpg", "rb").read()
    with open(f"{D}/oi.pack.tmp", "wb") as out, ThreadPoolExecutor(32) as ex:
        for c in range(0, len(ids), 20000):
            for j, b in enumerate(ex.map(read, ids[c:c + 20000]), c):
                out.write(b)
                off[j + 1] = off[j] + len(b)
            print(f"{c + 20000}/{len(ids)}", flush=True)
    with open(f"{D}/oi.pack.tmp", "rb") as f:  # spot check against the loose files
        for j in random.sample(range(len(ids)), 2000):
            f.seek(off[j])
            assert f.read(off[j + 1] - off[j]) == read(ids[j]), ids[j]
    np.save(f"{D}/oi_pack_ids.npy", np.array(ids, "S16"))
    np.save(f"{D}/oi_pack_off.npy", off)
    os.replace(f"{D}/oi.pack.tmp", f"{D}/oi.pack")
    print("done", len(ids), off[-1] / 1e9, "GB", flush=True)
