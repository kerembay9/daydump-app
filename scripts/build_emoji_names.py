"""src/services/index/emojiNames.json: emoji -> English name, for search (queryLang.ts turns "🐶" into "dog face").
Source: Unicode's emoji-test.txt (Unicode License v3), https://unicode.org/Public/emoji/latest/emoji-test.txt.
Keys drop U+FE0F; skin-tone variants are left out (queryLang strips the modifiers before lookup).
usage (repo root): python3 -I scripts/build_emoji_names.py <emoji-test.txt>"""
import json, re, sys
from pathlib import Path

out = {}
for line in open(sys.argv[1], encoding="utf-8"):
    m = re.match(r"^([0-9A-F ]+?)\s*; (fully-qualified|component)\s*# \S+ E[\d.]+ (.+)$", line.strip())
    if not m or m[2] == "component":
        continue
    cps = [int(c, 16) for c in m[1].split()]
    if any(0x1F3FB <= c <= 0x1F3FF for c in cps):
        continue
    out["".join(chr(c) for c in cps if c != 0xFE0F)] = m[3].replace("flag: ", "flag of ").replace(":", "")
dest = Path(__file__).parent.parent / "src/services/index/emojiNames.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(len(out), "emoji,", dest.stat().st_size // 1024, "KB")
