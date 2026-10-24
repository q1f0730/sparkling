#!/usr/bin/env python3
"""Apply a zh key/value JSON to parts/r7_i18n.js safely.
usage: i18n_patch.py patch.json [--dry]
Checks: valid UTF-8 JSON object, non-empty strings, {placeholders} and %s match key,
no existing key overwritten with different text (reported, skipped), CJK present in value.
Appends one Object.assign(ZH, {...}) block."""
import json, re, sys
T = "parts/r7_i18n.js"
def main():
    p = json.load(open(sys.argv[1], encoding="utf-8")); dry = "--dry" in sys.argv
    assert isinstance(p, dict) and p, "patch must be a non-empty object"
    src = open(T, encoding="utf-8").read(); ok = {}; bad = []
    for k, v in p.items():
        if not isinstance(k, str) or not isinstance(v, str) or not k.strip() or not v.strip():
            bad.append((k, "empty/non-string")); continue
        ph = lambda s: sorted(re.findall(r"\{[^}]*\}|%[sd]", s))
        if ph(k) != ph(v): bad.append((k, "placeholder mismatch")); continue
        if not re.search(r"[\u4e00-\u9fff]", v): bad.append((k, "no CJK")); continue
        if json.dumps(k, ensure_ascii=False) in src: bad.append((k, "key exists")); continue
        ok[k] = v
    for k, why in bad: print("SKIP", repr(k), why)
    if ok and not dry:
        body = ",\n".join("  %s: %s" % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False)) for k, v in ok.items())
        open(T, "a", encoding="utf-8").write("Object.assign(ZH, {\n%s\n});\n" % body)
    print("applied" if not dry else "dry", len(ok), "skipped", len(bad))
main()
