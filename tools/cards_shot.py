import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B
from playwright.async_api import async_playwright
TOK=sys.argv[1]; route=sys.argv[2]; out=sys.argv[3]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    async def handle(r0):
        r=r0.request; hd=await r.all_headers(); hd["cookie"]=f"sp={TOK}"
        try:
            st,bd,h=await asyncio.to_thread(fetch,r.url,r.method,r.post_data_buffer,hd)
            await r0.fulfill(status=st,body=bd,headers={"content-type":h.get("Content-Type","text/plain")})
        except Exception: await r0.abort()
    await pg.route("**/*", handle)
    await pg.goto(B+route); await pg.wait_for_timeout(4000)
    await pg.screenshot(path=out); await b.close()
asyncio.run(main())
