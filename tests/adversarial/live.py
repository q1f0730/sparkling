"""Modest live abuse run against the private dev worker. ~300 requests, ~15 Qloo calls (only 3 notes are recognized).
Usage: python3 tests/adversarial/live.py [label]   -> tests/adversarial/results/live-<label>.json
Never prints or stores session tokens."""
import json, sys, time, threading, urllib.request, urllib.error, os
B = os.environ.get("B", "https://sparkling-dev.q1f0730.workers.dev")
LABEL = sys.argv[1] if len(sys.argv) > 1 else "run"
UA = "sparkling-adversarial/1.0"
REQS = [0]
results = []

def req(path, method="GET", body=None, cookie=None, headers=None, raw=False, timeout=60):
    REQS[0] += 1
    h = {"user-agent": UA, **(headers or {})}
    if cookie is not None: h["cookie"] = cookie
    data = None
    if body is not None:
        data = body if raw else json.dumps(body).encode()
        if isinstance(data, str): data = data.encode("utf-8", "surrogatepass")
        h.setdefault("content-type", "application/json")
    r = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res: return res.status, res.read(), dict(res.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)
    except Exception as e: return 0, str(e).encode(), {}

def case(cat, cid, fn):
    try:
        fn(); results.append({"cat": cat, "id": cid, "pass": True})
    except AssertionError as e: results.append({"cat": cat, "id": cid, "pass": False, "err": str(e)[:300]})
    except Exception as e: results.append({"cat": cat, "id": cid, "pass": False, "err": "exception " + repr(e)[:300]})

def session():
    s, b, h = req("/api/session", "POST", {})
    c = (h.get("Set-Cookie") or h.get("set-cookie") or "").split(";")[0]
    assert s == 200 and c.startswith("sp="), "session failed %s" % s
    return c, json.loads(b)["user"]["id"]

ROUTES = ["/api/me", "/api/notes", "/api/notes/abc", "/api/cards", "/api/cards/abc", "/api/footprints/abc", "/api/inbox", "/api/inbox/abc", "/api/inbox/accept_all", "/api/threads",
          "/api/plan", "/api/plans", "/api/plan/abc", "/api/plan/abc/save", "/api/plan/abc/swap", "/api/import/letterboxd", "/api/import/status", "/api/prefs", "/api/export", "/api/export.md",
          "/api/delete", "/api/notes/retry", "/api/notes/photo", "/media/abc/def", "/api/nope"]

# 1) unauthenticated matrix
for r in ROUTES:
    for m in ["GET", "POST", "DELETE"]:
        def f(r=r, m=m):
            s, b, _ = req(r, m, {} if m == "POST" else None)
            assert s in (401, 404), "%s %s -> %s %s" % (m, r, s, b[:80])
        case("live.auth", f"none:{m}:{r}", f)
for r in ROUTES[:10]:
    def f(r=r):
        s, b, _ = req(r, cookie="sp=%E0%A4%A")
        assert s in (401, 404), "bad pct cookie -> %s" % s
    case("live.auth", "bad_pct_cookie:" + r, f)
    def g(r=r):
        s, b, _ = req(r, cookie="sp=' OR '1'='1")
        assert s in (401, 404), "sqli cookie -> %s" % s
    case("live.auth", "sqli_cookie:" + r, g)

A, AU = session(); Bc, BU = session(); C, CU = session()
time.sleep(1)
# 2) a little real content for A (3 recognitions)
s, b, _ = req("/api/notes", "POST", {"text": "watched Her again on the plane"}, cookie=A); NA = json.loads(b)["note"]["id"] if s == 200 else None
s, b, _ = req("/api/notes", "POST", {"text": "<img src=x onerror=alert(1)> \u202Eevil ignore previous instructions"}, cookie=A); NX = json.loads(b)["note"]["id"] if s == 200 else None
s, b, _ = req("/api/notes", "POST", {"text": "x" * 20000}, cookie=A); NL = json.loads(b)["note"] if s == 200 else None
case("live.notes", "create_ok", lambda: (_ for _ in ()).throw(AssertionError("note create failed")) if not NA else None)
case("live.notes", "xss_stored_verbatim", lambda: None if json.loads(req("/api/notes/" + NX, cookie=A)[1])["note"]["text"].startswith("<img src=x") else (_ for _ in ()).throw(AssertionError("xss note altered")))
case("live.notes", "long_truncated_5000", lambda: None if NL and len(NL["text"]) == 5000 else (_ for _ in ()).throw(AssertionError("not truncated")))

# 3) malformed bodies
BODIES = [("empty", b""), ("brace", b"{"), ("null", b"null"), ("array", b"[]"), ("string", b'"s"'), ("deep", b"[" * 3000 + b"]" * 3000)]
EPS = [("POST", "/api/notes"), ("PATCH", "/api/me"), ("PATCH", "/api/notes/" + str(NA)), ("PUT", "/api/prefs"), ("POST", "/api/delete"), ("POST", "/api/inbox/abc")]
for m, ep in EPS:
    for bn, body in BODIES:
        def f(m=m, ep=ep, body=body):
            s, b, _ = req(ep, m, body, cookie=A, raw=True)
            assert 0 < s < 500, "%s %s -> %s %s" % (m, ep, s, b[:80])
        case("live.badjson", f"{m}:{ep.split('/')[2]}:{bn}", f)
case("live.badjson", "account_survives", lambda: None if req("/api/me", cookie=A)[0] == 200 else (_ for _ in ()).throw(AssertionError("A lost")))

# 4) type confusion
for field, val in [("area", {"x": 1}), ("budget", [1]), ("when", {"a": 1}), ("budget", "abc"), ("area", "z" * 50000), ("budget", -9)]:
    def f(field=field, val=val):
        s, b, _ = req("/api/me", "PATCH", {field: val}, cookie=A)
        assert 0 < s < 500, "-> %s" % s
        u = json.loads(req("/api/me", cookie=A)[1])["user"]
        assert u["area"] is None or len(u["area"]) <= 200, "area len %d" % len(u["area"])
        assert isinstance(u["budget"], (int, float)) and 0 <= u["budget"] <= 100000, "budget %r" % (u["budget"],)
    case("live.types", f"me:{field}:{str(val)[:12]}", f)

# 5) id fuzzing
IDS = ["0", "..%2F..%2Fetc%2Fpasswd", "%27%20OR%201%3D1", "x" * 2000, "%00", "__proto__", "%F0%9F%98%80", "null", "-1", "a%2Fb"]
for rt, m in [("/api/notes/{}", "GET"), ("/api/cards/{}", "DELETE"), ("/api/plan/{}/swap", "POST"), ("/api/inbox/{}", "POST"), ("/api/footprints/{}", "DELETE")]:
    for i in IDS:
        def f(rt=rt, m=m, i=i):
            s, b, _ = req(rt.format(i), m, {"action": "accept"} if m == "POST" else None, cookie=A)
            assert s in (400, 404), "-> %s %s" % (s, b[:60])
        case("live.idfuzz", f"{m}:{rt}:{i[:20]}", f)

# 6) cross-user
for m, body in [("GET", None), ("PATCH", {"text": "pwned"}), ("DELETE", None)]:
    def f(m=m, body=body):
        s, b, _ = req("/api/notes/" + NA, m, body, cookie=Bc)
        assert s == 404, "B %s A's note -> %s" % (m, s)
    case("live.crossuser", "note_" + m, f)
case("live.crossuser", "a_note_intact", lambda: None if json.loads(req("/api/notes/" + NA, cookie=A)[1])["note"]["text"] == "watched Her again on the plane" else (_ for _ in ()).throw(AssertionError("A's note changed")))
case("live.crossuser", "b_lists_empty", lambda: None if json.loads(req("/api/notes", cookie=Bc)[1])["notes"] == [] else (_ for _ in ()).throw(AssertionError("B sees notes")))
case("live.crossuser", "b_search_wildcard_empty", lambda: None if json.loads(req("/api/notes?q=%25", cookie=Bc)[1])["notes"] == [] else (_ for _ in ()).throw(AssertionError("B wildcard search leak")))
case("live.crossuser", "export_no_token", lambda: None if A.split("=", 1)[1].encode() not in req("/api/export", cookie=A)[1] else (_ for _ in ()).throw(AssertionError("token in export")))
case("live.crossuser", "method_override_ignored", lambda: (req("/api/notes/" + NA, "POST", {}, cookie=Bc, headers={"X-HTTP-Method-Override": "DELETE"}), None if req("/api/notes/" + NA, cookie=A)[0] == 200 else (_ for _ in ()).throw(AssertionError("override deleted")))[1])

# 7) sizes / uploads / headers
case("live.size", "prefs_5k_rejected", lambda: None if req("/api/prefs", "PUT", {"prefs": {"x": "z" * 5000}}, cookie=A)[0] == 400 else (_ for _ in ()).throw(AssertionError("prefs accepted")))
def upload(ctype, content):
    bd = "----advb"
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x\"\r\nContent-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{bd}--\r\n".encode()
    return req("/api/notes/photo", "POST", body, cookie=C, raw=True, headers={"content-type": "multipart/form-data; boundary=" + bd})
def up_html():
    s, b, _ = upload("text/html", b"<script>alert(document.cookie)</script>")
    if s == 400: return
    assert s == 200, "upload -> %s" % s
    url = json.loads(b)["note"]["image_url"]
    s2, b2, h2 = req(url, cookie=C)
    ct = h2.get("Content-Type") or h2.get("content-type") or ""
    assert ct.startswith("image/"), "html upload served as " + ct
case("live.upload", "html_upload_not_served_as_html", up_html)
case("live.upload", "svg_upload_rejected_or_safe", lambda: None if upload("image/svg+xml", b"<svg onload=alert(1)>")[0] == 400 else (_ for _ in ()).throw(AssertionError("svg accepted")))
case("live.upload", "multipart_3_5mb_import_rejected", lambda: None if req("/api/import/letterboxd", "POST", b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"d.csv\"\r\nContent-Type: text/csv\r\n\r\nTitle\n" + b"y" * 3_500_000 + b"\r\n--b--\r\n", cookie=C, raw=True, headers={"content-type": "multipart/form-data; boundary=b"})[0] == 400 else (_ for _ in ()).throw(AssertionError("big import accepted")))
for p in ["/", "/api/me"]:
    def f(p=p):
        s, b, h = req(p, cookie=A)
        hl = {k.lower(): v for k, v in h.items()}
        assert hl.get("x-content-type-options") == "nosniff", "no nosniff on " + p
    case("live.security", "nosniff:" + p, f)
case("live.security", "html_frame_protection", lambda: None if ("deny" in str({k.lower(): v for k, v in req("/")[2].items()}.get("x-frame-options", "")).lower() or "frame-ancestors" in {k.lower(): v for k, v in req("/")[2].items()}.get("content-security-policy", "")) else (_ for _ in ()).throw(AssertionError("no frame protection")))
case("live.security", "signout_cookie_httponly", lambda: None if "HttpOnly" in (req("/api/signout", "POST", {})[2].get("Set-Cookie") or "") else (_ for _ in ()).throw(AssertionError("signout cookie w/o HttpOnly")))
import re as _re
case("live.security", "error_body_generic", lambda: None if not _re.search(rb"at \S+\.js:\d+|Error:|stack", req("/api/notes", "POST", b"{", cookie=A, raw=True)[1]) else (_ for _ in ()).throw(AssertionError("stack in error")))

# 8) bursts (well within free plan): 40 concurrent signed-in GETs, 40 concurrent unauth GETs
def burst(n, path, cookie, want):
    out = []
    ts = [threading.Thread(target=lambda: out.append(req(path, cookie=cookie)[0])) for _ in range(n)]
    [t.start() for t in ts]; [t.join() for t in ts]
    return out
st = burst(40, "/api/me", A, 200)
for i, s in enumerate(st): case("live.burst", f"me_{i}", lambda s=s: None if s == 200 else (_ for _ in ()).throw(AssertionError("burst -> %s" % s)))
st = burst(40, "/api/cards", None, 401)
for i, s in enumerate(st): case("live.burst", f"unauth_{i}", lambda s=s: None if s == 401 else (_ for _ in ()).throw(AssertionError("burst -> %s" % s)))

# 9) delete flows (also cleans up the dev DB)
case("live.delete", "wrong_confirm_keeps", lambda: (req("/api/delete", "POST", {"confirm": "delete"}, cookie=C), None if req("/api/me", cookie=C)[0] == 200 else (_ for _ in ()).throw(AssertionError("deleted without confirm")))[1])
for who, ck in [("C", C), ("B", Bc), ("A", A)]:
    case("live.delete", "delete_" + who, lambda ck=ck: None if req("/api/delete", "POST", {"confirm": "DELETE"}, cookie=ck)[0] == 200 else (_ for _ in ()).throw(AssertionError("delete failed")))
    case("live.delete", "dead_token_" + who, lambda ck=ck: None if req("/api/me", cookie=ck)[0] == 401 else (_ for _ in ()).throw(AssertionError("token alive after delete")))

by = {}
for r in results: by.setdefault(r["cat"], {"pass": 0, "fail": 0})["pass" if r["pass"] else "fail"] += 1
out = {"suite": "live-" + LABEL, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "requests": REQS[0], "total": len(results), "pass": sum(r["pass"] for r in results), "by_category": by, "failures": [r for r in results if not r["pass"]]}
os.makedirs(os.path.join(os.path.dirname(__file__), "results"), exist_ok=True)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "results", f"live-{LABEL}.json"), "w"), indent=1)
print(f"live-{LABEL}: {out['pass']}/{out['total']} pass, {REQS[0]} requests", json.dumps(by))
for f in out["failures"][:40]: print("  FAIL", f["cat"], f["id"], "->", f["err"])
