import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B, new_session, warm
from playwright.async_api import async_playwright
async def main(tok):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
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
        await ctx.add_init_script('localStorage.setItem("sparkling.prefs",JSON.stringify({lang:"zh"}))')
        await pg.goto(B+"/#/plan"); await pg.wait_for_timeout(2500)
        await pg.evaluate("[...document.querySelectorAll('#view button')].filter(b=>b.className.includes('prim')||b.type=='submit').forEach(b=>b.click())")
        await pg.wait_for_selector(".how",timeout=100000)
        await pg.evaluate("document.querySelector('.how').open=true;document.querySelector('.how').scrollIntoView()"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/r20/trace_zh.png")
        print(await pg.evaluate("[...document.querySelectorAll('.trace li .trace-t, .trace-head')].map(e=>e.innerText).join('\\n')"))
        await b.close()
tok=new_session(); warm(tok, 80)
asyncio.run(main(tok))
