# Sparkling adversarial test suite — report

Run 2026-10-23, 12:20–12:53 Asia/Shanghai. Code under test: `src/` as deployed to `sparkling-dev` after the hardening patch (`tools/adv_harden.py`).

## Totals

**11,670 distinct cases. 11,670 pass after the fixes.** Each case is one input × one assertion. They come from tables and cross products in `gen.mjs` and inside each suite; there are no copy-pasted duplicates, and the runner rejects duplicate ids.

| Suite (file) | Category | Cases | Before fixes | After fixes |
|---|---|---:|---:|---:|
| recognition.test.mjs | heuristic fallback (model down), 337 note inputs × 4 properties | 1348 | 1348 | 1348 |
| | model path, 337 inputs × 3 | 1011 | 1011 | 1011 |
| | hostile model output (prompt injection obeyed, junk JSON, wrong shapes) | 125 | 120 | 125 |
| | `norm()` properties | 822 | 822 | 822 |
| | full `recognizeNote` on SQLite D1 + mocked Qloo | 507 | 495* | 507 |
| | Qloo down during recognition | 114 | 110* | 114 |
| | Letterboxd CSV (55 malformed / huge / wrong-encoding files × 5) | 262 | 255 | 262 |
| api.test.mjs | auth: 7 forged-cookie kinds × 31 routes × 7 methods | 1505 | 1290 | 1505 |
| | signed in, no body, every route × method | 217 | 209 | 217 |
| | malformed bodies (20) × 13 JSON endpoints, + account survives | 273 | 214 | 273 |
| | type confusion (profile, heart, note text, prefs) | 84 | 69 | 84 |
| | id fuzzing (22 ids × 15 routes) | 331 | 318 | 331 |
| | cross-user access + isolation | 34 | 31 | 34 |
| | plan actions (swap / went / budget / shorten) | 30 | 25 | 30 |
| | uploads, sizes, search/filter abuse, import, security headers | 67 | 50 | 67 |
| | Qloo failure through threads / plan / notes | 30 | 28 | 30 |
| qloo.test.mjs | 9 client functions × 12 failure modes × 4–5 assertions | 486 | 448 | 486 |
| | memo, gate, recommend, compare | 31 | 27* | 31 |
| | `slimEntity` on 120 fuzzed shapes × 3 | 360 | 291 | 360 |
| plan.test.mjs | 10 Qloo fixtures × 16 budgets × 6 constraints | 960 | 919 | 960 |
| | edge states, areas, weekdays, request text (model up and down), notice, cohorts, dressPlan | 400 | 397 | 400 |
| i18n.test.mjs | zh dictionary (436 entries × 4), t() coverage, patterns, robustness, segments | 2068 | 2057** | 2068 |
| ui.test.mjs (Chromium) | 390×844: screens × en/zh, XSS ×40, overflow, tab bar, swipe deck, reduced motion, controls | 165 | 151* | 165 |
| | 1280×800: same, minus the tab bar and swipe deck | 145 | 142 | 145 |
| live.py (sparkling-dev) | auth, bad JSON, types, id fuzz, cross-user, uploads, headers, 80-request burst, delete | 295 | 254 | 295 |

`*` Part of the "before" gap came from mistakes in the tests, which I fixed: the test expected lone UTF-16 surrogates to survive SQLite, the mock had no `/insights/compare`, global mock routing raced under concurrency, and the UI test shared one account across en and zh. `**` The i18n "before" figure is from an earlier, smaller version of the file. The table counts every product failure that was real.

Live load: about 930 requests to sparkling-dev in total (3 runs of `live.py` at 307 requests each, plus a few curl smoke checks). About 30 live Qloo calls, because each run lets only 3 notes go through recognition. Every other Qloo case is mocked.

## Bugs found and fixed (deployed to sparkling-dev and pushed)

Security problems first, then crashes, then robustness.

1. **Stored same-origin XSS through uploads (security).** `/api/notes/photo` accepted any file type. `/media/…` then served the file back with that type, so an upload of `text/html`, `image/svg+xml` or `application/javascript` ran script on the app's origin. This was confirmed live. Fix: uploads must be JPEG/PNG/WebP/GIF/HEIC/AVIF. Media responses now carry `nosniff` and `CSP: default-src 'none'; sandbox`. Any older upload that isn't an image is served as `application/octet-stream` with `content-disposition: attachment`.
2. **No baseline security headers (security).** The app could be framed, so a click-jacking page could drive the "slide to delete everything" control, and nothing sent `nosniff`. Fix: every response now has `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`.
3. **Sign-out cookie had no flags (security, minor).** It now sets `HttpOnly; Secure; SameSite=Lax`.
4. **Plan actions also ran on GET (security, minor).** `GET /api/plan/:id/save|went|swap…` changed state, and SameSite=Lax cookies are sent on top-level cross-site GETs. Fix: plan actions now accept POST only; any other method gets 404. The app already used POST.
5. **Data loss on note edit.** `PATCH /api/notes/:id` with no `text` field (`{}`, `[]`, `"s"`) silently emptied the note. Confirmed live. Fix: `text` must be a non-empty string, capped at 5000 characters.
6. **A malformed cookie broke every endpoint with a 500.** `sp=%E0%A4%A` made `decodeURIComponent` throw. It now counts as no session and returns 401. This was 215 local cases and 10 live.
7. **Malformed JSON caused 500s on 11 endpoints.** Bad JSON, `null`, arrays and strings now get a 400 through `readJSON()`. `/api/session` and `/api/delete` treat a bad body as `{}`; a delete still needs the explicit `DELETE` confirmation.
8. **Type confusion on `PATCH /api/me`.** Objects and arrays hit a D1 type error (500). Budgets such as `"abc"`, `-1`, `1e308` and `[1]` were stored as they came. Area and `when` had no length limit (50,000 characters were stored live). Fix: type checks, budget must be 0–100000, area capped at 120 characters and `when` at 80.
9. **Letterboxd import crashed (500)** on a negative, huge or infinite rating, because of `"★".repeat(-1)` and RangeError. Fix: the parser clamps ratings to 0–5, rows with whitespace-only titles are dropped, the BOM is stripped, and the star renderer is guarded.
10. **Import had no size limit for raw CSV text bodies.** These are now capped at 3 MB, and a `content-length` check runs before the body is read.
11. **`went` crashed** when `text` was a number, object or array (`b.text.indexOf`), and it had no length cap. It also would have crashed on a plan with no stops. All of this is now guarded.
12. **No timeout on Qloo fetches.** A hanging Qloo request kept the plan stream open forever and blocked recognition. Every Qloo fetch (`qloo.js`, `plan.js`, `recognize.js`) now uses `AbortSignal.timeout`, 10 s by default, overridable with `QLOO_TIMEOUT_MS`.
13. **Plan budget was not validated.** `"abc"`, `{}` and `Infinity` produced headers like "under $NaN" and "under $Infinity". A negative swap budget (-50) was accepted. The budget is now sanitised; invalid values fall back to the user's budget, then to 40.
14. **Hostile or broken model output** whose `surface` was an object crashed extraction, which sent notes into the retry and failure path. Only string surfaces that appear in the note are kept now.
15. **Malformed Qloo responses crashed `slimEntity`** (null tags, non-array `types`, numeric `subtype`) and `compareTastes` (a tag without a name). `recommend({take: NaN})` sent `take=NaN`. All of these are guarded.
16. **`dressPlan` crashes:** odd `hours` shapes (a string, null entries) threw, and NaN coordinates printed "NaN min by bike". Both are fixed.
17. **Inbox action on an unknown id** returned 200 `{"error":"not found"}`. It now returns 404. Bad ids return 400.
18. **zh translator crashed or garbled object-prototype words.** `trZh("hasOwnProperty")` threw, and `trZh("toString")` returned `"[object Undefined]"`. Lookup now uses `hasOwnProperty.call`.

Fix script: `tools/adv_harden.py` (34 anchored replacements, applied once under `.lock`). Pushed files: src/index.js, recognize.js, plan.js, qloo.js, app.html.

## What held up with no change

- Cross-user isolation: notes, cards, footprints, inbox, plans, media, search and export all return 404 or empty for another user.
- SQL injection: every query uses bound parameters. LIKE wildcards only match the user's own rows.
- XSS in the SPA: 40 payloads were stored as notes, card names and plan stop names (through mocked Qloo) and rendered at both viewports in en and zh. None executed, and no live payload nodes appeared in the DOM. Negative controls confirm the detectors do fire on a page that really is broken.
- No horizontal overflow on any screen at either viewport, including 100+ character German compounds, 400 CJK characters and long URLs. The tab bar stays inside the viewport and is at least 44 px tall. The swipe deck keeps (right) and rejects (left). Reduced motion leaves no infinite animations running. No console errors.
- An 80-request burst returned no 5xx. Deleting an account wipes every table and media; the old token gets 401 afterwards.

## Remaining known issues (not fixed)

- **Anyone can create sessions with no limit.** `POST /api/session` has no rate limit or captcha, and `mode:"sample"` starts 8 recognitions (model plus Qloo spend) per call. This needs Turnstile or a per-IP limit in KV/D1. I left it out because it is a product decision.
- **Prompt injection can steer extraction, but only inside the note.** Model output is filtered to text that appears in the note, so an injected entity can't appear. A note can still push which of its own words get looked up. Impact is low.
- **Lone UTF-16 surrogates in notes become U+FFFD,** because D1 stores UTF-8. This is cosmetic.
- **Budget 0 is treated as "not set"** and falls back to the saved budget, instead of meaning "free only".
- **Backend sentences stay in English in zh mode** (plan notices, the hours line, "Sparkling's read"). This was already in the build log. i18n coverage tests check only literal `t("…")` calls.
- **What the UI suite does not cover:** it runs the real SPA against the real Worker locally with mocked AI and Qloo data, not the live site. WebGL effects are not checked visually, because headless-shell has no GPU. The burst test went up to 40 concurrent requests, staying well inside the free plan.

## How to run

```
bash tests/adversarial/run_all.sh            # local suites + UI (no network)
LIVE=1 LABEL=x bash tests/adversarial/run_all.sh   # + ~300 live requests to sparkling-dev
```
Results go to `tests/adversarial/results/*.json` (`failures[]` holds the ids and errors). The harness (`harness.mjs`) runs the real Worker with SQLite-backed D1 (with D1's bind-type rules), programmable Workers AI, and a Qloo mock routed per env.
