#!/usr/bin/env python3
"""Sparkling front end: src/app/** modules  <->  src/app.html (the single served page, a GENERATED artifact).

  python3 tools/build_app.py            sync (default, safe): modules changed -> rebuild app.html;
                                        app.html changed (legacy tool / merge) and modules untouched -> absorb it back;
                                        both changed since the last sync -> refuse (resolve by hand).
  python3 tools/build_app.py --build    concatenate modules -> src/app.html (overwrites app.html edits!)
  python3 tools/build_app.py --absorb   split src/app.html back into the modules (overwrites module edits!)
  python3 tools/build_app.py --check    exit 1 if src/app.html != fresh build (also run by tools/check_html.mjs)
  python3 tools/build_app.py --split FILE   one-time: write modules from FILE using the manifest anchors

Format: src/app/manifest.json lists modules in page order. The page is the plain byte concatenation of the
modules (no wrappers, no ES modules): every js/*.js file is a slice of ONE classic <script>, so top-level
const/let/function stay shared exactly as before the split. Order matters; do not reorder modules.
Each module (except the first) has an "anchor": the exact text its first line(s) start with. --absorb cuts
app.html at those anchors, so keep a module's first lines stable (editing below them is free).
Edit under the per-file lock (tools/lock.sh take app:js/notes.js) or the global lock for cross-module work."""
import hashlib, json, os, sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(R, "src", "app")
OUT = os.path.join(R, "src", "app.html")
MAN = os.path.join(D, "manifest.json")
STAMP = os.path.join(D, ".last-sync.sha256")  # sha of app.html as of the last build/absorb


def manifest():
    return json.load(open(MAN, encoding="utf-8"))["modules"]


def rd(p):
    return open(p, "rb").read()


def build_bytes():
    return b"".join(rd(os.path.join(D, m["file"])) for m in manifest())


def sha(b):
    return hashlib.sha256(b).hexdigest()


def cut(page):
    """Split page bytes at the manifest anchors -> list of (file, bytes)."""
    mods = manifest(); pos = [0]
    for m in mods[1:]:
        a = m["anchor"].encode("utf-8")
        hits = []
        k = page.find(a)
        while k != -1:
            if k == 0 or page[k - 1:k] == b"\n": hits.append(k)
            k = page.find(a, k + 1)
        if len(hits) != 1:
            sys.exit("absorb: anchor for %s found %d times at line start (need exactly 1): %r" % (m["file"], len(hits), m["anchor"][:80]))
        if hits[0] <= pos[-1]:
            sys.exit("absorb: anchor for %s is out of order" % m["file"])
        pos.append(hits[0])
    pos.append(len(page))
    return [(m["file"], page[pos[i]:pos[i + 1]]) for i, m in enumerate(mods)]


def write_modules(parts):
    n = 0
    for f, b in parts:
        p = os.path.join(D, f); os.makedirs(os.path.dirname(p), exist_ok=True)
        if not os.path.exists(p) or rd(p) != b:
            open(p, "wb").write(b); n += 1
    return n


def stamp(b):
    open(STAMP, "w").write(sha(b) + "\n")


def last():
    return open(STAMP).read().strip() if os.path.exists(STAMP) else ""


def do_build():
    b = build_bytes()
    if not os.path.exists(OUT) or rd(OUT) != b:
        open(OUT, "wb").write(b); print("built src/app.html", len(b), "bytes from", len(manifest()), "modules")
    else:
        print("src/app.html up to date", len(b), "bytes")
    stamp(b)


def do_absorb():
    page = rd(OUT); n = write_modules(cut(page))
    assert build_bytes() == page, "absorb round-trip mismatch"
    stamp(page); print("absorbed src/app.html into", n, "changed module(s)")


def main(a):
    if a[:1] == ["--split"]:
        page = rd(a[1]); n = write_modules(cut(page)); assert build_bytes() == page; print("split ->", n, "modules"); return
    if a[:1] == ["--build"]: return do_build()
    if a[:1] == ["--absorb"]: return do_absorb()
    if a[:1] == ["--check"]:
        b = build_bytes(); h = rd(OUT) if os.path.exists(OUT) else b""
        if b != h:
            sys.exit("src/app.html is not a fresh build of src/app/*. Edit the modules and run python3 tools/build_app.py "
                     "(if you patched app.html with a legacy tool, run python3 tools/build_app.py --absorb).")
        print("src/app.html == build(src/app/*)", len(b), "bytes"); return
    # sync
    b = build_bytes(); h = rd(OUT); L = last()
    if b == h: stamp(b); print("in sync", len(b), "bytes"); return
    mods_changed, page_changed = sha(b) != L, sha(h) != L
    if mods_changed and not page_changed: return do_build()
    if page_changed and not mods_changed: return do_absorb()
    sys.exit("sync: BOTH src/app.html and src/app/* changed since the last sync. Keep one side: "
             "--build (modules win) or --absorb (app.html wins), after moving the other side's edits over.")


if __name__ == "__main__":
    main(sys.argv[1:])
