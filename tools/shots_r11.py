import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B
from playwright.async_api import async_playwright
async def main(tok, plan, out):
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        async def handle(route):
            r = route.request; hd = await r.all_headers()
            if "sparkling" in r.url: hd["cookie"] = f"sp={tok}"
            try:
                st, bd, h = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd)
                await route.fulfill(status=st, body=bd, headers={"content-type": h.get("Content-Type","text/plain")})
            except Exception: await route.abort()
        await pg.route("**/*", handle)
        await pg.goto(f"{B}/#/plan/{plan}"); await pg.wait_for_timeout(7000)
        await pg.screenshot(path=f"{out}/plan_result.png", full_page=True)
        await pg.click("[data-why-stop='0']"); await pg.wait_for_timeout(3500)
        await pg.screenshot(path=f"{out}/why_stop.png")
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3]))
