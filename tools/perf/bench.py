"""Live bench on sparkling-dev: sample session -> recognition drain time -> plan time -> content counts.
Usage: python3 tools/perf/bench.py LABEL [area]"""
import json, sys, time, urllib.request, http.cookiejar
BASE = "https://sparkling-dev.q1f0730.workers.dev"
label = sys.argv[1] if len(sys.argv) > 1 else "run"
area = sys.argv[2] if len(sys.argv) > 2 else None
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(path, method="GET", body=None, raw=False, timeout=120):
    r = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 sparkling-bench"})
    with op.open(r, timeout=timeout) as resp:
        return resp.read() if raw else json.loads(resp.read())
out = {"label": label}
t0 = time.time(); call("/api/session", "POST", {"mode": "sample"}); out["session_s"] = round(time.time() - t0, 2)
t0 = time.time(); hist = []
while True:
    me = call("/api/me"); hist.append(me["pending"])
    if me["pending"] == 0 or time.time() - t0 > 240: break
    time.sleep(1)
out["recog_drain_s"] = round(time.time() - t0, 1); out["pending_left"] = me["pending"]; out["pending_hist"] = hist
notes = call("/api/notes")["notes"]; out["notes"] = len(notes); out["failed"] = sum(n["status"] == "failed" for n in notes)
out["cards"] = len(call("/api/cards")["cards"]); out["inbox"] = [ (i["mention"], [g["name"] for g in i["guesses"]]) for i in call("/api/inbox")["items"]]
t0 = time.time(); th = call("/api/threads"); out["threads_s"] = round(time.time() - t0, 2); out["threads"] = [t["tag"] for t in th.get("threads", [])]
lt = call("/api/letter").get("letter") or {}; out["letter_touched"] = lt.get("touched"); out["letter_paras"] = len(lt.get("paragraphs", []))
body = {"mood": "different"}
if area: body["area"] = area
t0 = time.time(); raw = call("/api/plan", "POST", body, raw=True, timeout=180).decode(); out["plan_s"] = round(time.time() - t0, 2)
plan = None
for line in raw.splitlines():
    o = json.loads(line)
    if o["type"] == "plan": plan = o["plan"]
    if o["type"] == "error": out["plan_error"] = o
if plan:
    out["plan_id"] = plan["id"]
    out["stops"] = [{k: s.get(k) for k in ("name", "kind", "neighborhood", "address", "ops")} | {"vibes": s.get("vibes"), "kinds": s.get("why", {}).get("kinds")} for s in plan["stops"]]
    out["trace"] = [(t["ms"], t["text"][:90]) for t in plan.get("trace", [])]
    out["timing"] = plan.get("timing"); out["notice"] = plan.get("notice")
    out["reads"] = [s.get("read") for s in plan["stops"]]; out["attribution"] = [s.get("why", {}).get("attribution") for s in plan["stops"]]
    out["from_qloo"] = [s.get("from_qloo") for s in plan["stops"]]
    t0 = time.time(); raw2 = call("/api/plan", "POST", body, raw=True, timeout=180).decode(); out["plan_repeat_s"] = round(time.time() - t0, 2)
t0 = time.time(); inb = call("/api/inbox"); out["inbox_s"] = round(time.time() - t0, 2); out["inbox_reasons"] = [i.get("reason") for i in inb["items"]]
# one fresh note through live recognition (model + Qloo), timed until it is done
import random
txt = random.choice(["Rewatched Chungking Express, then Mitski on the walk home", "Finally read Pachinko on the ferry, then Aftersun again", "Lost in Translation at 2am, then some Nujabes"]) + " " + str(random.randint(1, 99999))
t0 = time.time(); n = call("/api/notes", "POST", {"text": txt})["note"]
while True:
    nn = call(f"/api/notes/{n['id']}")["note"]
    if nn["status"] != "pending" or time.time() - t0 > 60: break
    time.sleep(0.5)
out["note_recog_s"] = round(time.time() - t0, 2); out["note_recog"] = [(m["surface"], m["state"], (m.get("card") or {}).get("name")) for m in nn["mentions"]]
print(json.dumps(out, indent=1))
json.dump(out, open(f"/workspace/work/sparkling/tools/perf/{label}.json", "w"), indent=1)
