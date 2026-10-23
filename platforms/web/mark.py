"""SVG sources for the Sparkling mark (warm oat + sage)."""
STAR = "M512 150 Q540 484 874 512 Q540 540 512 874 Q484 540 150 512 Q484 484 512 150Z"
def mark(scale=1.0, cx=512, cy=512):
    # main sage sparkle + small butter sparkle, positioned around (cx,cy)
    s = scale
    return f'''<g transform="translate({cx} {cy}) scale({s}) translate(-512 -512)">
  <path d="{STAR}" fill="url(#sage)"/>
  <path d="{STAR}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="6" transform="translate(0 4)" opacity=".5"/>
  <g transform="translate(742 282) scale(.26) translate(-512 -512)"><path d="{STAR}" fill="#c99a3a"/></g>
  <g transform="translate(300 760) scale(.14) translate(-512 -512)"><path d="{STAR}" fill="#7f9f69"/></g>
</g>'''
DEFS = '''<defs>
 <linearGradient id="oat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f4ea"/><stop offset="1" stop-color="#ece4d2"/></linearGradient>
 <radialGradient id="glow" cx=".28" cy=".82" r=".75"><stop offset="0" stop-color="#dfe7d3" stop-opacity=".95"/><stop offset="1" stop-color="#dfe7d3" stop-opacity="0"/></radialGradient>
 <radialGradient id="glow2" cx=".85" cy=".1" r=".55"><stop offset="0" stop-color="#f3e7c2" stop-opacity=".9"/><stop offset="1" stop-color="#f3e7c2" stop-opacity="0"/></radialGradient>
 <linearGradient id="sage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#557a40"/><stop offset="1" stop-color="#344d26"/></linearGradient>
</defs>'''
def icon(kind="any"):
    # any: rounded square on transparent; maskable/apple: full bleed, mark in safe zone
    if kind == "any":
        bg = '<rect x="40" y="40" width="944" height="944" rx="220" fill="url(#oat)"/><rect x="40" y="40" width="944" height="944" rx="220" fill="url(#glow)"/><rect x="40" y="40" width="944" height="944" rx="220" fill="url(#glow2)"/><rect x="41.5" y="41.5" width="941" height="941" rx="218.5" fill="none" stroke="#e1d7c2" stroke-width="3"/>'
        m = mark(.78)
    else:
        bg = '<rect width="1024" height="1024" fill="url(#oat)"/><rect width="1024" height="1024" fill="url(#glow)"/><rect width="1024" height="1024" fill="url(#glow2)"/>'
        m = mark(.62 if kind == "maskable" else .74)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="__W__" height="__H__">{DEFS}{bg}{m}</svg>'
def splash(w, h):
    sz = min(w, h) * .30
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>
 <radialGradient id="g1" cx=".2" cy=".85" r=".8"><stop offset="0" stop-color="#dfe7d3" stop-opacity=".8"/><stop offset="1" stop-color="#dfe7d3" stop-opacity="0"/></radialGradient>
 <radialGradient id="g2" cx=".9" cy=".08" r=".6"><stop offset="0" stop-color="#f3e7c2" stop-opacity=".7"/><stop offset="1" stop-color="#f3e7c2" stop-opacity="0"/></radialGradient></defs>
 <rect width="{w}" height="{h}" fill="#f3eee3"/>
 <svg x="{(w-sz)/2}" y="{(h-sz)/2 - h*.03}" width="{sz}" height="{sz}" viewBox="0 0 1024 1024">{DEFS}{mark(1)}</svg></svg>'''
