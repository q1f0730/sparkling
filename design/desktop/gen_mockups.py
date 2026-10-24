"""Generate 3 static desktop layout directions for Sparkling (design/desktop/dir-{a,b,c}.html).
Each file shows one screen chosen by ?s=notes|cards|plan|detail. Type direction B: Fraunces Soft + Figtree + DM Mono."""
import os
D = os.path.dirname(os.path.abspath(__file__))

BASE = r"""
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..600,100;1,9..144,300..500,100&family=Figtree:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root{--paper:#f3eee3;--card:#fffdf8;--ink:#2a2620;--ink2:#5c554a;--faint:#857b69;--line:#e7dfcf;--line2:#d7cbb3;
--sage:#dfe7d3;--sage-ink:#3e5a2e;--clay:#f1dccd;--clay-ink:#8a4227;--butter:#f3e7c2;--butter-ink:#6e5413;--soft:#f2ede2;
--film:#e3e8f3;--film-ink:#34497a;--music:#ece3f1;--music-ink:#5b3f72;--book:#f1dccd;--book-ink:#8a4227;--place:#dfe7d3;--place-ink:#3e5a2e;
--serif:"Fraunces",Georgia,serif;--sans:"Figtree",system-ui,sans-serif;--mono:"DM Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--paper);color:var(--ink);font:400 15px/1.5 var(--sans);-webkit-font-smoothing:antialiased;overflow:hidden}
.serif{font-family:var(--serif);font-variation-settings:"SOFT" 100,"opsz" 72}
.mono{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font:500 13px/1 var(--sans);color:var(--ink2)}
.chip.on{background:var(--sage);border-color:transparent;color:var(--sage-ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 16px;border-radius:999px;background:var(--ink);color:var(--paper);font:500 13.5px/1 var(--sans);border:0}
.btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
.u{border-bottom:1.5px solid var(--sage-ink);padding-bottom:1px}
.note{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px}
.note p{font-size:15.5px;line-height:1.6}
.note .meta{display:flex;justify-content:space-between;margin-top:12px;font:400 11.5px var(--mono);color:var(--faint)}
.ent{display:inline-flex;align-items:center;gap:10px;margin-top:12px;padding:8px 12px 8px 8px;border-radius:12px;background:var(--soft);border-left:3px solid var(--film-ink)}
.ent i{width:30px;height:38px;border-radius:5px;background:linear-gradient(160deg,#9b2f22,#3a1410)}
.ent b{display:block;font:500 16px/1.15 var(--serif)}
.ent small{font-size:12px;color:var(--ink2)}
.ent.music{border-left-color:var(--music-ink)} .ent.music i{background:linear-gradient(160deg,#5b3f72,#1e1428)}
.ent.book{border-left-color:var(--book-ink)} .ent.book i{background:linear-gradient(160deg,#e8573f,#f2b84b)}
.sel{outline:2px solid var(--sage-ink);outline-offset:-1px}
.day{display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 10px}
.day h3{font:400 22px/1 var(--serif)}
.compose{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px}
.compose .ph{color:var(--faint);font-size:16px;height:44px}
.compose .row{display:flex;gap:16px;align-items:center;color:var(--ink2);font-size:13px}
.compose .row .btn{margin-left:auto}
.cover{border-radius:14px;overflow:hidden;position:relative;background:var(--card);border:1px solid var(--line)}
.cover .img{aspect-ratio:3/4;background:linear-gradient(160deg,#9b2f22,#3a1410)}
.cover.m .img{background:linear-gradient(160deg,#6d5280,#241a2e)} .cover.b .img{background:linear-gradient(160deg,#f05a3d,#f6c04d)}
.cover.p .img{background:linear-gradient(160deg,#9cb489,#3e5a2e)} .cover.f2 .img{background:linear-gradient(160deg,#3f5f8a,#121b2b)}
.cover .cap{padding:10px 12px 12px}
.cover .cap b{display:block;font:400 17px/1.15 var(--serif)}
.cover .cap small{font:400 11px var(--mono);color:var(--faint);letter-spacing:.05em;text-transform:uppercase}
.pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font:500 12px/1 var(--sans)}
.map{position:relative;border-radius:20px;overflow:hidden;background:
 linear-gradient(0deg,transparent 49.5%,rgba(62,90,46,.10) 50%,transparent 50.5%) 0 0/100% 64px,
 linear-gradient(90deg,transparent 49.5%,rgba(62,90,46,.10) 50%,transparent 50.5%) 0 0/88px 100%,
 radial-gradient(60% 40% at 70% 30%,#e7eddc,transparent),#efeadc;border:1px solid var(--line)}
.map svg{position:absolute;inset:0;width:100%;height:100%}
.stop{display:grid;grid-template-columns:34px 1fr;gap:14px}
.stop .n{width:30px;height:30px;border-radius:50%;background:var(--sage);color:var(--sage-ink);display:grid;place-items:center;font:500 14px var(--sans)}
.stop .body{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px}
.stop h4{font:400 24px/1.1 var(--serif);margin:4px 0 4px}
.leg{margin:6px 0 6px 14px;padding:6px 0 6px 30px;border-left:1.5px dashed var(--line2);font:400 11.5px var(--mono);color:var(--faint)}
.quote{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--soft);border-left:3px solid var(--clay-ink);font:italic 400 14px/1.45 var(--serif);color:var(--ink2)}
.stats{display:flex;border-top:1.5px solid var(--ink);margin-top:14px}
.stats div{flex:1;padding:10px 0;border-right:1px solid var(--line)}
.stats div:last-child{border:0}
.stats b{display:block;font:400 26px/1 var(--serif)}
.fp{display:grid;grid-template-columns:62px 1fr;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.fp p{font:italic 400 15px/1.5 var(--serif);color:var(--ink2)}
.tag{display:inline-flex;height:28px;align-items:center;padding:0 11px;border-radius:999px;font:400 14px/1 var(--serif);margin:0 6px 6px 0}
.navi{display:flex;align-items:center;gap:12px;height:38px;padding:0 12px;border-radius:12px;color:var(--ink2);font:500 14px/1 var(--sans)}
.navi svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.navi.on{background:var(--card);color:var(--ink);box-shadow:0 1px 0 var(--line)}
.navi .ct{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--clay-ink);color:#fff;font:500 11px/20px var(--sans);text-align:center}
.word{display:flex;align-items:center;gap:8px;font:400 22px/1 var(--serif)}
.word i{width:18px;height:18px;background:var(--sage-ink);clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)}
</style>
"""

IC = {
 "notes": '<svg viewBox="0 0 24 24"><path d="M5 5.5h14M5 10.5h14M5 15.5h9M5 20h6"/></svg>',
 "cards": '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="9" rx="1.5"/></svg>',
 "threads": '<svg viewBox="0 0 24 24"><path d="M4 7c4 0 4 10 8 10s4-10 8-10"/><path d="M4 17c4 0 4-10 8-10"/></svg>',
 "letter": '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
 "plan": '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="2.5"/><path d="M4 10.5h16M8.5 3.5v5M15.5 3.5v5"/></svg>',
 "inbox": '<svg viewBox="0 0 24 24"><path d="M4 13.5 6.5 6h11l2.5 7.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/></svg>',
 "settings": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/></svg>',
}

def nav(active, labels=True):
    items = [("notes","Notes"),("cards","Cards"),("threads","Threads"),("letter","Letter"),("plan","Plan")]
    h = "".join(f'<div class="navi{" on" if k==active else ""}">{IC[k]}{"<span>"+v+"</span>" if labels else ""}</div>' for k,v in items)
    return h

NOTES = [
 ("Today","rewatched <span class='u'>In the Mood for Love</span>. the corridor, the score, every time.","In the Mood for Love","Film · mentioned 3×","", "04:38 · 1 card"),
 ("Friday","<span class='u'>Mitski</span> at 1am again. Be the Cowboy front to back, lights off","Mitski","Music · new card","music","03:08 · 1 card"),
 ("Thursday","someone left <span class='u'>The Rings of Saturn</span> on the bench outside the library. took it as a sign.","The Rings of Saturn","Book · new card","book","18:20 · 1 card"),
 ("Thursday","finished <span class='u'>Klara and the Sun</span> on the train. the sun as a god, quietly devastating.","Klara and the Sun","Book · mentioned 2×","book","08:51 · 1 card"),
]
def notes_feed(sel=0, n=4):
    out = ""; last = None
    for i,(d,t,name,sub,cls,meta) in enumerate(NOTES[:n]):
        if d != last: out += f'<div class="day"><h3>{d}</h3><span class="mono">{"1 note" if d!="Thursday" else "2 notes"}</span></div>'; last = d
        out += f'<article class="note{" sel" if i==sel else ""}" style="margin-bottom:10px"><p>{t}</p><div class="ent {cls}"><i></i><span><b>{name}</b><small>{sub}</small></span></div><div class="meta"><span>{meta}</span><span>···</span></div></article>'
    return out
COMPOSE = '<div class="compose"><div class="ph">What stayed with you today?</div><div class="row"><span>◎ Photo</span><span>⌁ Link</span><span class="btn">Save</span></div></div>'
FILTERS = '<div style="display:flex;gap:8px;margin:16px 0 4px"><span class="chip on">All</span><span class="chip">With cards</span><span class="chip">Photos</span><span class="chip">Plain notes</span></div>'
def heading(eyebrow, h, em):
    return f'<p class="mono">{eyebrow}</p><h1 class="serif" style="font-size:40px;line-height:1.05;font-weight:400;margin:8px 0 0">{h} <em style="color:var(--clay-ink)">{em}</em></h1>'

COVERS = [("","In the Mood for Love","Film · 2000"),("m","Mitski","Music"),("b","Klara and the Sun","Book · 2021"),("p","Quimby's Bookstore","Place · Brooklyn"),
          ("f2","Solaris","Film · 1972"),("m","Big Thief","Music"),("b","The Rings of Saturn","Book · 1995"),("","Chungking Express","Film · 1994"),
          ("p","For The Record","Place · Greenpoint"),("f2","Paterson","Film · 2016"),("m","Adrianne Lenker","Music"),("b","Normal People","Book · 2018")]
def grid(cols, n, sel=0):
    return f'<div style="display:grid;grid-template-columns:repeat({cols},1fr);gap:14px">' + "".join(
        f'<div class="cover {c}{" sel" if i==sel else ""}"><div class="img"></div><div class="cap"><b>{t}</b><small>{s}</small></div></div>' for i,(c,t,s) in enumerate(COVERS[:n])) + "</div>"
CARD_FILTERS = '<div style="display:flex;gap:8px;margin:18px 0 16px"><span class="chip on">All 24</span><span class="chip">Film &amp; TV 9</span><span class="chip">Music 6</span><span class="chip">Books 5</span><span class="chip">Places 4</span></div>'

def detail(compact=False):
    w = "96px" if compact else "132px"
    return f'''<div style="display:flex;gap:18px;align-items:flex-start"><div style="width:{w};flex:none;aspect-ratio:3/4;border-radius:12px;background:linear-gradient(160deg,#9b2f22,#3a1410)"></div>
<div><p class="mono">Film · 2000 · Wong Kar-wai</p><h2 class="serif" style="font-size:{30 if compact else 40}px;line-height:1.05;font-weight:400;margin:6px 0 10px">In the Mood for Love</h2>
<div style="display:flex;gap:8px"><span class="pill" style="background:var(--clay);color:var(--clay-ink)">♥ Loved</span><span class="pill" style="border:1px solid var(--line)">Not for me</span></div></div></div>
<div class="stats"><div><b>3</b><span class="mono">mentions</span></div><div><b class="serif">Mar 2026</b><span class="mono">first met</span></div><div><b class="serif">today</b><span class="mono">last seen</span></div></div>
<p class="mono" style="margin:22px 0 4px">Footprints</p>
<div class="fp"><span class="mono">Today<br>rewatch</span><p>rewatched In the Mood for Love. the corridor, the score, every time.</p></div>
<div class="fp"><span class="mono">21 Aug<br>note</span><p>In the Mood for Love was too slow tonight, couldn't settle</p></div>
<div class="fp"><span class="mono">28 Mar<br>first watch</span><p>In the Mood for Love first time, restrained and devastating.</p></div>
<p class="mono" style="margin:20px 0 10px">From Qloo</p>
<div><span class="tag" style="background:var(--sage);color:var(--sage-ink)">Foreground framing</span><span class="tag" style="background:var(--clay);color:var(--clay-ink)">Forbidden desire</span><span class="tag" style="background:var(--butter);color:var(--butter-ink)">Emotionally engaged</span></div>
<div style="display:flex;gap:10px;margin-top:18px"><span class="btn">Use in a plan</span><span class="btn ghost">Open full page</span></div>'''

def mapsvg(big=True):
    pts = [(28,74),(44,46),(66,22)] if big else [(30,80),(50,50),(70,20)]
    path = " ".join(("M" if i==0 else "L")+f"{x} {y}" for i,(x,y) in enumerate(pts))
    pins = "".join(f'<g><circle cx="{x}" cy="{y}" r="3.1" fill="#3e5a2e"/><text x="{x}" y="{y+1.2}" font-size="3.2" text-anchor="middle" fill="#fff" font-family="Figtree">{i+1}</text></g>' for i,(x,y) in enumerate(pts))
    labels = "".join(f'<text x="{x+4.5}" y="{y+1}" font-size="2.6" fill="#2a2620" font-family="Figtree">{n}</text>' for (x,y),n in zip(pts,["Quimby's","Charlotte Patisserie","For The Record"]))
    return f'<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="{path}" stroke="#3e5a2e" stroke-width=".6" stroke-dasharray="1.6 1.2" fill="none" vector-effect="non-scaling-stroke"/>{pins}{labels}<text x="4" y="96" font-size="2.4" fill="#857b69" font-family="DM Mono">GREENPOINT · WILLIAMSBURG — SCHEMATIC, NOT TO SCALE</text></svg>'

STOPS = [("01","2:00 PM · 40 min","Quimby's Bookstore NYC","Bookstore · Williamsburg","someone left The Rings of Saturn on the bench outside the library. took it as a sign.","walk 13 min"),
         ("02","2:53 PM · 45 min","Charlotte Patisserie","Bakery · Greenpoint","Klara and the Sun on the train, a pastry, the window seat.","walk 19 min"),
         ("03","3:57 PM · 40 min","For The Record","Record store · Greenpoint","Mitski at 1am again. Be the Cowboy front to back, lights off","")]
def timeline(compact=False):
    out = ""
    for i,(n,tm,name,kind,q,leg) in enumerate(STOPS):
        out += f'<div class="stop"><div class="n">{i+1}</div><div class="body"><p class="mono" style="color:var(--clay-ink)">Stop {n} · {tm}</p><h4>{name}</h4><p class="mono">{kind}</p>' + ("" if compact and i else f'<div class="quote">“{q}”</div>') + '</div></div>'
        if leg: out += f'<div class="leg">{leg}</div>'
    return out
PLAN_HEAD = heading("Saturday afternoon — Greenpoint, Brooklyn","Go,","once more.") + '<div style="display:flex;gap:8px;margin-top:12px"><span class="chip">Under $40</span><span class="chip">Familiar</span></div><div class="stats" style="margin-bottom:16px"><div><b>3</b><span class="mono">stops</span></div><div><b class="serif">2:00–4:37 PM</b><span class="mono">window</span></div><div><b>32</b><span class="mono">min walking</span></div></div>'

# ---------------- Direction A: three-pane studio ----------------
def dir_a(s):
    side = f'''<aside style="width:232px;flex:none;padding:22px 14px;display:flex;flex-direction:column;gap:4px">
<div class="word" style="padding:0 10px 18px"><i></i>Sparkling</div>
<div class="btn" style="margin:0 6px 14px;justify-content:flex-start">＋ New note</div>
{nav({"detail":"cards"}.get(s,s))}
<div style="height:14px"></div><div class="navi">{IC["inbox"]}<span>Inbox</span><span class="ct">4</span></div>
<div style="margin-top:auto"></div><div class="navi">{IC["settings"]}<span>Settings</span></div>
<div style="display:flex;gap:10px;align-items:center;padding:10px 12px"><span style="width:28px;height:28px;border-radius:50%;background:var(--sage);display:grid;place-items:center;font:500 13px var(--serif);color:var(--sage-ink)">Q</span><span style="font-size:13px">Q1f730<br><span class="mono" style="font-size:10px">sample notebook</span></span></div></aside>'''
    if s == "notes":
        main = heading("Notebook — Sat 24 Oct","Saturday.","Two things came back to you this week.") + '<div style="height:22px"></div>' + COMPOSE + FILTERS + notes_feed(0)
        insp = '<p class="mono">Selected note · Today 04:38</p><h3 class="serif" style="font-size:24px;font-weight:400;margin:6px 0 14px">1 card from this note</h3>' + detail(True)
    elif s == "cards":
        main = heading("The wall — Oct 2026","Everything","you kept.") + CARD_FILTERS + grid(3, 9)
        insp = detail(True)
    elif s == "detail":
        main = heading("The wall — Oct 2026","Everything","you kept.") + CARD_FILTERS + grid(3, 9)
        insp = detail(False)
    else:
        main = PLAN_HEAD + timeline()
        insp = '<p class="mono" style="margin-bottom:10px">Route</p><div class="map" style="height:calc(100vh - 120px)">' + mapsvg() + '</div>'
    iw = "440px" if s in ("plan","detail") else "400px"
    return f'''<div style="display:flex;height:100vh">{side}
<div style="flex:1;display:flex;margin:10px 10px 10px 0;background:var(--card);border-radius:24px;border:1px solid var(--line);overflow:hidden;min-width:0">
<main style="flex:1;overflow:hidden;padding:34px 40px;min-width:0;background:#fbf8f1"><div style="max-width:720px;margin:0 auto">{main}</div></main>
<aside style="width:{iw};flex:none;border-left:1px solid var(--line);padding:30px 28px;overflow:hidden;background:var(--card)">{insp}</aside></div></div>'''

# ---------------- Direction B: icon rail + wide canvas + slide-over peek ----------------
def dir_b(s):
    rail = f'''<aside style="width:76px;flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 0;border-right:1px solid var(--line)">
<div class="word" style="margin-bottom:18px"><i style="width:24px;height:24px"></i></div>{nav({"detail":"cards"}.get(s,s), False)}
<div class="navi" style="position:relative">{IC["inbox"]}<span class="ct" style="position:absolute;top:-2px;right:-6px">4</span></div>
<div style="margin-top:auto" class="navi">{IC["settings"]}</div></aside>'''
    top = lambda t: f'<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px"><h1 class="serif" style="font-size:34px;font-weight:400">{t}</h1><span style="margin-left:auto" class="chip">⌕ Search</span><span class="btn">＋ New note</span></div>'
    peek = ""
    if s == "notes":
        main = top("Notebook") + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div>' + COMPOSE + notes_feed(-1, 2) + '</div><div>' + notes_feed(-1, 4)[0:0] + "".join(f'<article class="note" style="margin-bottom:14px"><p>{t}</p><div class="ent {c}"><i></i><span><b>{n}</b><small>{sb}</small></span></div></article>' for (_,t,n,sb,c,_) in NOTES[2:]) + '</div></div>'
    elif s in ("cards","detail"):
        main = top("Cards") + CARD_FILTERS + grid(5, 12, 0 if s=="detail" else -1)
        if s == "detail": peek = f'<div style="position:absolute;top:0;right:0;bottom:0;width:480px;background:var(--card);box-shadow:-30px 0 60px -30px rgba(64,50,28,.45);padding:30px 30px">{detail(False)}</div><div style="position:absolute;inset:0;right:480px;background:rgba(42,38,32,.12)"></div>'
    else:
        main = ""
    if s == "plan":
        return f'''<div style="display:flex;height:100vh">{rail}<div style="flex:1;position:relative"><div class="map" style="position:absolute;inset:0;border-radius:0;border:0">{mapsvg()}</div>
<div style="position:absolute;top:20px;left:20px;bottom:20px;width:500px;background:var(--card);border-radius:22px;padding:26px;box-shadow:0 30px 60px -30px rgba(64,50,28,.5);overflow:hidden">{PLAN_HEAD}{timeline(True)}</div></div></div>'''
    return f'<div style="display:flex;height:100vh">{rail}<main style="flex:1;padding:30px 40px;overflow:hidden;position:relative">{main}{peek}</main></div>'

# ---------------- Direction C: top bar + editorial two-page spread ----------------
def dir_c(s):
    tabs = "".join(f'<span style="font:500 14px var(--sans);padding:8px 2px;{"border-bottom:2px solid var(--ink);color:var(--ink)" if k==({"detail":"cards"}.get(s,s)) else "color:var(--ink2)"}">{v}</span>' for k,v in [("notes","Notes"),("cards","Cards"),("threads","Threads"),("letter","Letter"),("plan","Plan")])
    bar = f'<header style="height:64px;display:flex;align-items:center;gap:26px;padding:0 40px;border-bottom:1px solid var(--line)"><div class="word"><i></i>Sparkling</div><nav style="display:flex;gap:24px;margin-left:30px">{tabs}</nav><span style="margin-left:auto" class="chip">Inbox · 4</span><span class="chip">Settings</span></header>'
    if s == "notes":
        left = heading("Notebook — Sat 24 Oct","Saturday.","Two things came back.") + '<div style="height:20px"></div>' + COMPOSE + notes_feed(0, 3)
        right = '<p class="mono">This week in your notes</p><h2 class="serif" style="font-size:30px;font-weight:400;margin:6px 0 16px">Two things came back</h2>' + grid(2, 2) + '<p class="mono" style="margin:20px 0 8px">Needs you · inbox</p><div class="note"><p style="font-style:italic;font-family:var(--serif)">finally watched Solaris. the long drive into the city…</p><p class="mono" style="margin-top:8px">Did I get this right? Solaris · Film · 1972</p></div>'
    elif s in ("cards","detail"):
        left = heading("The wall — Oct 2026","Everything","you kept.") + CARD_FILTERS + grid(3, 6, 0 if s=="detail" else -1)
        right = detail(s=="cards")
    else:
        left = PLAN_HEAD + timeline()
        right = '<div class="map" style="height:calc(100vh - 140px)">' + mapsvg() + '</div>'
    split = "1fr 1fr" if s == "plan" else "1.15fr 1fr"
    return f'''{bar}<div style="display:grid;grid-template-columns:{split};gap:0;height:calc(100vh - 64px);max-width:1360px;margin:0 auto">
<section style="padding:34px 40px;overflow:hidden;border-right:1px solid var(--line)">{left}</section><section style="padding:34px 40px;overflow:hidden">{right}</section></div>'''

for name, fn in (("a", dir_a), ("b", dir_b), ("c", dir_c)):
    for s in ("notes","cards","plan","detail"):
        html = f'<!doctype html><html><head><meta charset="utf-8"><title>Dir {name.upper()} · {s}</title>{BASE}</head><body>{fn(s)}</body></html>'
        open(os.path.join(D, f"dir-{name}-{s}.html"), "w").write(html)
print("ok")
