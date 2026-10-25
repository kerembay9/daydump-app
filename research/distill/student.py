"""Student image tower: timm MobileNetV4-Conv + linear head -> 512-d (the app's DIM).
Output is NOT L2-normalized (as the shipped GPU tower; Kotlin normalizes)."""
import torch, timm

ARCHS = {  # key -> timm id (ImageNet-12k pretrained where timm has it)
    "mnv4s": "mobilenetv4_conv_small.e3600_r256_in1k",
    "mnv4m": "mobilenetv4_conv_medium.e250_r384_in12k",
    "mnv4l": "mobilenetv4_conv_large.e600_r384_in1k",
}


TINYCLIP = {"tc22": "22m", "tc45": "45m"}  # CLIP-pretrained image towers (MIT), via build_assets' TinyCLIP loader


class Student(torch.nn.Module):
    def __init__(self, key, dim=512, pretrained=True):
        super().__init__()
        if key in TINYCLIP:  # always pretrained (the point of these); output is its CLIP embedding
            import os, sys
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../scripts"))
            import build_assets as B
            self.body = B.load_model(TINYCLIP[key])[0].visual.requires_grad_(True).train()
            self.head = torch.nn.Linear(self.body.output_dim, dim)
            return
        self.body = timm.create_model(ARCHS[key], pretrained=pretrained, num_classes=0)
        self.head = torch.nn.Linear(getattr(self.body, "head_hidden_size", None) or self.body.num_features, dim)

    def forward(self, px):
        return self.head(self.body(px))
