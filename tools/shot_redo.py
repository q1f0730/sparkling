"""Correction beat shots: Why sheet with 'Not for me' -> re-plan -> diff banner. usage: PYTHONPATH=/workspace/tools/pw python3 tools/shot_redo.py OUT TOKEN PLAN_ID [lang]"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch
os.environ["LD_LIBRARY_PATH"]="/workspace/tools/chromium/root/usr/lib/aarch64-linux-gnu:/workspace/tools/chromium/root/usr/lib/chromium"
from playwright.async_api import async_playwright
B="https://sparkling-dev.q1f0730.workers.dev"
async def main(out, tok, pid, lang):
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/workspace/tools/chromium/root/usr/lib/chromium/chromium-headless-shell", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script("try{localStorage.setItem('sparkling.prefs',JSON.stringify({lang:'%s'}))}catch(e){}" % lang)
        pg = await ctx.new_page(); errs=[]
        async def handle(route):
            r = route.request; hd = await r.all_headers()
            if "sparkling" in r.url: hd["cookie"] = f"sp={tok}"
            try:
                st, bd, h = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd)
                await route.fulfill(status=st, body=bd, headers={"content-type": h.get("Content-Type", "text/plain")})
            except Exception: await route.abort()
        await pg.route("**/*", handle)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"{B}/#/plan/{pid}"); await pg.wait_for_selector(".stop", timeout=20000)
        await pg.click(".why-stop-btn >> nth=0"); await pg.wait_for_selector(".ws-no"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{out}/why-{lang}.png")
        await pg.click(".ws-no >> nth=0"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=f"{out}/wait-{lang}.png")
        await pg.wait_for_selector(".plan-diff", timeout=90000); await pg.wait_for_timeout(800)
        print("url", pg.url)
        await pg.screenshot(path=f"{out}/diff-{lang}.png")
        print("errors", errs)
        await b.close()
asyncio.run(main(*sys.argv[1:4], sys.argv[4] if len(sys.argv)>4 else "en"))
