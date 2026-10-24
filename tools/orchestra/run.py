#!/usr/bin/env python3
"""Sparkling multi-agent orchestrator (evidence: notes/orchestration-research.md).
Rules baked in:
 1. Every task declares `scope` (files it may write) and `consumes` (files/contracts it reads).
 2. Planner: tasks whose scopes overlap never run in the same batch; producers merge before consumers (Kahn).
 3. Each worker runs in its OWN copy of the repo (worktree substitute; repo has no git).
 4. Merge copies back ONLY files inside the task's scope; out-of-scope edits are rejected and logged.
 5. Verifier = real tests after each merge (node tests/unit.test.mjs + task's own check). Never trust worker self-report.
 6. Shared decision ledger (ledger.md) is prepended to every worker prompt and appended after each task.
 7. Failed task: one retry with the failure output attached (no unchanged retry), then report to orchestrator.
Workers: QoderWake CN CLI, free model only (Qwen3.8-Flash).
Usage: python3 run.py plan.json [--dry]
"""
import json, sys, os, shutil, subprocess, hashlib, time, fnmatch, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'ledger.md'); LOG = os.path.join(HERE, 'runs.jsonl')
QW = os.path.expanduser('~/.qoderwake-cn/bin/qoderwake-cn'); MODEL = 'Qwen3.8-Flash'; WMODEL = 'qfmodel'
# Waker pools per role: (agentId, free model). Free models only: qfmodel=Qwen3.8-Flash, dfmodel=DeepSeek-Flash.
WAKERS = {'frontend': [('8acd2c601595', 'qfmodel')], 'qa': [('d40e14e13b31', 'qfmodel')],
          'bugfix': [('ee6e605c150a', 'dfmodel'), ('9606b0235d5a', 'qfmodel'), ('af5bba3f7611', 'dfmodel')],
          'regress': [('f17c368b3edb', 'dfmodel')]}
import threading, itertools
_rr = {k: itertools.cycle(v) for k, v in WAKERS.items()}; _rrl = threading.Lock()
def pick(role, attempt, t=None):
    if t and t.get('waker') and attempt == 1: return t['waker'], t.get('model', 'dfmodel')  # pinned (evolver A/B: same Waker+model in both arms)
    with _rrl: w, m = next(_rr.get(role, _rr['frontend']))
    if attempt > 1: m = 'qfmodel' if m == 'dfmodel' else 'dfmodel'  # cross-model retry
    return w, m
SKIP = {'.git', '.lock', '.qoder', 'results', 'node_modules', '.wrangler', 'shots', '.dev.vars', 'deploy.sh'}

def now(): return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')
def inscope(path, scope): return any(fnmatch.fnmatch(path, s) or path.startswith(s.rstrip('*')) for s in scope)
def overlap(a, b): return any(inscope(x, b['scope']) or inscope(y, a['scope']) for x in a['scope'] for y in b['scope']) or bool(set(a['scope']) & set(b['scope']))

def plan(tasks):
    ids = {t['id']: t for t in tasks}
    deps = {t['id']: set(t.get('after', [])) for t in tasks}
    for c in tasks:  # implicit producer->consumer edges
        for p in tasks:
            if p is not c and any(inscope(f, p['scope']) for f in c.get('consumes', [])): deps[c['id']].add(p['id'])
    order, ready = [], [t['id'] for t in tasks if not deps[t['id']]]
    indeg = {k: len(v) for k, v in deps.items()}
    while ready:
        n = ready.pop(0); order.append(n)
        for k, v in deps.items():
            if n in v:
                indeg[k] -= 1
                if indeg[k] == 0: ready.append(k)
    if len(order) != len(tasks): raise SystemExit('cycle in task graph: ' + str(set(ids) - set(order)))
    batches, level = [], {}
    for n in order:  # lowest batch after all deps, with no scope overlap
        b = max([level[d] + 1 for d in deps[n]] or [0])
        while b < len(batches) and any(overlap(ids[n], ids[m]) for m in batches[b]): b += 1
        if b == len(batches): batches.append([])
        batches[b].append(n); level[n] = b
    return batches

def snapshot(d):
    out = {}
    for r, ds, fs in os.walk(d):
        ds[:] = [x for x in ds if x not in SKIP]
        for f in fs:
            if f in SKIP: continue
            p = os.path.join(r, f); out[os.path.relpath(p, d)] = hashlib.md5(open(p, 'rb').read()).hexdigest()
    return out

ARM = os.environ.get('ARM', '')  # A/B tag written to runs.jsonl
MAXATT = int(os.environ.get('MAXATT', '3'))  # evolver A/B uses 1 (fixed, equal budget per arm)
LESSONS_DIR = os.path.join(HERE, 'lessons')
def load_lessons():
    """Lessons to inject. LESSONS=none -> none; LESSONS=<file.json> -> that list (A/B arms); default -> lessons/active/*.json."""
    v = os.environ.get('LESSONS', '')
    if v == 'none': return []
    try:
        if v: return json.load(open(v))
        d = os.path.join(LESSONS_DIR, 'active')
        return [json.load(open(os.path.join(d, f))) for f in sorted(os.listdir(d)) if f.endswith('.json')]
    except Exception as e:
        print('lessons unreadable, injecting none:', e, flush=True); return []
def retrieve(t, model, lessons, k=2):
    """<=2 lessons per task, metadata filter first (role, model), then trigger keywords; zero when none clearly applies."""
    text = (t.get('goal', '') + ' ' + ' '.join(t.get('scope', []))).lower(); out = []
    for L in lessons:
        sc = L.get('scope', {})
        if sc.get('roles') and t.get('role', 'frontend') not in sc['roles']: continue
        if sc.get('model_ids') and model not in sc['model_ids']: continue
        kw = [x.lower() for x in L.get('trigger_keywords', [])]
        if kw and not any(x in text for x in kw): continue
        out.append(L)
    return out[:k]
def lesson_text(Ls):
    if not Ls: return ''
    return 'Lessons from earlier attempts (advisory; the verifier still decides):\n' + '\n'.join(
        f'- [{L["id"]}] When {L["trigger"]}: {L["recommended_action"]} (Not when: {"; ".join(L.get("do_not_apply_when", [])) or "-"})' for L in Ls) + '\n\n'
def diffstat(wd, files):
    out = {}
    for f in files:
        b, n = os.path.join(wd + '.base', f), os.path.join(wd, f)
        r = subprocess.run(['git', 'diff', '--no-index', '--numstat', b if os.path.exists(b) else '/dev/null', n if os.path.exists(n) else '/dev/null'], capture_output=True, text=True)
        try: a, d = r.stdout.split()[:2]; out[f] = [int(a), int(d)]
        except Exception: out[f] = None
    return out
_cli = threading.Lock()  # each qoderwake-cn CLI process is a ~450MB bun binary: never run more than one at a time (OOM killed the daemon on 10-24)
def qw(args, timeout=120):
    with _cli: return subprocess.run([QW] + args, capture_output=True, text=True, timeout=timeout)
def _settled(sid):
    # a turn is finished only when the session has a `result` event (session wait alone can return before the turn starts)
    e = qw(['session', 'events', '--session-id', sid, '--json'])
    try: return any(x.get('event_type') == 'result' for x in json.loads(e.stdout).get('data', []))
    except Exception: return False
def await_turn(sid, timeout):
    """Poll with short CLI calls instead of a long-lived `session wait` per worker (memory). Returns (detail_stdout, timed_out, err)."""
    t0 = time.time(); fails = 0; out = ''
    while time.time() - t0 < timeout:
        time.sleep(15)
        d = qw(['session', 'detail', '--session-id', sid, '--json'], 60)
        try: st = json.loads(d.stdout).get('runtimeState'); fails = 0; out = d.stdout
        except Exception:
            fails += 1
            if fails >= 4: return out, False, 'daemon unreachable: ' + (d.stdout + d.stderr)[-200:]
            ensure_daemon(); continue
        if st not in ('pending', 'starting', 'running') and _settled(sid): return out, False, ''
    qw(['session', 'stop', '--session-id', sid, '--yes'], 60)  # no orphan writing into a later attempt
    return out, True, ''
def worker(t, retry_note='', attempt=1):
    wd = f'/tmp/orchestra/{ARM}{t["id"]}-a{attempt}'; shutil.rmtree(wd, ignore_errors=True)
    shutil.copytree(ROOT, wd, ignore=shutil.ignore_patterns(*SKIP))
    before = snapshot(wd)
    shutil.rmtree(wd + '.base', ignore_errors=True); shutil.copytree(wd, wd + '.base')
    prompt = (f'Shared decision ledger (obey it):\n{open(LEDGER).read()}\n\nTASK {t["id"]}: {t["goal"]}\n'
              f'You may ONLY edit: {t["scope"]}. Read-only context: {t.get("consumes", [])}.\n'
              f'Done means: {t["accept"]}\n{retry_note}\nEnd with one line starting DECISION: for anything later tasks must know.')
    # Worker = QoderWake CN local Waker session (free model qfmodel = Qwen3.8-Flash), cwd = isolated copy
    waker, wmodel = pick(t.get('role', 'frontend'), attempt, t)
    t['_model'] = wmodel; t['_waker'] = waker
    Ls = retrieve(t, wmodel, load_lessons()); t['_lessons'] = [L['id'] for L in Ls]
    prompt = lesson_text(Ls) + prompt
    if t.get('role') in ('bugfix', 'regress'): prompt = 'Use your sparkling-bugfix skill protocol.\n' + prompt
    for k in (1, 2):
        c = qw(['session', 'create', '--waker-id', waker, '--cwd', wd, '--model', wmodel, '--title', t['id'], '--message', prompt, '--json'])
        try: sid = json.loads(c.stdout)['sessionId']; break
        except Exception:
            sid = None
            if k == 1: ensure_daemon()
    if not sid: return wd, 'session create failed: ' + (c.stdout + c.stderr)[-500:], []
    det, timed_out, err = await_turn(sid, t.get('timeout', 900))
    t['_sid'] = sid; t['_timedout'] = timed_out
    if err: return wd, 'session create failed (' + err + ')', []
    ev = qw(['session', 'events', '--session-id', sid, '--json'])
    try: res = [x['payload'].get('result', '') for x in json.loads(ev.stdout)['data'] if x.get('event_type') == 'result']
    except Exception: res = []
    class p: stdout = det + '\n' + '\n'.join(r for r in res if isinstance(r, str))
    after = snapshot(wd)
    changed = [f for f in after if before.get(f) != after[f]] + [f for f in before if f not in after]
    return wd, p.stdout[-4000:], changed

def verify(t, cwd):
    cmds = ['node tests/unit.test.mjs'] + ([t['check']] if t.get('check') else [])
    for c in cmds:
        r = subprocess.run(c, shell=True, cwd=cwd, capture_output=True, text=True, timeout=600)
        if r.returncode: return False, f'$ {c}\n{(r.stdout + r.stderr)[-2000:]}'
    return True, 'ok'

def ensure_daemon():
    if not os.path.exists(QW):  # sandbox reset wipes ~
        for d in ('.qoderwake-cn', '.qoder-cn'):
            src = '/workspace/tools/home/' + d
            if os.path.isdir(src): subprocess.run(['cp', '-a', src, os.path.expanduser('~/')])
    st = qw(['status'], 60)
    if 'not running' not in st.stdout + st.stderr: return
    subprocess.Popen([QW, 'start', '--foreground'], stdout=open('/tmp/qw-daemon.log', 'a'), stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)  # detached: must outlive this batch
    for _ in range(30):
        time.sleep(4)
        st = qw(['status'], 60)
        if 'not running' not in st.stdout + st.stderr: return

def base_check(t):
    # R3: a bugfix check must FAIL on the untouched tree, else it proves nothing
    if t.get('role') != 'bugfix' or not t.get('check'): return 'n/a'
    r = subprocess.run(t['check'], shell=True, cwd=ROOT, capture_output=True, text=True, timeout=600)
    return 'fails-on-base' if r.returncode else 'PASSES-ON-BASE'

def rate_line(n_ok, n_all, t0):
    h = max((time.time() - t0) / 3600, 1e-6)
    return f'RATE accepted {n_ok}/{n_all} tasks in {h*60:.1f} min = {n_ok / h:.1f} accepted/hour'

def run_task(t):
    note = ''
    bc = base_check(t)
    if bc == 'PASSES-ON-BASE':
        print('SKIP', t['id'], 'check already passes on base, task proves nothing', flush=True)
        return None, [], 'check passes on base'
    for attempt in range(1, MAXATT + 1):
        t0 = time.time(); t['_timedout'] = False
        wd, out, changed = worker(t, note, attempt)
        bad = [f for f in changed if not inscope(f, t['scope'])]
        good = [f for f in changed if inscope(f, t['scope'])]
        ok, msg = verify(t, wd) if good else (False, out[:300] if out.startswith('session create failed') else 'no in-scope change')
        if not good and t.get('_timedout'): msg = 'timeout, no in-scope change'
        rec = dict(ts=now(), task=t['id'], attempt=attempt, model=t.get('_model', WMODEL), changed=good, rejected=bad, verified=ok, msg=msg[:500],
                   secs=int(time.time() - t0), arm=ARM, sid=t.get('_sid'), timedout=t.get('_timedout'),
                   role=t.get('role', 'frontend'), waker=t.get('_waker'), lessons=t.get('_lessons', []), diff=diffstat(wd, good))
        open(LOG, 'a').write(json.dumps(rec, ensure_ascii=False) + '\n')
        if ok:
            return wd, good, out
        shutil.rmtree(wd, ignore_errors=True); shutil.rmtree(wd + '.base', ignore_errors=True)  # /tmp is RAM-backed here (~47MB per attempt)
        note = f'PREVIOUS ATTEMPT FAILED. Verifier output:\n{msg}\nOut-of-scope edits rejected: {bad}. Fix only within scope.'
    return None, [], out

def main():
    spec = json.load(open(sys.argv[1])); tasks = spec['tasks']
    batches = plan(tasks); print('PLAN', json.dumps(batches))
    if '--dry' in sys.argv: return
    nolock = all(all(x.startswith(('design/', 'docs/', 'tests/adversarial/')) for x in t['scope']) for t in tasks)
    LOCKSH = os.path.join(ROOT, 'tools', 'lock.sh')
    def take():
        if nolock: return True
        for _ in range(20):
            if subprocess.run(['bash', LOCKSH, 'take', 'orchestra'], capture_output=True, text=True).returncode == 0: return True
        return False
    def release():
        if not nolock: subprocess.run(['bash', LOCKSH, 'release', 'orchestra'], capture_output=True)
    try:
        ids = {t['id']: t for t in tasks}
        from concurrent.futures import ThreadPoolExecutor
        mw = int(os.environ.get('MAXW', '2'))
        chunks = []
        for b in batches:
            led = open(LEDGER).read()
            def done(i):  # resume: merged per ledger; design-only tasks also count as done when their new files exist
                if ids[i].get('force'): return False
                if f'[{i}]' in led: return True
                return ids[i].get('role', 'frontend') in ('frontend', 'qa') and all(os.path.exists(os.path.join(ROOT, f)) for f in ids[i]['scope'] if '*' not in f)
            b = [i for i in b if not done(i)]
            chunks += [b[k:k + mw] for k in range(0, len(b), mw)]
        for b in chunks:  # merge after every chunk so progress survives a crash
            ensure_daemon()
            _bt0 = time.time()
            with ThreadPoolExecutor(max(1, len(b))) as ex: res = dict(zip(b, ex.map(lambda i: run_task(ids[i]), b)))
            print(rate_line(sum(1 for i in b if res[i][0]), len(b), _bt0), flush=True)
            if os.environ.get('NOMERGE') == '1':  # A/B control arm: measure only, never touch the real tree
                for i in b: print('NOMERGE', i, 'verified' if res[i][0] else 'FAILED', flush=True)
                continue
            if not take(): print('LOCK BUSY, results kept in /tmp/orchestra', flush=True); continue
            merged_any = False
            for i in b:  # merge in topo order, then integration test on real tree
                wd, good, out = res[i]
                if not wd: print('FAILED', i); continue
                backup = {f: open(os.path.join(ROOT, f), 'rb').read() for f in good if os.path.exists(os.path.join(ROOT, f))}
                conflict = False
                for f in good:  # 3-way merge so concurrent edits by other agents survive
                    dst, new, base = os.path.join(ROOT, f), os.path.join(wd, f), os.path.join(wd + '.base', f)
                    os.makedirs(os.path.dirname(dst) or ROOT, exist_ok=True)
                    if os.path.exists(dst) and os.path.exists(base) and open(dst, 'rb').read() != open(base, 'rb').read():
                        r = subprocess.run(['git', 'merge-file', '-q', dst, base, new])
                        if r.returncode != 0: conflict = True
                    else: shutil.copy2(new, dst)
                if conflict:
                    for f in good:
                        if f in backup: open(os.path.join(ROOT, f), 'wb').write(backup[f])
                    print('MERGE CONFLICT, rolled back', i, flush=True); continue
                ok, msg = verify(ids[i], ROOT)
                if not ok:  # roll back this merge
                    for f in good:
                        if f in backup: open(os.path.join(ROOT, f), 'wb').write(backup[f])
                        else: os.remove(os.path.join(ROOT, f))
                    print('INTEGRATION FAIL, rolled back', i, msg[:300]); continue
                dec = [l for l in out.splitlines() if l.startswith('DECISION:')]
                open(LEDGER, 'a').write(f'- {now()} [{i}] ' + (dec[-1][9:].strip() if dec else 'merged ' + ', '.join(good)) + '\n')
                print('MERGED', i, good, flush=True); merged_any = True
                shutil.rmtree(wd, ignore_errors=True); shutil.rmtree(wd + '.base', ignore_errors=True)
            if merged_any and os.environ.get('DEPLOY') == '1':
                d = subprocess.run('bash deploy.sh && python3 push.py "waker fixes: ' + ' '.join(b) + '"', shell=True, cwd=ROOT, capture_output=True, text=True, timeout=600)
                print('DEPLOY', d.returncode, (d.stdout + d.stderr)[-400:], flush=True)
            release()
    finally:
        release()
if __name__ == '__main__': main()
