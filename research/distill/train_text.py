"""Student text tower (PLAN.md step 4): TinyCLIP-45M's text tower (MIT), fine-tuned into an image run's 512-d teacher PCA
space, so that run's photos can be searched without the teacher. Targets: prep_text.py (no teacher at train time).
usage (repo root): .venv/bin/python research/distill/train_text.py <image run> <run> [epochs]
Loss: cosine to the teacher's text embedding + KL vs the teacher's softmax over a bank of teacher photo embeddings.
Each epoch: VIST-val R@1 of the image run's photos vs student text, then writes vist_emb_val/<run>.npz (score_vist.py,
SPLIT=val), {D}/<run>.pt and <run>_ep<N>.pt (the text tower's state_dict), and <run>_state.pt for RESUME=1.
RESUME=1 continues a crashed run after its last finished epoch. INIT=<file.pt> starts from a saved tower (no lstsq init)
with a fresh schedule, to go on past a finished run: INIT={D}/<run>.pt ... <new run> <more epochs>."""
import json, math, os, sys
import numpy as np, torch, torch.nn.functional as F

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__)), os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts")]
from train import D, r1  # sets SPLIT=val
from embed_vist import CACHE
import build_assets as B

BATCH, LR, BANK = int(os.environ.get("BATCH", 512)), float(os.environ.get("LR", 1e-4)), 65536


def encode(t, ids):
    return F.normalize(t(ids.int()).float(), dim=-1)


def vist(t, ref, q, prompts):
    """The image run's VIST-val file with the student's text in place of the teacher's."""
    t.eval()
    with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
        enc = lambda x: torch.cat([encode(t, torch.tensor(B.token_ids(tok, x[i:i + 512])).cuda()) for i in range(0, len(x), 512)]).cpu().numpy()
        out = {**ref, "q": enc(q), "concepts": enc(prompts)}
    t.train()
    return out


if __name__ == "__main__":
    img_run, run = sys.argv[1], sys.argv[2]
    epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    P = torch.load(f"{D}/{img_run}_pca.pt").cuda()  # the image run's basis: student text must land where its photos are
    X = np.load(f"{D}/text/teacher_text_pel336.npz")
    ids = torch.from_numpy(X["tok"].astype(np.int32)).cuda()  # [N, 77]
    tgt = torch.cat([F.normalize(torch.from_numpy(c).cuda().float() @ P, dim=-1).half() for c in np.array_split(X["emb"], 50)])
    T = np.load(f"{D}/teacher_pel336.npz")
    E = T["emb"]  # ~7 GB, read once
    bank = F.normalize(torch.from_numpy(E[:BANK, 0]).cuda().float() @ P, dim=-1)  # [BANK, 512] photos, the app's view
    scale = float(T["logit_scale"])
    del E

    ref = dict(np.load(f"{D}/vist_emb_val/{img_run}.npz"))
    have = set(ref["ids"])
    dii = json.load(open(f"{CACHE}/vist/ann/dii/val.description-in-isolation.json"))["annotations"]
    qs = [(a[0]["photo_flickr_id"], a[0]["text"]) for a in dii if a[0]["photo_flickr_id"] in have]  # embed_vist's order
    assert [p for p, _ in qs] == list(ref["q_photo"])
    q = [s for _, s in qs]
    prompts = [f"a photo of {n}." for n in json.load(open(f"{B.NATIVE}/vocab.json"))["names"]]

    m, tok, _ = B.load_model()
    t = m.text_encoder_without_ddp.cuda().requires_grad_(True)
    # Init: least-squares text_projection from TinyCLIP's pooled features to the targets, so step 0 already points the right way.
    if os.environ.get("INIT"):
        t.load_state_dict(torch.load(os.environ["INIT"]))
    else:
        with torch.no_grad(), torch.autocast("cuda", torch.bfloat16):
            t.get_proj_feature = lambda x: x
            s = torch.randperm(len(ids), device="cuda")[:100000]
            f = torch.cat([t(ids[i].int()).float() for i in s.split(1000)])
            del t.get_proj_feature
            t.text_projection.copy_(torch.linalg.lstsq(f, tgt[s].float()).solution)
            del f
    e = vist(t, ref, q, prompts)
    print(f"{len(ids)} texts; init VIST-val R@1 {r1(e):.1f} (teacher text {r1(ref):.1f})", flush=True)

    opt = torch.optim.AdamW(t.parameters(), lr=LR, weight_decay=0.05, fused=True)
    steps = len(ids) // BATCH
    total, warm = epochs * steps, 500
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: s / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / (total - warm))))
    step, ep0 = 0, 0
    if os.environ.get("RESUME") == "1" and os.path.exists(f"{D}/{run}_state.pt"):
        S = torch.load(f"{D}/{run}_state.pt")
        t.load_state_dict(S["t"]); opt.load_state_dict(S["opt"]); sched.load_state_dict(S["sched"])
        step, ep0 = S["step"], S["ep"] + 1
        print(f"resumed after epoch {S['ep']}, step {step}", flush=True)
    for ep in range(ep0, epochs):
        for b in torch.randperm(len(ids), device="cuda")[:steps * BATCH].view(steps, BATCH):
            y = tgt[b].float()
            with torch.autocast("cuda", torch.bfloat16):
                s = encode(t, ids[b])
            cos = (1 - (s * y).sum(-1)).mean()
            kl = F.kl_div(F.log_softmax(s @ bank.T * scale, -1), F.log_softmax(y @ bank.T * scale, -1), log_target=True, reduction="batchmean")
            loss = cos + kl
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); sched.step(); step += 1
            if step % 200 == 0:
                print(f"ep {ep} step {step}/{total} cos {cos.item():.4f} kl {kl.item():.4f}", flush=True)
        e = vist(t, ref, q, prompts)
        print(f"== epoch {ep}: VIST-val R@1 {r1(e):.1f} (teacher text {r1(ref):.1f})", flush=True)
        np.savez(f"{D}/vist_emb_val/{run}.npz", **e)
        torch.save(t.state_dict(), f"{D}/{run}.pt")
        torch.save(t.state_dict(), f"{D}/{run}_ep{ep}.pt")
        torch.save({"t": t.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "step": step, "ep": ep}, f"{D}/{run}_state.pt")
    print("done", run, flush=True)
