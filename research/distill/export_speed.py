"""Students -> fp16 LiteRT GPU files + their int8 CPU twins (depthwise left fp32) (vision_<key>_dw8, the gpu-cpu8 helper) for the in-app index bench.
usage (repo root): .venv/bin/python research/distill/export_speed.py [key[=weights.pt] ...]; untrained without weights. Prints the adb push lines."""
import sys
from pathlib import Path
import numpy as np, torch, litert_torch
from ai_edge_quantizer import quantizer, recipe, recipe_manager, algorithm_manager
from ai_edge_quantizer.qtyping import TFLOperationName
from ai_edge_litert.interpreter import Interpreter

sys.path[:0] = [str(Path(__file__).parent), "scripts"]
from student import ARCHS, Student
from build_assets import CACHE, GOLDEN_IMAGE, preprocess

x = torch.from_numpy(preprocess(GOLDEN_IMAGE))
rm = recipe_manager.RecipeManager()
rm.add_weight_only_config(regex=".*", operation_name=TFLOperationName.ALL_SUPPORTED, num_bits=16,
                          algorithm_key=algorithm_manager.AlgorithmName.FLOAT_CASTING)
# The CPU twin leaves depthwise convs fp32: XNNPACK has no dynamic-int8 depthwise kernel, so int8 ones fall back to
# TFLite's slow hybrid kernels (MNV4-M desktop 4 threads: all int8 7.0 ms, depthwise fp32 4.5, fp32 4.0). +0.5 MB.
dw = recipe_manager.RecipeManager()
for op in (TFLOperationName.CONV_2D, TFLOperationName.FULLY_CONNECTED):
    dw.add_dynamic_config(regex=".*", operation_name=op, num_bits=8)
for arg in sys.argv[1:] or ARCHS:
    key, _, w = arg.partition("=")
    m = Student(key, pretrained=not w).eval()
    if w:
        m.load_state_dict(torch.load(w, map_location="cpu"))
    with torch.no_grad():
        ref = m(x).numpy()[0]
    f32 = CACHE / "fp32" / f"vision_{key}.tflite"; f32.parent.mkdir(parents=True, exist_ok=True)
    litert_torch.convert(m, (x,)).export(str(f32))
    print(f"{key}: {sum(p.numel() for p in m.parameters()) / 1e6:.1f}M params")
    for name, rp in ((f"vision_{key}", rm.get_quantization_recipe()), (f"vision_{key}_dw8", dw.get_quantization_recipe())):
        q = quantizer.Quantizer(str(f32)); q.load_quantization_recipe(rp)
        out = CACHE / "bench" / f"{name}.tflite"; out.write_bytes(q.quantize().quantized_model)
        it = Interpreter(model_path=str(out)); it.allocate_tensors()
        it.set_tensor(it.get_input_details()[0]["index"], x.numpy()); it.invoke()
        e = it.get_tensor(it.get_output_details()[0]["index"])[0]
        print(f"  {out.name}: {out.stat().st_size / 1e6:.1f} MB, cosine {float(ref @ e / np.linalg.norm(ref) / np.linalg.norm(e)):.4f}")
        print(f"  adb push {out} /data/local/tmp/ && adb shell \"run-as com.daydump.app sh -c 'mkdir -p files/models && "
              f"cat /data/local/tmp/{out.name} > files/models/{out.name}'\"")
