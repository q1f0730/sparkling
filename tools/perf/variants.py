"""Plan variants on a fresh sample session: checks every stop's kind/neighbourhood/hours on live data."""
import json, time, urllib.request, http.cookiejar, sys
BASE = "https://sparkling-dev.q1f0730.workers.dev"
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(path, method="GET", body=None, raw=False):
    r = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 sparkling-bench"})
    with op.open(r, timeout=120) as resp: return resp.read() if raw else json.loads(resp.read())
call("/api/session", "POST", {"mode": "sample"}); time.sleep(5)
cases = [
  {"area": "Greenpoint, Brooklyn", "mood": "familiar"},
  {"area": "West Village, Manhattan", "text": "a bookstore then a wine bar", "when": "Saturday evening"},
  {"area": "Park Slope, Brooklyn", "text": "coffee, then a record store", "when": "Sunday afternoon"},
  {"area": "Lower East Side", "text": "cinema and somewhere to sit after", "when": "Friday evening"},
]
for c in (cases if len(sys.argv) < 2 else cases[int(sys.argv[1]):int(sys.argv[1]) + 1]):
    t0 = time.time(); raw = call("/api/plan", "POST", c, raw=True).decode(); dt = time.time() - t0
    for line in raw.splitlines():
        o = json.loads(line)
        if o["type"] == "error": print(c, "ERROR", o)
        if o["type"] == "plan":
            p = o["plan"]; print(f"\n== {c} {dt:.1f}s notice={p.get('notice')}")
            for s in p["stops"]: print(f"  {s['arrive']} {s['name']} | {s['kind']} (asked {s.get('asked')}) | {s['neighborhood']} | {s['address']} | {s['ops']} | open={s.get('open_on_arrival')} | {s.get('distance')}")
            print("  rejected:", p["receipt"]["checks"]["rejected"])
