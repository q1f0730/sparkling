import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B, new_session
from playwright.async_api import async_playwright
async def main():
    tok = new_session("empty") if False else new_session("sample")
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def handle(route):
            r = route.request; hd = await r.all_headers(); hd["cookie"]=f"sp={tok}"
            st, bd, h = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd)
            await route.fulfill(status=st, body=bd, headers={"content-type": h.get("Content-Type","text/plain")})
        await pg.route("**/*", handle)
        await pg.goto(B+"/#/notes"); await pg.wait_for_timeout(3000)
        ta = pg.locator("textarea").first
        await ta.fill("Rewatched Perfect Days tonight and then Aftersun. Still thinking about In the Mood for Love.")
        await pg.keyboard.press("Control+Enter")
        for i in range(30):
            await pg.wait_for_timeout(700)
            n = await pg.locator(".fx-grow").count()
            if n:
                await pg.wait_for_timeout(350); await pg.screenshot(path="/workspace/work/sparkling/shots/grow_mid.png"); print("captured",n); break
        print(errs); await b.close()
asyncio.run(main())
