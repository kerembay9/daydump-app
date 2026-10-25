"""Text side of a distilled image run for the app's dev model switch (profile > Developer tools > CLIP model):
text_<key>.tflite (train_text.py's tower, dynamic int8), concepts_<key>.tflite (the vocab's "a photo of {n}." through
it, fp16) and phrases_<key>.json (FIXED_PHRASES), next to export_speed.py's vision_<key>*.tflite. Prints the adb pushes.
usage (repo root): .venv/bin/python research/distill/export_text.py <text run> <key>"""
import json, sys
from pathlib import Path
import numpy as np, torch
sys.path[:0] = [str(Path(__file__).parent), "scripts"]
from embed_vist import CACHE
import build_assets as B

run, key = sys.argv[1:3]
out = B.CACHE / "bench"
m, tok, _ = B.load_model()
t = m.text_encoder_without_ddp
t.load_state_dict(torch.load(f"{CACHE}/distill/{run}.pt", map_location="cpu"))
text = B.Towers(m).text
ids = torch.tensor(B.token_ids(tok, B.GOLDEN_PHRASES), dtype=torch.long)
with torch.no_grad():  # the exported tower (m.encode_text) is the one train_text.py trained
    assert torch.allclose(text(ids), torch.nn.functional.normalize(t(ids.int()), dim=-1), atol=1e-5)
    names = json.load(open(B.NATIVE / "vocab.json"))["names"]
    v = torch.cat([text(torch.tensor(B.token_ids(tok, [f"a photo of {n}." for n in names[i:i + 512]]))) for i in range(0, len(names), 512)])
B.export_tflite(text, ids, out / f"text_{key}.tflite")
B.build_concepts(v.numpy(), out / f"concepts_{key}.tflite")
B.build_phrases(out / f"text_{key}.tflite", out / f"phrases_{key}.json")
for f in [f"text_{key}.tflite", f"concepts_{key}.tflite", f"phrases_{key}.json"]:
    print(f"adb push {out / f} /data/local/tmp/ && adb shell \"run-as com.daydump.app sh -c 'mkdir -p files/models && "
          f"cp /data/local/tmp/{f} files/models/'\"")
