"""Render icons + iOS splash PNGs with headless Chromium. PYTHONPATH=/workspace/tools/pw python3 render.py"""
import asyncio, os, subprocess
from playwright.async_api import async_playwright
from mark import icon, splash
D = os.path.dirname(os.path.abspath(__file__))
ICONS = [("icon-192.png", "any", 192), ("icon-512.png", "any", 512), ("maskable-192.png", "maskable", 192),
         ("maskable-512.png", "maskable", 512), ("apple-touch-icon-180.png", "apple", 180), ("favicon-32.png", "any", 32),
         ("icon-1024.png", "apple", 1024)]
# (css w, css h, dpr) portrait; iPhone + iPad
SPLASH = [(440,956,3),(402,874,3),(420,912,3),(430,932,3),(393,852,3),(390,844,3),(428,926,3),(375,812,3),(414,896,2),(375,667,2),
          (1024,1366,2),(834,1194,2),(820,1180,2),(810,1080,2)]
async def shot(pg, svg, w, h, out, transparent):
    await pg.set_viewport_size({"width": w, "height": h})
    await pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("__W__", str(w)).replace("__H__", str(h))}</body></html>')
    await pg.screenshot(path=out, omit_background=transparent, clip={"x":0,"y":0,"width":w,"height":h})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        pg = await b.new_page()
        for name, kind, px in ICONS:
            await shot(pg, icon(kind), px, px, f"{D}/icons/{name}", kind == "any")
        for w, h, r in SPLASH:
            W, H = w*r, h*r
            await shot(pg, splash(W, H), W, H, f"{D}/splash/splash-{W}x{H}.png", False)
        await b.close()
    for f in os.listdir(f"{D}/splash"):
        subprocess.run(["magick", f"{D}/splash/{f}", "+dither", "-colors", "48", "-define", "png:compression-level=9", f"PNG8:{D}/splash/{f}"])
asyncio.run(main())
