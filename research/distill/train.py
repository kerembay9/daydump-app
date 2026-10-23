"""Distill the teacher's image embeddings into a student image tower (research/distill/PLAN.md).
usage (repo root): .venv/bin/python research/distill/train.py <student key> <run> [epochs] [teacher key]
v1 loss (git tag distill-v1) on faster code: uint8 workers + GPU normalize, torch.compile, resume (RESUME=1), per-epoch checkpoints.
Each epoch: VIST-val search R@1 of student image + teacher text (both in the 512-d PCA space), then writes
scripts/.cache/distill/vist_emb_val/<run>.npz for score_vist.py (SPLIT=val), the checkpoints and <run>_state.pt."""
import math, os, random, sys, time
import numpy as np, torch, torch.nn.functional as F
from PIL import Image
from torch.optim.swa_utils import AveragedModel, get_ema_multi_avg_fn

os.environ["SPLIT"] = "val"  # before embed_vist reads it: tuning never touches VIST test
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from embed_vist import CACHE, CLIP_MEAN, CLIP_STD, prep
from prep_teacher import apply_crop
from student import Student

D, DIM, SIZE, BATCH = f"{CACHE}/distill", 512, 224, 256
LR = float(os.environ.get("LR", 1e-3))  # env override for the LR sweep
MEAN, STD = np.float32(CLIP_MEAN), np.float32(CLIP_STD)
torch.backends.cudnn.benchmark = True  # fixed shapes (drop_last): autotune convs once


def gpu(x):
    """uint8 NCHW batch from Crops -> normalized float on the GPU (workers ship 4x fewer bytes than float32)."""
    m, s = (torch.tensor(v, device="cuda").view(1, 3, 1, 1) for v in (MEAN, STD))
    return ((x.cuda(non_blocking=True).float() / 255 - m) / s).contiguous(memory_format=torch.channels_last)


def pca(img, txt, dim):
    """Uncentered: top right-singular vectors of unit rows, so dot products (cosines) are kept where the energy is."""
    gram = lambda x: sum(c.double().T @ c.double() for c in x.split(50000))  # x^T x has svd(x)'s right-singular vectors, without its [N, D] workspace (OOM at 660k)
    return torch.linalg.eigh(gram(img) + gram(txt))[1].flip(1)[:, :dim].float()  # [D, dim], descending


class Crops(torch.utils.data.Dataset):
    """One random stored crop per photo per epoch, at the app's input size (bilinear, CLIP mean/std)."""
    def __init__(self, ids, crops, k=None): self.ids, self.crops, self.k = ids, crops, k
    def __len__(self): return len(self.ids)

    def __getitem__(self, i):
        k = random.randrange(self.crops.shape[1]) if self.k is None else self.k
        im = Image.open(f"{D}/oi/{self.ids[i]}.jpg").convert("RGB")
        x = (apply_crop(im, self.crops[i, k], SIZE) * 255).round().astype(np.uint8)  # exact: apply_crop is uint8 / 255
        return torch.from_numpy(x.transpose(2, 0, 1).copy()), i, k


PIX = []  # VIST val pixels (~1.4 GB), the same every epoch: prepped once. A 12-process Pool twice per epoch spiked RAM (systemd-oomd killed a 700k run)


def vist_val(model, ref, P):
    """Student image vectors of VIST val photos (the app's preprocessing) + the teacher's PCA'd text, as score_vist reads."""
    from multiprocessing import Pool
    from embed_vist import IMG
    if not PIX:
        name = {f.rsplit(".", 1)[0]: f for f in os.listdir(IMG)}  # not all .jpg
        with Pool(12) as p:
            PIX.extend(p.map(prep, [(name[i], SIZE, MEAN, STD) for i in ref["ids"]], chunksize=16))
    pix = PIX
    model.eval()
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        img = torch.cat([model(torch.from_numpy(np.stack(pix[i:i + 256])).cuda()).float() for i in range(0, len(pix), 256)])
    model.train()
    proj = lambda a: F.normalize(torch.from_numpy(a).cuda().float() @ P, dim=-1)
    out = {"ids": ref["ids"], "img": F.normalize(img, dim=-1), "q_photo": ref["q_photo"], "q": proj(ref["q"]),
           "concepts": proj(ref["concepts"])}
    return {k: v.cpu().numpy() if torch.is_tensor(v) else v for k, v in out.items()}


def fit(model, ids, crops, t):
    """Mean student-teacher cosine on crop 0 (the app's view). Trained photos vs never-seen ones: a gap = overfitting."""
    dl = torch.utils.data.DataLoader(Crops(ids, crops, 0), batch_size=256, num_workers=14)
    model.eval(); c = []
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        for x, i, _ in dl:
            s = F.normalize(model(gpu(x)).float(), dim=-1)
            c.append((s * t[i.cuda()]).sum(-1))
    model.train()
    return float(torch.cat(c).mean())


def r1(e):
    col = {p: i for i, p in enumerate(e["ids"])}
    own = np.array([col[p] for p in e["q_photo"]])
    s = e["q"] @ e["img"].T
    return 100 * float(((s > s[np.arange(len(own)), own][:, None]).sum(1) == 0).mean())


if __name__ == "__main__":
    key, run = sys.argv[1], sys.argv[2]
    epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    tk = sys.argv[4] if len(sys.argv) > 4 else "pel336"
    T = np.load(f"{D}/teacher_{tk}.npz")
    ref = dict(np.load(f"{D}/vist_emb_val/{tk}.npz"))  # teacher on VIST val: ids, img, q_photo, q, concepts
    n = int(os.environ.get("N", 0)) or None  # first N photos only: one point on the data-scaling curve
    E = T["emb"]  # every T[key] re-reads the zip: the 7 GB array once, not twice (13.6 GB peak fed systemd-oomd)
    emb = torch.from_numpy(E[:n])  # [N, K, Dt] unit, fp16
    bank = torch.from_numpy(T["bank"]).cuda()
    S = f"{D}/{run}_state.pt"  # RESUME=1: continue after the last finished epoch. Weights alone would reset AdamW and the LR schedule
    st = torch.load(S) if os.environ.get("RESUME") else None
    P = st["P"].cuda() if st else pca(emb[:, 0].cuda(), bank, DIM)  # saved: eigenvector signs must not flip
    tgt = torch.cat([F.normalize(c.cuda().float() @ P, dim=-1).half() for c in emb.split(50000)])  # [N, K, 512]; ponytail: all on the GPU (~1.5 GB per 300k photos)
    B = F.normalize(bank.float() @ P, dim=-1)  # [T, 512]
    scale = float(T["logit_scale"])
    tref = {**ref, "img": F.normalize(torch.from_numpy(ref["img"]).cuda() @ P, dim=-1).cpu().numpy(),
            "q": F.normalize(torch.from_numpy(ref["q"]).cuda() @ P, dim=-1).cpu().numpy(),
            "concepts": F.normalize(torch.from_numpy(ref["concepts"]).cuda() @ P, dim=-1).cpu().numpy()}
    H = 5000  # overfitting probe: first H trained photos vs the H right after N (precomputed, never trained on)
    probe = [(T["ids"][:H], T["crops"][:H], tgt[:H, 0].float())]
    if n and len(T["ids"]) >= n + H:
        held = F.normalize(torch.from_numpy(E[n:n + H, 0]).cuda().float() @ P, dim=-1)
        probe.append((T["ids"][n:n + H], T["crops"][n:n + H], held))
    os.makedirs(f"{D}/vist_emb_val", exist_ok=True)
    np.savez(f"{D}/vist_emb_val/{tk}_pca.npz", **tref)
    print(f"{len(emb)} photos x {emb.shape[1]} crops; teacher VIST-val R@1 {r1(ref):.1f} full, {r1(tref):.1f} at 512-d PCA", flush=True)
    del emb, E  # ~7 GB at 660k photos; only tgt (on the GPU) is needed from here

    model = Student(key, DIM).cuda().to(memory_format=torch.channels_last)
    dl = torch.utils.data.DataLoader(Crops(T["ids"][:n], T["crops"][:n]), batch_size=BATCH, shuffle=True, num_workers=14,
                                     drop_last=True, persistent_workers=True, pin_memory=True, prefetch_factor=4)
    ema = AveragedModel(model, multi_avg_fn=get_ema_multi_avg_fn(0.9998), use_buffers=True)  # scored alongside, never trained
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.05, fused=True)
    total, warm = epochs * len(dl), min(500, epochs * len(dl) // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: s / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / (total - warm))))
    step = 0
    if st:
        model.load_state_dict(st["model"]); ema.load_state_dict(st["ema"]); opt.load_state_dict(st["opt"]); sched.load_state_dict(st["sched"]); step = st["step"]
        print(f"resumed after epoch {st['ep']}, step {step}", flush=True)
    cmodel = torch.compile(model)  # training steps only; eval/EMA use the eager model (same weights), saves stay unprefixed
    s0, t0 = step, time.time()
    for ep in range(st["ep"] + 1 if st else 0, epochs):
        for x, i, k in dl:
            t = tgt[i.cuda(), k.cuda()].float()
            with torch.autocast("cuda", torch.bfloat16):
                s = F.normalize(cmodel(gpu(x)).float(), dim=-1)
            cos = (1 - (s * t).sum(-1)).mean()
            kl = F.kl_div(F.log_softmax(s @ B.T * scale, -1), F.log_softmax(t @ B.T * scale, -1), log_target=True, reduction="batchmean")
            loss = cos + kl
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); sched.step(); ema.update_parameters(model); step += 1
            if step % 100 == 0:
                print(f"ep {ep} step {step}/{total} cos {cos.item():.4f} kl {kl.item():.4f} {(time.time() - t0) / (step - s0):.3f}s/step", flush=True)
        e = vist_val(model, ref, P)
        cs = " / ".join(f"{fit(model, *p):.4f}" for p in probe)
        ee = vist_val(ema.module, ref, P)
        print(f"== epoch {ep}: VIST-val R@1 {r1(e):.1f}, EMA {r1(ee):.1f} (teacher {r1(tref):.1f}); cos to teacher, trained / unseen photos: {cs}", flush=True)
        for r, m, v in ((run, model, e), (f"{run}_ema", ema.module, ee)):  # every epoch, so a crash keeps the latest
            np.savez(f"{D}/vist_emb_val/{r}.npz", **v)
            torch.save(m.state_dict(), f"{D}/{r}.pt")
            torch.save(P.cpu(), f"{D}/{r}_pca.pt")
        os.makedirs(f"{D}/ckpt/{run}", exist_ok=True)  # every epoch's weights, kept (ckpt -> second SSD; root disk is nearly full): the best epoch isn't the last
        torch.save(model.state_dict(), f"{D}/ckpt/{run}/ep{ep:02d}.pt"); torch.save(ema.module.state_dict(), f"{D}/ckpt/{run}/ep{ep:02d}_ema.pt")
        torch.save({"model": model.state_dict(), "ema": ema.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(),
                    "step": step, "ep": ep, "P": P.cpu()}, S)
    print("done", run, flush=True)
    os._exit(0)  # everything is saved; skips persistent-worker atexit cleanup ("can't create new thread at interpreter shutdown")
