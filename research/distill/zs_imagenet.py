"""ImageNet zero-shot top-1 on the local val subset (scripts/.cache/tinyclip/imagenet/val, one prompt), app preprocessing.
usage (repo root): .venv/bin/python research/distill/zs_imagenet.py tc45, then separately ... pel336 <student run ...>
(tc45 loads TinyCLIP's own open_clip fork, which then shadows stock open_clip in the same process)
A student run = image tower from scripts/.cache/distill/<run>.pt + the teacher's (pel336) text in that run's 512-d PCA space."""
import os, sys
from multiprocessing import Pool
import numpy as np, torch, torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import embed_vist as E
from student import Student

VAL = f"{E.CACHE}/tinyclip/imagenet/val"
E.IMG = VAL  # prep() reads E.IMG; forked pool workers inherit it
names = open(f"{E.CACHE}/tinyclip/imagenet/classnames.txt").read().splitlines()
prompts = [f"a photo of a {c}." for c in names]
files = sorted(f for f in os.listdir(VAL) if f.endswith(".jpg"))
label = np.array([int(open(f"{VAL}/{f[:-4]}.cls").read()) for f in files])
pix = {}


def images(r, mean, std):
    if r not in pix:
        with Pool(12) as p:
            pix[r] = np.stack(p.map(E.prep, [(f, r, mean, std) for f in files], chunksize=32))
    return pix[r]


@torch.no_grad()
def enc(f, x):
    return F.normalize(torch.cat([f(torch.from_numpy(x[i:i + 128]).cuda()).float() for i in range(0, len(x), 128)]), dim=-1)


@torch.no_grad()
def clip(key):
    m, tok, r, mean, std = E.load(key, "cuda"); m.eval()
    with torch.autocast("cuda", torch.bfloat16):
        img = enc(m.encode_image, images(r, mean, std))
        txt = F.normalize(torch.cat([m.encode_text(tok(prompts[i:i + 250])).float() for i in range(0, 1000, 250)]), dim=-1)
    return img, txt


if __name__ == "__main__":
    teacher_txt = None
    for key in sys.argv[1:]:
        if key in E.MODELS:
            img, txt = clip(key)
            if key == "pel336":
                teacher_txt = txt
        else:
            tf = f"{E.CACHE}/distill/imagenet_text_pel336.pt"  # cached: TinyCLIP students can't share a process with stock open_clip
            if teacher_txt is None:
                teacher_txt = torch.load(tf).cuda() if os.path.exists(tf) else clip("pel336")[1]
                torch.save(teacher_txt.cpu(), tf)
            m = Student(os.environ.get("STUDENT", "mnv4m"), pretrained=False).cuda().eval()
            m.load_state_dict(torch.load(f"{E.CACHE}/distill/{key}.pt"))
            P = torch.load(f"{E.CACHE}/distill/{key}_pca.pt").cuda()
            with torch.autocast("cuda", torch.bfloat16):
                img = enc(m, images(224, np.float32(E.CLIP_MEAN), np.float32(E.CLIP_STD)))
            txt = F.normalize(teacher_txt @ P, dim=-1)
        acc = 100 * float(((img @ txt.T).argmax(1).cpu().numpy() == label).mean())
        print(f"{key:24s} ImageNet zero-shot top-1 {acc:.1f}  ({len(files)} photos)", flush=True)
