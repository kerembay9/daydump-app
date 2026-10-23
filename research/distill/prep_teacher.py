"""Teacher targets, computed once (MobileCLIP's reinforced-dataset trick): per photo K crops (crop 0 = the app's view,
shortest side -> center square; the rest random-resized + flip), each crop's params and teacher image embedding; plus the
teacher's text embeddings of the text bank (the app's concept prompts + VIST *train* descriptions).
usage (repo root): .venv/bin/python research/distill/prep_teacher.py [teacher key] -> scripts/.cache/distill/teacher_<key>.npz"""
import json, os, random, sys
import numpy as np, torch
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from embed_vist import CACHE, MODELS, REPO, load

K, SCALE, RATIO = 5, (0.35, 1.0), (3 / 4, 4 / 3)
D = f"{CACHE}/distill"


def crops_for(name, w, h):
    """K crops as fractions of the image: (top, left, height, width, flip). Seeded by photo id, so reruns match."""
    r, out = random.Random(name), []
    s = min(w, h)
    out.append(((h - s) / 2 / h, (w - s) / 2 / w, s / h, s / w, 0))
    for _ in range(10 * K):
        if len(out) == K:
            break
        area = w * h * r.uniform(*SCALE)
        ar = np.exp(r.uniform(np.log(RATIO[0]), np.log(RATIO[1])))
        cw, ch = round((area * ar) ** 0.5), round((area / ar) ** 0.5)
        if 0 < cw <= w and 0 < ch <= h:
            t, l = r.randint(0, h - ch), r.randint(0, w - cw)
            out.append((t / h, l / w, ch / h, cw / w, r.random() < 0.5))
    while len(out) < K:  # panoramas: no random crop fits, so the app's view flipped/not (as torchvision's fallback)
        out.append(out[0][:4] + (len(out) % 2,))
    return np.array(out, np.float32)


def apply_crop(im, c, size):
    """PIL image, one crop row -> size x size RGB float array in [0, 1]"""
    t, l, ch, cw, flip = c
    W, H = im.size
    im = im.crop((round(l * W), round(t * H), round((l + cw) * W), round((t + ch) * H))).resize((size, size), Image.BILINEAR)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return np.asarray(im, np.float32) / 255


class Photos(torch.utils.data.Dataset):
    def __init__(self, files, size, mean, std): self.files, self.size, self.mean, self.std = files, size, mean, std
    def __len__(self): return len(self.files)

    def __getitem__(self, i):
        im = Image.open(self.files[i]).convert("RGB")
        c = crops_for(os.path.basename(self.files[i]), *im.size)
        x = np.stack([(apply_crop(im, r, self.size) - self.mean) / self.std for r in c]).transpose(0, 3, 1, 2)
        return torch.from_numpy(x.astype(np.float32)), torch.from_numpy(c)


if __name__ == "__main__":
    key = sys.argv[1] if len(sys.argv) > 1 else "pel336"
    m, tok, size, mean, std = load(key, "cuda")
    m.eval()
    out = f"{D}/teacher_{key}.npz"
    old = dict(np.load(out)) if os.path.exists(out) else None  # extend, don't redo: photos already there are skipped
    done = set(old["ids"]) if old else set()
    files = sorted(f"{D}/oi/{f}" for f in os.listdir(f"{D}/oi") if f.endswith(".jpg") and f[:-4] not in done)
    dl = torch.utils.data.DataLoader(Photos(files, size, mean, std), batch_size=32, num_workers=12)
    emb, crops = ([torch.from_numpy(old["emb"])], [torch.from_numpy(old["crops"])]) if old else ([], [])
    ids = list(old["ids"]) if old else []
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        for b, (x, c) in enumerate(dl):
            e = m.encode_image(x.flatten(0, 1).cuda(non_blocking=True)).float()
            emb.append(torch.nn.functional.normalize(e, dim=-1).view(len(x), K, -1).half().cpu()); crops.append(c)
            if b % 200 == 0:
                print(f"{b * 32}/{len(files)} photos", flush=True)
    # text bank: concept prompts (as build_assets) + VIST train descriptions (other albums than val/test)
    vocab = json.load(open(f"{REPO}/modules/clip-embedder/android/src/main/assets/clip/vocab.json"))["names"]
    dii = json.load(open(f"{CACHE}/vist/ann/dii/train.description-in-isolation.json"))["annotations"]
    caps = sorted({a[0]["text"].strip() for a in dii})
    random.Random(0).shuffle(caps)
    bank = [f"a photo of {n}." for n in vocab] + caps[:50000]
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        te = torch.cat([m.encode_text(tok(bank[i:i + 512])).float() for i in range(0, len(bank), 512)])
    ids += [os.path.basename(f)[:-4] for f in files]
    np.savez(out + ".tmp.npz", ids=np.array(ids),
             emb=torch.cat(emb).numpy(), crops=torch.cat(crops).numpy(),
             bank=torch.nn.functional.normalize(te, dim=-1).half().cpu().numpy(), n_concepts=len(vocab),
             logit_scale=float(m.logit_scale.exp()))
    os.replace(out + ".tmp.npz", out)
    print("done", len(ids), "photos", f"({len(files)} new)", len(bank), "bank texts", flush=True)
