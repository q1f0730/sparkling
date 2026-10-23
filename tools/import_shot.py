import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shots import fetch, B, new_session
from playwright.async_api import async_playwright
open("/tmp/lb.csv","w").write("Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-03-01,Past Lives,2023,x,4.5,,,2024-03-01\n2024-04-02,Aftersun,2022,x,5,,,2024-04-02\n2024-05-03,Perfect Days,2023,x,4,,,2024-05-03\n2024-06-04,In the Mood for Love,2000,x,5,Yes,,2024-06-04\n")
TOK = new_session("blank") if True else ""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    async def handle(route):
        r = route.request; hd = await r.all_headers(); hd["cookie"]=f"sp={TOK}"
        try:
            st, bd, h = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd)
            await route.fulfill(status=st, body=bd, headers={"content-type": h.get("Content-Type","text/plain")})
        except Exception: await route.abort()
    await pg.route("**/*", handle)
    await pg.goto(B + "/#/settings/import"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path="shots/import_1.png")
    inp = pg.locator("input[type=file]").first
    await inp.set_input_files("/tmp/lb.csv"); await pg.wait_for_timeout(800); await pg.get_by_text("Import file").first.click(); await pg.wait_for_timeout(4000)
    await pg.screenshot(path="shots/import_2.png"); await pg.wait_for_timeout(1)
    await pg.wait_for_timeout(30000)
    await pg.goto(B + "/#/cards"); await pg.wait_for_timeout(3500)
    await pg.screenshot(path="shots/import_3.png"); await b.close()
asyncio.run(main())
