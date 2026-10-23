"""Platform screenshots. PYTHONPATH=/workspace/tools/pw python3 platforms/web/shots.py OUTDIR [local|live] [scenario,...]
local: serve src/app.html with platforms/web/head.html injected + local pf assets (pre-deploy check).
live : load the deployed dev worker as-is. API calls always go to the dev worker (sample session).
The sandbox browser has no direct network, so every request is proxied through Python."""
import asyncio, json, os, sys, time, urllib.request, urllib.error
from playwright.async_api import async_playwright
B = "https://sparkling-dev.q1f0730.workers.dev"
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(D))
OUT = sys.argv[1]; MODE = sys.argv[2] if len(sys.argv) > 2 else "local"
ONLY = sys.argv[3].split(",") if len(sys.argv) > 3 else None
UA = {
 "ios": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
 "mac": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
 "android": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
 "desktop": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
}
SCEN = {  # name: (ua, w, h, dpr, mobile, routes)
 "ios": ("ios", 390, 844, 3, True, ["notes", "cards", "plan", "sheet"]),
 "mac": ("mac", 1440, 900, 1, False, ["notes", "cards", "sheet"]),
 "android": ("android", 412, 915, 2.625, True, ["notes", "cards"]),
 "desktop1280": ("desktop", 1280, 800, 1, False, ["notes", "cards"]),
 "desktop1440": ("desktop", 1440, 900, 1, False, ["notes"]),
}

def fetch(u, method="GET", data=None, headers=None, ua=UA["desktop"]):
    h = {k: v for k, v in (headers or {}).items() if k.lower() in ("cookie", "content-type", "accept")}
    h["user-agent"] = ua
    rq = urllib.request.Request(u, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(rq, timeout=110) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)

def session():
    s, b, hd = fetch(B + "/api/session", "POST", json.dumps({"mode": "sample"}).encode(), {"content-type": "application/json"})
    return hd.get("Set-Cookie", "").split(";")[0].split("=", 1)[1]

def local_page():
    s = open(os.path.join(ROOT, "src/app.html"), encoding="utf-8").read()
    head = open(os.path.join(D, "head.html"), encoding="utf-8").read()
    if "<!-- pf:begin" not in s:
        i = s.index("</head>"); s = s[:i] + head + s[i:]
    return s.encode()

LOCAL = {"/pf.css": ("pf.css", "text/css"), "/pf.js": ("pf.js", "application/javascript")}

async def run(p, name, tok, errs):
    ua, w, h, dpr, mob, routes = SCEN[name]
    b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob, user_agent=UA[ua])
    await ctx.add_cookies([{"name": "sp", "value": tok, "url": B}])
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(f"{name}: {e}"))
    async def handle(route):
        r = route.request; u = urllib.parse.urlparse(r.url)
        if MODE == "local" and u.netloc.endswith("workers.dev"):
            if r.resource_type == "document":
                return await route.fulfill(status=200, body=local_page(), headers={"content-type": "text/html; charset=utf-8"})
            if u.path in LOCAL:
                f, t = LOCAL[u.path]; return await route.fulfill(status=200, body=open(os.path.join(D, f), "rb").read(), headers={"content-type": t})
            if u.path.startswith("/icons/"):
                return await route.fulfill(status=200, body=open(os.path.join(D, u.path[1:]), "rb").read(), headers={"content-type": "image/png"})
        hd = await r.all_headers()
        if "workers.dev" in r.url: hd["cookie"] = f"sp={tok}"
        try:
            s, body, hh = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd, UA[ua])
            await route.fulfill(status=s, body=body, headers={"content-type": hh.get("Content-Type", "text/plain"), "access-control-allow-origin": "*"})
        except Exception:
            await route.abort()
    await pg.route("**/*", handle)
    for rt in routes:
        if rt == "sheet":
            await pg.goto(B + "/#/notes"); await pg.wait_for_timeout(3500)
            for sel in ["[aria-label=\"Note options\"]"]:
                el = await pg.query_selector(sel)
                if el:
                    await el.click(); break
            await pg.wait_for_timeout(1200)
        else:
            await pg.goto(B + "/#/" + rt); await pg.wait_for_timeout(4000)
            await pg.evaluate("window.scrollTo(0, 260)"); await pg.wait_for_timeout(600)
        info = await pg.evaluate("[document.documentElement.getAttribute('data-os'), document.documentElement.className]")
        path = f"{OUT}/{name}-{rt}.png"; await pg.screenshot(path=path); print(path, info)
    await b.close()

async def main():
    os.makedirs(OUT, exist_ok=True); tok = session(); errs = []
    async with async_playwright() as p:
        for n in SCEN:
            if ONLY and n not in ONLY: continue
            await run(p, n, tok, errs)
    print("errors:", errs[:10])
import urllib.parse
asyncio.run(main())
