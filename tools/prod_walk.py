"""Walk the SPEC 5-shot judge path on a prod deployment with headless Chromium.

Usage: PYTHONPATH=/workspace/tools/pw python3 tools/prod_walk.py --base URL [--lang en|zh|all]
       [--size 390x844|1440x900|all] [--out shots/prod] [--self-test]

Each run (lang x size; default all x all = 4 runs) uses a FRESH browser context with no cookie and the
language preset in localStorage, opens --base on the welcome screen, screenshots it (step 0_welcome),
taps the sample-notebook choice ([data-choice="sample"]) and walks 1_notes 1_jot 2_cards 2_detail
2_inbox 3_threads 4_plan_out 5_plain_out 4_plan_in 5_plain_in. Requests are proxied through Python (the
sandbox browser has no direct network); the sp cookie comes from the Set-Cookie of the /api/session
response seen in the route handler and is sent on later requests to --base.
Writes <out>/<lang>-<w>_<step>.png, <out>/<lang>-<w>.json and <out>/timings.md.
Exit 1 if any step raised, a page error happened, or any /api/ response was >= 400; else 0.
--self-test: no browser, no network: print JSON {"ok":true,"runs":[{"lang","w","h","shots":[...]}]}
for the chosen --lang/--size/--out and exit 0.
"""
import argparse, asyncio, json, os, re, sys, time
os.environ["LD_LIBRARY_PATH"] = "/workspace/tools/chromium/root/usr/lib/aarch64-linux-gnu:/workspace/tools/chromium/root/usr/lib/chromium"
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

CHROME = "/workspace/tools/chromium/root/usr/lib/chromium/chromium-headless-shell"
FALLBACK_CHROME = "/usr/bin/chromium"
STEPS = ("0_welcome", "1_notes", "1_jot", "2_cards", "2_detail", "2_inbox",
         "3_threads", "4_plan_out", "5_plain_out", "4_plan_in", "5_plain_in")
SIZES = {"390x844": (390, 844), "1440x900": (1440, 900)}
SAMPLE_SEL = '[data-choice="sample"]'
HAS_SAMPLE_JS = '!!document.querySelector(\'[data-choice="sample"]\')'
NOTES_READY_JS = "location.hash.indexOf('#/notes') === 0 && !!document.querySelector('[data-note-id]')"
# visible English in zh mode: words of 3+ ASCII letters, minus proper nouns/brand we keep
KEEP = set("Sparkling Qloo Juno Park Greenpoint Brooklyn NYC Letterboxd Margaret LLM CSV OK".split())
ZH_JS = r"""() => { const out=[]; const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while(w.nextNode()){ const n=w.currentNode, el=n.parentElement; if(!el) continue;
    if (el.closest('script,style,[hidden],.note-text,.fp-quote,.card-name,.pick-name,.stop-name,.d-title,mark')) continue;
    if (el.closest('details:not([open])') || (el.checkVisibility && !el.checkVisibility())) continue;
    const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue;
    const s=n.textContent.trim(); if(s && /[A-Za-z]{3,}/.test(s) && !/[\u4e00-\u9fff]/.test(s)) out.push(s.slice(0,90)); }
  return [...new Set(out)].slice(0,40); }"""


def planned_runs(lang, size):
    langs = ["en", "zh"] if lang == "all" else [lang]
    sizes = ["390x844", "1440x900"] if size == "all" else [size]
    return [{"lang": l, "w": SIZES[s][0], "h": SIZES[s][1]} for l in langs for s in sizes]


def self_test(out, runs):
    planned = []
    for r in runs:
        tag = "%s-%s" % (r["lang"], r["w"])
        planned.append({"lang": r["lang"], "w": r["w"], "h": r["h"],
                        "shots": [os.path.join(out, "%s_%s.png" % (tag, s)) for s in STEPS]})
    print(json.dumps({"ok": True, "runs": planned}, ensure_ascii=False))


def write_timings(out, reports):
    tags = [r["tag"] for r in reports]
    lines = ["| step | " + " | ".join(tags) + " |",
             "| --- | " + " | ".join("---" for _ in tags) + " |"]
    for step in STEPS:
        cells = []
        for r in reports:
            hit = next((s for s in r["steps"] if s["step"] == step), None)
            cells.append("%.1f" % hit["secs"] if hit else "-")
        lines.append("| %s | %s |" % (step, " | ".join(cells)))
    with open(os.path.join(out, "timings.md"), "w", encoding="utf8") as fh:
        fh.write("\n".join(lines) + "\n")


async def walk_one(browser, base, out, run):
    """One fresh-context run: welcome -> sample tap -> the 5 shots. Returns a result dict."""
    from shots import fetch
    lang, w, h = run["lang"], run["w"], run["h"]
    tag = "%s-%s" % (lang, w)
    rep = {"tag": tag, "base": base, "steps": []}
    errs, page_errs, bad = [], [], []
    tok = {"v": None}
    res = {"rep": rep, "raised": False, "page_errs": page_errs, "bad": bad}
    mob = w < 800
    ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1,
                                    is_mobile=mob, has_touch=mob,
                                    # the sandbox proxy needs auth that only the route handler adds; a service worker
                                    # fetch bypasses routing (407 noise). Judges' browsers are unaffected.
                                    service_workers="block")
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: (page_errs.append(str(e)[:200]), errs.append(str(e)[:200])))
    pg.on("console", lambda m: m.type == "error" and errs.append(("console: " + m.text)[:200]))

    def header(hh, name):
        return next((v for k, v in hh.items() if k.lower() == name), "")

    async def handle(route):
        r = route.request
        hd = await r.all_headers()
        if tok["v"] and r.url.startswith(base):
            hd["cookie"] = "sp=" + tok["v"]
        try:
            st, body, hh = await asyncio.to_thread(fetch, r.url, r.method, r.post_data_buffer, hd)
            if "/api/session" in r.url:
                m = re.search(r"(?:^|[,\s])sp=([^;,\s]+)", header(hh, "set-cookie"))
                if m:
                    tok["v"] = m.group(1)
            # boot.js probes /api/me before any session exists; its 401 is how the welcome screen
            # decides to show, so only that one unauthenticated probe is not a walk failure.
            anon_probe = (st == 401 and r.method == "GET" and not tok["v"]
                          and r.url.split("?")[0].endswith("/api/me"))
            if "/api/" in r.url and st >= 400 and not anon_probe:
                bad.append({"url": r.url.replace(base, ""), "m": r.method, "status": st,
                            "body": body[:160].decode("utf8", "replace")})
            hdr = {"content-type": header(hh, "content-type") or "text/plain"}
            sc = header(hh, "set-cookie")
            if sc:
                hdr["set-cookie"] = sc
            await route.fulfill(status=st, body=body, headers=hdr)
        except Exception as e:
            if "/api/" in r.url:
                bad.append({"url": r.url.replace(base, ""), "err": repr(e)[:100]})
            await route.abort()

    await pg.route("**/*", handle)
    await ctx.add_init_script('localStorage.setItem("sparkling.prefs",JSON.stringify({lang:%s}))'
                              % json.dumps(lang))

    async def wait_for(js, secs):
        t0 = time.time()
        while time.time() - t0 < secs:
            try:
                if await pg.evaluate(js):
                    return round(time.time() - t0, 1)
            except Exception:
                pass
            await pg.wait_for_timeout(250)
        return None

    async def step(name, fn, shot=True):
        e0, b0 = len(errs), len(bad)
        t0 = time.time()
        note, ok = None, True
        shot_path = os.path.join(out, "%s_%s.png" % (tag, name))
        try:
            note = await fn()
        except Exception as e:
            ok = False
            note = "STEP ERROR " + repr(e)[:200]
        secs = round(time.time() - t0, 1)
        if shot:
            try:
                await pg.screenshot(path=shot_path)
            except Exception:
                pass
        en = []
        if lang == "zh":
            try:
                en = await pg.evaluate(ZH_JS)
            except Exception:
                pass
        entry = {"step": name, "secs": secs, "ok": ok, "note": note, "errors": errs[e0:],
                 "bad_api": bad[b0:], "shot": os.path.abspath(shot_path), "english_in_zh": en}
        rep["steps"].append(entry)
        if not ok:
            res["raised"] = True
        print(json.dumps(entry, ensure_ascii=False, default=str), flush=True)

    async def get_cards():
        if not tok["v"]:
            raise RuntimeError("no sp cookie captured from /api/session")
        st, body, _ = await asyncio.to_thread(fetch, base + "/api/cards", "GET", None,
                                              {"cookie": "sp=" + tok["v"]})
        if st != 200:
            raise RuntimeError("/api/cards status %s" % st)
        return json.loads(body).get("cards", [])

    # step 0: welcome screen, then the judge's sample-notebook tap (screenshot taken before the tap)
    async def s_welcome():
        await pg.goto(base + "/", wait_until="domcontentloaded")
        seen = await wait_for(HAS_SAMPLE_JS, 20)
        if seen is None:
            raise RuntimeError("welcome screen did not show the sample choice")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(out, "%s_0_welcome.png" % tag))
        await pg.click(SAMPLE_SEL)
        landed = await wait_for(NOTES_READY_JS, 30)
        if landed is None:
            raise RuntimeError("sample tap did not land on #/notes with a note")
        return {"welcome_s": seen, "sample_s": landed,
                "hash": await pg.evaluate("location.hash"),
                "notes": await pg.evaluate("document.querySelectorAll('[data-note-id]').length")}
    await step("0_welcome", s_welcome, shot=False)

    # shot 1: notebook + jot
    async def s_notes():
        await pg.goto(base + "/#/notes")
        return {"first_note_s": await wait_for("!!document.querySelector('[data-note-id]')", 20),
                "n": await pg.evaluate("document.querySelectorAll('[data-note-id]').length")}
    await step("1_notes", s_notes)

    async def s_jot():
        await pg.goto(base + "/#/camera")
        opened = await wait_for("!!document.querySelector('[data-cap-text]')", 20)
        if opened is None:
            raise RuntimeError("composer did not open")
        await pg.fill("[data-cap-text]", "rewatched In the Mood for Love — the corridor, the score")
        await pg.wait_for_timeout(400)
        await pg.click("[data-cap-send]")
        t = await wait_for("[...document.querySelectorAll('[data-note-id]')].some(e=>e.innerText.indexOf('corridor')>=0)", 15)
        await pg.wait_for_timeout(6000)
        return {"note_visible_s": t, "body_snip": (await pg.evaluate("document.body.innerText"))[:300]}
    await step("1_jot", s_jot)

    # shot 2: cards + detail + inbox
    async def s_cards():
        await pg.goto(base + "/#/cards")
        return {"first_card_s": await wait_for("!!document.querySelector('.card-tile')", 20),
                "n": await pg.evaluate("document.querySelectorAll('.card-tile').length")}
    await step("2_cards", s_cards)

    async def s_detail():
        cards = await get_cards()
        if not cards:
            raise RuntimeError("no cards to open")
        tgt = next((c for c in cards if "mood for love" in (c.get("name") or "").lower()), cards[0])
        await pg.goto(base + "/#/cards/" + str(tgt["id"]))
        t = await wait_for("!!document.querySelector('[data-fp-id]')", 15)
        await pg.wait_for_timeout(1200)
        return {"card": tgt.get("name"), "fp_s": t, "text": (await pg.evaluate("document.body.innerText"))[:500]}
    await step("2_detail", s_detail)

    async def s_inbox():
        await pg.goto(base + "/#/inbox")
        await pg.wait_for_timeout(2500)
        return (await pg.evaluate("document.body.innerText"))[:400]
    await step("2_inbox", s_inbox)

    # shot 3: threads / letter
    async def s_threads():
        await pg.goto(base + "/#/threads")
        await pg.wait_for_timeout(3500)
        return (await pg.evaluate("document.body.innerText"))[:500]
    await step("3_threads", s_threads)

    # shot 4: plan go-out preset
    async def s_plan_out():
        await pg.goto(base + "/#/plan")
        if await wait_for("!!document.querySelector('[data-plan-form]')", 15) is None:
            raise RuntimeError("plan form did not render")
        pre = await pg.query_selector("[data-plan-preset=out]")
        if pre is None:
            raise RuntimeError("go-out preset missing")
        await pre.click()
        await pg.wait_for_timeout(300)
        await pg.click("[data-make-plan]")
        first = await wait_for("!!document.querySelector('[data-plan-progress],[data-log-lines]')", 8)
        done = await wait_for("location.hash.startsWith('#/plan/') && !!document.querySelector('[data-plain]') || (()=>{const e=document.querySelector('[data-plan-error]');return !!(e&&!e.hidden&&e.offsetHeight&&e.innerText.trim())})()", 110)
        if done is None:
            raise RuntimeError("go-out plan neither arrived nor errored in 110s")
        await pg.wait_for_timeout(1500)
        return {"preset": True, "progress_s": first, "plan_s": done,
                "hash": await pg.evaluate("location.hash"),
                "text": (await pg.evaluate("document.body.innerText"))[:900]}
    await step("4_plan_out", s_plan_out)

    async def s_plain_out():
        btn = await pg.query_selector("[data-plain]")
        if btn is None:
            raise RuntimeError("no plain-compare button on the go-out plan")
        await btn.click()
        t = await wait_for("!!document.querySelector('.plain-verdict')", 90)
        if t is None:
            raise RuntimeError("plain comparison did not render")
        await pg.wait_for_timeout(1000)
        return {"verdict_s": t,
                "text": (await pg.evaluate("(document.querySelector('.sheet,.plain-sheet,[role=dialog]')||document.body).innerText"))[:900]}
    await step("5_plain_out", s_plain_out)

    async def s_plan_in():
        await pg.goto(base + "/#/plan")
        if await wait_for("!!document.querySelector('[data-plan-form]')", 15) is None:
            raise RuntimeError("plan form did not render")
        pre = await pg.query_selector("[data-plan-preset=in]")
        if pre is None:
            raise RuntimeError("stay-in preset missing")
        await pre.click()
        await pg.wait_for_timeout(300)
        ready = await wait_for("!document.querySelector('[data-make-plan]').disabled", 25)
        if ready is None:
            return {"preset": True, "make_plan_disabled_after_preset": True,
                    "form": (await pg.evaluate("document.querySelector('[data-plan-form]').innerText"))[:300]}
        await pg.click("[data-make-plan]")
        done = await wait_for("location.hash.startsWith('#/plan/') && !!document.querySelector('.pick') || (()=>{const e=document.querySelector('[data-plan-error]');return !!(e&&!e.hidden&&e.offsetHeight&&e.innerText.trim())})()", 110)
        if done is None:
            raise RuntimeError("stay-in plan neither arrived nor errored in 110s")
        await pg.wait_for_timeout(1500)
        return {"preset": True, "plan_s": done,
                "text": (await pg.evaluate("document.body.innerText"))[:900]}
    await step("4_plan_in", s_plan_in)

    async def s_plain_in():
        btn = await pg.query_selector("[data-plain]")
        if btn is None:
            raise RuntimeError("no plain-compare button on the stay-in plan")
        await btn.click()
        t = await wait_for("!!document.querySelector('.plain-verdict')", 90)
        if t is None:
            raise RuntimeError("plain comparison did not render")
        await pg.wait_for_timeout(1000)
        return {"verdict_s": t, "text": (await pg.evaluate("(document.querySelector('.sheet,.plain-sheet,[role=dialog]')||document.body).innerText"))[:900]}
    await step("5_plain_in", s_plain_in)

    await ctx.close()
    return res


async def walk(base, out, runs):
    from playwright.async_api import async_playwright
    reports, failed = [], False
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME if os.path.exists(CHROME) else FALLBACK_CHROME,
            args=["--no-sandbox"])
        try:
            for run in runs:
                print("== run %s-%sx%s" % (run["lang"], run["w"], run["h"]), flush=True)
                r = await walk_one(browser, base, out, run)
                reports.append(r["rep"])
                with open(os.path.join(out, r["rep"]["tag"] + ".json"), "w", encoding="utf8") as fh:
                    json.dump(r["rep"], fh, ensure_ascii=False, indent=1)
                if r["raised"] or r["page_errs"] or r["bad"]:
                    failed = True
                    print("!! %s raised=%s page_errors=%s bad_api=%s"
                          % (r["rep"]["tag"], r["raised"], r["page_errs"][:3], r["bad"][:3]), flush=True)
        finally:
            await browser.close()
    write_timings(out, reports)
    print("wrote " + os.path.join(out, "timings.md"), flush=True)
    return 1 if failed else 0


def main(argv):
    ap = argparse.ArgumentParser(description="Headless Chromium walk of the SPEC 5-shot judge path.")
    ap.add_argument("--base", required=True, help="deployment base URL, e.g. https://sparkling-dev.q1f0730.workers.dev")
    ap.add_argument("--lang", choices=("en", "zh", "all"), default="all")
    ap.add_argument("--size", choices=("390x844", "1440x900", "all"), default="all")
    ap.add_argument("--out", default="shots/prod")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args(argv)
    runs = planned_runs(a.lang, a.size)
    if a.self_test:
        self_test(a.out, runs)
        return 0
    os.makedirs(a.out, exist_ok=True)
    return asyncio.run(walk(a.base.rstrip("/"), a.out, runs))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
