import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B
from playwright.async_api import async_playwright
async def main(tok):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/workspace/tools/chromium/root/usr/lib/chromium/chromium-headless-shell", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        async def handle(route):
            r=route.request; hd=await r.all_headers()
            if "sparkling" in r.url: hd["cookie"]=f"sp={tok}"
            try:
                s,body,h=await asyncio.to_thread(fetch,r.url,r.method,r.post_data_buffer,hd)
                await route.fulfill(status=s,body=body,headers={"content-type":h.get("Content-Type","text/plain")})
            except Exception: await route.abort()
        await pg.route("**/*",handle)
        await pg.goto(B+"/#/plan"); await pg.wait_for_timeout(2000); await pg.click("text=Make a plan"); await pg.wait_for_selector(".how",timeout=90000); await pg.wait_for_timeout(1500)
        await pg.screenshot(full_page=True,path="shots/r18_plan.png")
        print(await pg.evaluate("document.body.innerText.slice(0,300)"))
        await b.close()
asyncio.run(main(sys.argv[1]))
