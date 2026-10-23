"""Render native launcher icons + splash for the Capacitor/Electron shells from the Sparkling mark."""
import asyncio, os, subprocess
from playwright.async_api import async_playwright
from mark import icon, splash, DEFS, mark
D = os.path.dirname(os.path.abspath(__file__)); P = os.path.dirname(D)
def fg():  # adaptive foreground: transparent, mark inside the 66/108 safe zone
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="__W__" height="__H__">{DEFS}{mark(.56)}</svg>'
async def shot(pg, svg, w, h, out, transparent):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    await pg.set_viewport_size({"width": w, "height": h})
    await pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("__W__", str(w)).replace("__H__", str(h))}</body></html>')
    await pg.screenshot(path=out, omit_background=transparent, clip={"x":0,"y":0,"width":w,"height":h})
async def main():
    res = f"{P}/android/app/src/main/res"
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"]); pg = await b.new_page()
        for dens, s in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
            await shot(pg, icon("apple"), s, s, f"{res}/mipmap-{dens}/ic_launcher.png", False)
            await shot(pg, icon("maskable"), s, s, f"{res}/mipmap-{dens}/ic_launcher_round.png", False)
            await shot(pg, fg(), int(s*2.25), int(s*2.25), f"{res}/mipmap-{dens}/ic_launcher_foreground.png", True)
        for f in subprocess.run(["find", res, "-name", "splash.png"], capture_output=True, text=True).stdout.split():
            w, h = map(int, subprocess.run(["magick", "identify", "-format", "%w %h", f], capture_output=True, text=True).stdout.split())
            await shot(pg, splash(w, h), w, h, f, False)
        await shot(pg, icon("apple"), 1024, 1024, f"{P}/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", False)
        for n in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
            await shot(pg, splash(2732, 2732), 2732, 2732, f"{P}/ios/App/App/Assets.xcassets/Splash.imageset/{n}", False)
        await shot(pg, icon("any"), 1024, 1024, f"{P}/mac/build/icon.png", True)
        await b.close()
    subprocess.run(["sed", "-i", "s/#FFFFFF/#F3EEE3/", f"{res}/values/ic_launcher_background.xml"])
asyncio.run(main())
