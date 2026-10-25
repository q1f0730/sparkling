/* ---------------------------------------------------------------------------
   Plan result (screen 9)
   --------------------------------------------------------------------------- */
/* one POST per plan id for the "Same notes, no Qloo" comparison, started as soon as the plan is painted */
function prefetchPlain(planId){
  const cache = prefetchPlain.cache || (prefetchPlain.cache = Object.create(null));
  const id = planId == null ? "" : String(planId);
  if (cache[id]) return cache[id];
  const p = api("/api/plan/" + encodeURIComponent(id) + "/plain", { method: "POST", body: "{}" });
  cache[id] = p;
  p.catch(function(){ if (cache[id] === p) delete cache[id]; });
  return p;
}
function renderPlanResult(id){
  const token = beginView();
  setShell({ title: "Plan", tabs: true, active: "plan" });
  view.className = "view";
  const ac = abortable();
  const planId = String(id == null ? "" : id);
  let currentPlan = null;
  let busyAction = false;

  const cached = getCachedPlan(planId);
  if (cached) paint(cached);
  else {
    view.innerHTML = '<div class="skeleton sk-detail"></div><div class="skeleton sk-detail"></div>';
    loadRemote();
  }

  async function loadRemote(){
    try {
      const data = await api("/api/plan/" + encodeURIComponent(planId), { signal: ac.signal });
      const plan = data && (data.plan || data);
      if (!plan || !plan.id) throw new Error("no plan");
      cachePlan(plan);
      if (isCurrent(token)) paint(plan);
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      if (e.status === 404) {
        view.innerHTML = '<div class="missing-plan">' +
          emptyBlock("This plan is not there.", "It may have been deleted, or the link is old.", '<button class="btn btn-sm" type="button" data-nav="#/plan">Plan an afternoon</button>') +
        "</div>";
      } else {
        view.innerHTML = errorBlock("That plan did not load. Check your connection, then try again.", "plan");
        bindRetries({ plan: loadRemote });
      }
    }
  }

  function stopEvidenceHTML(kind, label, text, isRead, seeds){
    if (!text) return "";
    const tags = Array.isArray(seeds) ? seeds.filter(Boolean).slice(0, 3) : [];
    return '<div class="ev-row">' +
      '<span class="ev-label ' + kind + '">' + esc(label) + "</span>" +
      '<p class="ev-text' + (isRead ? " read" : "") + '">' + esc(text) + "</p>" +
      (tags.length ? '<div class="ev-seeds">' + tags.map(function(v, k){ return seedHTML({ name: v, type: "vibe" }, "sm" + (k < 2 ? " s" + (k + 1) : "")); }).join("") + "</div>" : "") +
    "</div>";
  }
  function sourcesHTML(stop){
    const src = Array.isArray(stop && stop.sources) ? stop.sources.filter(function(x){ return x && x.name; }) : [];
    if (!src.length) return stopEvidenceHTML("notes", "From your notes", stop && stop.from_notes, false);
    return '<div class="ev-row"><span class="ev-label notes">From your notes</span>' +
      '<div class="trace-list">' + src.map(function(x, i){
        const when = x.at ? new Date(Number(x.at)).toLocaleDateString(LANG === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }) : "";
        return '<button type="button" class="trace' + (i > 0 ? ' trace-extra' : '') + ' ' + typeClass(x.type) + '" data-nav="#/cards/' + attr(x.card_id) + '">' +
          (x.image ? '<img class="trace-img" src="' + attr(x.image) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="trace-img ph"></span>') +
          '<span class="trace-body"><span class="trace-name">' + esc(x.name) + (x.n > 1 ? ' <i>×' + esc(String(x.n)) + "</i>" : "") + "</span>" +
          (x.quote ? '<span class="trace-quote">&ldquo;' + esc(x.quote) + "&rdquo;</span>" : "") +
          (when ? '<span class="trace-at">' + esc(when) + "</span>" : "") + "</span></button>";
      }).join("") + (src.length > 1 ? '<button type="button" class="trace-more" data-less="' + attr(t("Show less")) + '" data-more="' + attr(t("+ " + (src.length - 1) + " more from your notes")) + '" onclick="var l=this.parentNode;l.classList.toggle(\'open\');this.textContent=l.classList.contains(\'open\')?this.getAttribute(\'data-less\'):this.getAttribute(\'data-more\')">' + esc(t("+ " + (src.length - 1) + " more from your notes")) + '</button>' : '') + "</div></div>";
  }
  function whyStopHTML(stop, plan){
    const w = stop && stop.why || {};
    const cf = Array.isArray(w.contributions) ? w.contributions : [];
    const max = cf.reduce(function(m, r){ return Math.max(m, r.score || 0); }, 0) || 1;
    const notesCard = '<section class="bcard"><div class="blabel"><i class="clay"></i><span>Your notes</span><small>' + esc(cf.length + " " + plural(cf.length, "card", "cards")) + "</small></div>" +
      (cf.length ? cf.slice(0, 4).map(function(r){
        const pct = Math.round((r.score || 0) * 100);
        return '<button type="button" class="ws-row type-' + attr(r.type || "other") + '" data-close-nav="#/cards/' + attr(r.card_id) + '">' +
          '<span class="ws-top"><b translate="no">' + esc(r.name) + '</b>' + (r.band ? '<span class="ws-band">' + esc(LANG === "zh" ? ({near:"熟悉",mid:"邻近",far:"远一步"})[r.band] : ({near:"familiar",mid:"nearby",far:"a step out"})[r.band]) + '</span>' : '') + '<span class="ws-pct num">' + pct + "%</span></span>" +
          '<span class="ws-bar"><i style="width:' + Math.max(4, Math.round((r.score || 0) / max * 100)) + '%"></i></span>' +
          (r.quote ? '<span class="ws-quote" translate="no">&ldquo;' + esc(r.quote) + "&rdquo;" + (r.at ? " &middot; " + esc(formatDate(r.at)) : "") + "</span>" : "") +
        "</button>" + (r.card_id ? '<button type="button" class="ws-no" data-redo="' + attr(r.card_id) + '">' + esc(LANG === "zh" ? "这张不适合我，重新计划" : "Not for me, re-plan without it") + "</button>" : "");
      }).join("") : '<p class="why-line">Per-input attribution unavailable for this stop. Qloo returned it for your cards taken together.</p>') +
    "</section>";
    const vibes = Array.isArray(w.vibes) ? w.vibes : [];
    const qlooCard = '<section class="bcard"><div class="blabel"><i></i><span>Qloo evidence</span><small>' + (w.affinity != null ? "affinity " + Number(w.affinity).toFixed(2) : "") + "</small></div>" +
      (cf.length ? '<p class="why-line">Qloo reports how much each of your cards contributed to this match. The shares add up to 100%; they describe the match, not why you would enjoy it.</p>' : "") +
      (vibes.length ? '<div class="seeds">' + vibes.slice(0, 4).map(function(v, k){ return seedHTML({ name: v, type: "vibe" }, "sm" + (k < 2 ? " s" + (k + 1) : "")); }).join("") + "</div>" : "") +
      (w.popularity != null ? '<p class="why-line">Popularity ' + Number(w.popularity).toFixed(2) + " (0 is obscure, 1 is everywhere).</p>" : "") +
    "</section>";
    const readCard = stop && stop.read ? '<section class="bcard bread"><div class="blabel"><span>Sparkling&rsquo;s read</span></div><p>' + esc(stopRead(stop)) + "</p><p class=\"why-line\">" + (stop.read_src === "model" ? "A sentence written by a model from the venue&rsquo;s description. It is not Qloo data." : "A plain template filled from Qloo&rsquo;s tags. No model wrote this.") + "</p></section>" : "";
    const rc = '<div class="why-receipt" translate="no">' +
      "<div>GET /v2/insights &middot; filter.type=" + esc(w.type || "urn:entity:place") + "</div>" +
      "<div class=\"ind\">feature.explainability=true</div>" +
      "<div class=\"ind\">" + (w.area ? "near " + esc(w.area) + " &middot; " : "") + esc(String(w.seeds_sent || cf.length)) + " card IDs sent</div>" +
      "<div class=\"ind\">" + esc(String(w.type || "place").split(":").pop()) + " " + esc(String(w.qloo_id || "").slice(0, 8)) + "&hellip;</div>" +
      (stop && stop.checks && !Array.isArray(stop.checks) ? "<div>checks &middot; " + esc([stop.checks.category ? "genre " + stop.checks.category : "", stop.checks.neighborhood_source ? "hood via " + stop.checks.neighborhood_source : "", stop.checks.fit != null ? "fit " + stop.checks.fit : "", stop.open_on_arrival != null ? "open on arrival " + stop.open_on_arrival : ""].filter(Boolean).join(" · ")) + "</div>" : "") +
      cf.map(function(r){ return '<div class="ind">' + esc(String(r.qloo_id || "").slice(0, 8)) + "&hellip; " + esc(String(r.score)) + ' <span class="why-faint">' + esc(r.name) + "</span></div>"; }).join("") +
      "</div>";
    return '<span tabindex="-1" data-autofocus class="why-focus"></span>' +
      '<h3 class="why-h1" translate="no">' + esc((stop && stop.name) || "This stop") + "</h3>" +
      '<p class="why-intro">Three layers, kept apart: what you wrote, what Qloo says, and what Sparkling adds.</p>' +
      notesCard + qlooCard + readCard +
      '<details class="why-details"><summary>Receipt</summary>' + rc + "</details>";
  }
  /* compare verdict: two plain lines at the top of the sheet, counted from what is already on screen */
  function verdictKeptLink(x){
    if (!x) return false;
    if (x.why_line || x.from_notes) return true;
    return Array.isArray(x.sources) && x.sources.some(function(s){ return s && s.name; });
  }
  function verdictSeeds(plan, pl){
    if (pl && Array.isArray(pl.seeds) && pl.seeds.length) {
      return pl.seeds.map(function(x){ return typeof x === "string" ? x : (x && x.name) || ""; }).filter(Boolean);
    }
    const rs = plan && plan.receipt && Array.isArray(plan.receipt.seeds) ? plan.receipt.seeds : [];
    return rs.map(function(x){ return x && x.name; }).filter(Boolean);
  }
  function verdictNamesSeed(text, seeds){
    const s = String(text == null ? "" : text).toLowerCase();
    if (!s.trim() || !seeds.length) return false;
    return seeds.some(function(n){ return n && s.indexOf(String(n).toLowerCase()) >= 0; });
  }
  function verdictPair(o){
    if (Array.isArray(o) && o.length >= 2) return { tied: Number(o[0]) || 0, total: Number(o[1]) || 0 };
    if (!o || typeof o !== "object") return null;
    const tied = o.tied != null ? o.tied : o.kept != null ? o.kept : o.n;
    const total = o.total != null ? o.total : o.of != null ? o.of : o.count;
    return tied != null && total != null ? { tied: Number(tied) || 0, total: Number(total) || 0 } : null;
  }
  function verdictHTML(plan, pl, mineItems, plainItems){
    const mine = (Array.isArray(mineItems) ? mineItems : []).filter(function(x){ return x && x.name; });
    const plain = (Array.isArray(plainItems) ? plainItems : []).filter(function(x){ return x && x.name; });
    const seeds = verdictSeeds(plan, pl);
    let withN = mine.filter(function(x){ return verdictKeptLink(x); }).length, withT = mine.length;
    let withoutN = plain.filter(function(x){ return verdictNamesSeed(x.why, seeds); }).length, withoutT = plain.length;
    let checked = null;
    /* a server-sent verdict, when present, is authoritative */
    const v = pl && pl.verdict;
    if (v && typeof v === "object") {
      /* the keys POST /api/plan/:id/plain really sends */
      if (v.mine_linked != null || v.mine_total != null) {
        if (v.mine_linked != null) withN = Number(v.mine_linked) || 0;
        if (v.mine_total != null) withT = Number(v.mine_total) || 0;
      } else {
        const a = verdictPair(v.with_qloo || v.withQloo || v["with"] || v.sparkling);
        if (a) { withN = a.tied; withT = a.total; }
      }
      if (v.plain_linked != null || v.plain_total != null) {
        if (v.plain_linked != null) withoutN = Number(v.plain_linked) || 0;
        if (v.plain_total != null) withoutT = Number(v.plain_total) || 0;
      } else {
        const b = verdictPair(v.without_qloo || v.withoutQloo || v.without || v.plain);
        if (b) { withoutN = b.tied; withoutT = b.total; }
      }
      if (typeof v.plain_pass === "number" && isFinite(v.plain_pass)) checked = v.plain_pass;
    }
    return '<div class="plain-verdict" role="note" style="margin:2px 0 14px;padding:12px 14px;border:1px solid var(--b-line);border-radius:18px;background:var(--b-soft)">' +
      '<p class="pv-with" style="margin:0;font-family:var(--sans);font-size:13px;font-weight:600;line-height:1.5;color:var(--b-ink)">' + esc(t("With Qloo: " + withN + " of " + withT + " tied to a card you kept.")) + "</p>" +
      '<p class="pv-without" style="margin:4px 0 0;font-family:var(--sans);font-size:13px;font-weight:400;line-height:1.5;color:var(--b-ink2)">' + esc(t("Without Qloo: " + withoutN + " of " + withoutT + " tied to a card you kept.")) + "</p>" +
      (checked != null ? '<p class="pv-check" style="margin:4px 0 0;font-family:var(--sans);font-size:13px;font-weight:400;line-height:1.5;color:var(--b-ink2)">' + esc(t("Without Qloo: " + checked + " of " + withoutT + " places checked out.")) + "</p>" : "") +
    "</div>";
  }
  async function openPlain(){
    openSheet({ title: t("Same notes, no Qloo"), cls: "why-sheet", body: '<div class="plain-skel" aria-busy="true"><p class="muted">' + esc(t("Asking a plain model, no Qloo… usually 5–15 seconds.")) + '</p><div style="height:14px;border-radius:7px;background:rgba(120,110,90,.18);margin:12px 0;width:80%"></div><div style="height:14px;border-radius:7px;background:rgba(120,110,90,.18);margin:12px 0;width:60%"></div><div style="height:14px;border-radius:7px;background:rgba(120,110,90,.18);margin:12px 0;width:70%"></div></div>' });
    let d = null;
    try { d = await prefetchPlain(planId); } catch (e) {}
    const pl = d && d.plain;
    /* the raw model id stays out of the sheet; it is only a hover title for provenance */
    const modelSlug = pl && pl.model ? String(pl.model).split("/").pop() : "";
    const modelLabel = modelSlug ? esc(modelSlug) : "";
    if (currentPlan && currentPlan.mode === "in") {
      /* stayin: compare the picks side by side — Sparkling's carry a kept-card link, the plain model's carry none */
      const picks = (Array.isArray(currentPlan.picks) ? currentPlan.picks : []).filter(function(p){ return p && p.name; });
      const plainPicks = pl && Array.isArray(pl.picks) ? pl.picks.filter(function(p){ return p && p.name; }) : [];
      const kindTag = function(k){ return k ? ' <small>(' + esc(t(String(k).toLowerCase())) + ")</small>" : ""; };
      const keptLine = function(p){
        const src = (Array.isArray(p.sources) ? p.sources : []).filter(function(x){ return x && x.name; }).slice(0, 2);
        if (!src.length) return p.why_line ? '<small class="muted">' + esc(p.why_line) + "</small>" : "";
        const names = src.map(function(x){
          const label = LANG === "zh" ? "《" + x.name + "》" : x.name;
          return x.card_id ? '<a class="df-link" href="#/cards/' + attr(x.card_id) + '" data-close-nav="#/cards/' + attr(x.card_id) + '" translate="no">' + esc(label) + "</a>" : '<span translate="no">' + esc(label) + "</span>";
        });
        return '<small class="muted">' + esc(t("because you kept")) + (LANG === "zh" ? "" : " ") + names.join(LANG === "zh" ? "、" : " and ") + "</small>";
      };
      const minePicks = picks.map(function(p){ return '<li><b translate="no">' + esc(p.name) + "</b>" + kindTag(p.kind) + "<br>" + keptLine(p) + "</li>"; }).join("");
      const theirPicks = plainPicks.length ? plainPicks.map(function(p){ return '<li><b translate="no">' + esc(p.name) + "</b>" + kindTag(p.kind) + "<br>" + (p.why ? '<small class="muted" translate="no">' + esc(p.why) + "</small>" : "") + "</li>"; }).join("") : '<li><small class="muted">' + esc((pl && pl.note) || t("Could not load.")) + "</small></li>";
      const body = verdictHTML(currentPlan, pl, picks, plainPicks) + '<p class="muted" title="' + modelLabel + '">' + esc(t("Same cards, same model. The only change: no Qloo.")) + "</p>" +
        '<div class="why-feed">' +
          '<section><h3 class="r7-eyebrow">' + esc(t("Sparkling + Qloo")) + '</h3><ol class="plain-list" style="margin:0;padding-left:18px">' + minePicks + "</ol></section>" +
          '<section><h3 class="r7-eyebrow">' + esc(t("Plain model")) + '</h3><ol class="plain-list" style="margin:0;padding-left:18px">' + theirPicks + "</ol></section>" +
        "</div>" +
        '<p class="why-line">' + esc(t("What is lost: the card behind each pick, and any check that it exists.")) + "</p>" +
        '<p class="muted"><small>' + esc(t("The model named these from memory. Sparkling did not look them up.")) + "</small></p>";
      openSheet({ title: t("Same notes, no Qloo"), cls: "why-sheet", body: body, onMount: function(m){
        m.querySelectorAll("[data-close-nav]").forEach(function(a){
          a.addEventListener("click", function(e){ e.preventDefault(); const h = a.getAttribute("data-close-nav"); closeModal(); location.hash = h; });
        });
      }});
      return;
    }
    const mine = (currentPlan.stops || []).map(function(s, i){ const hood = s.neighborhood || s.address || ""; const dst = i > 0 && s.distance ? String(s.distance).replace(/ from stop \d+/, "") : ""; const op = s.open_on_arrival === true ? t("Open on arrival") : s.open_on_arrival === false ? t("May be closed when you arrive") : ""; const bits = [dst ? esc(t(dst)) : "", hood ? esc(hood) : "", op ? esc(op) : ""].filter(Boolean).join(" · "); return '<li><b translate="no">' + esc(s.name) + '</b><br><span class="pc pc-ok">' + esc(t("In Qloo")) + '</span>' + (bits ? '<small class="muted"> · ' + bits + '</small>' : "") + '<br><small>' + esc(stopRead(s)) + '</small></li>'; }).join("");
    const CK = { found: ["ok", "In Qloo"], far: ["warn", "In Qloo, but far"], closed: ["bad", "Closed for good, per Qloo"], not_found: ["warn", "Not in Qloo, so unchecked"], elsewhere: ["bad", "Only found in another city"], unchecked: ["muted", "Not checked"] };
    const ckLine = function(c){ if (!c) return '<span class="pc pc-muted">' + esc(t("Not checked")) + "</span>"; const k = CK[c.status] || CK.unchecked; const dist = c.mi != null ? " · " + esc(t(c.mi < 0.1 ? "on the route" : c.mi + " mi from the route")) : ""; return '<span class="pc pc-' + k[0] + '">' + esc(t(k[1])) + "</span>" + (c.status !== "not_found" && c.status !== "unchecked" && c.status !== "elsewhere" ? '<small class="muted">' + dist + (c.hood ? " · " + esc(c.hood) : "") + "</small>" : ""); };
    const theirs = pl && pl.stops && pl.stops.length ? pl.stops.map(function(s){ return '<li><b translate="no">' + esc(s.name) + '</b>' + (s.kind ? ' <small>(' + esc(t(String(s.kind).toLowerCase())) + ')</small>' : '') + '<br>' + ckLine(s.check) + '<br><small>' + esc(s.why) + '</small></li>'; }).join("") : '<li>' + esc((pl && pl.note) || t("Could not load.")) + '</li>';
    const ok = pl && pl.stops ? pl.stops.filter(function(s){ return s.check && (s.check.status === "found"); }).length : 0;
    const body = verdictHTML(currentPlan, pl, currentPlan.stops, pl && pl.stops) + '<p class="muted" title="' + modelLabel + '">' + esc(t("Same cards, same area, same model. The only change: no Qloo.")) + '</p>' +
      '<h3>' + esc(t("Plain model")) + '</h3><ol class="plain-list">' + theirs + '</ol><p class="muted"><small>' + esc(t("The model named these from memory. Afterwards Sparkling looked each one up in Qloo: does it exist, is it still open, is it near your route.")) + (pl && pl.stops && pl.stops.length ? " " + esc(t(ok + " of " + pl.stops.length + " pass.")) : "") + '</small></p>' +
      '<h3>' + esc(t("Sparkling + Qloo")) + '</h3><ol class="plain-list">' + mine + '</ol><p class="muted"><small>' + esc(t("Every stop came from Qloo in the first place: an ID, coordinates, listed hours and credit to your notes.")) + '</small></p>';
    openSheet({ title: t("Same notes, no Qloo"), cls: "why-sheet", body: body });
  }
  function openWhyStop(i, pick){
    const stop = currentPlan && (pick ? currentPlan.picks : currentPlan.stops) && (pick ? currentPlan.picks : currentPlan.stops)[i];
    if (!stop) return;
    openSheet({ title: pick ? "Why this pick?" : "Why this stop?", cls: "why-sheet", body: whyStopHTML(stop, currentPlan), onMount: function(m){
      m.querySelectorAll("[data-close-nav]").forEach(function(btn){
        btn.addEventListener("click", function(){ const h = btn.getAttribute("data-close-nav"); closeModal(); location.hash = h; });
      });
      m.querySelectorAll("[data-redo]").forEach(function(btn){
        btn.addEventListener("click", function(){ closeModal(); redoPlan(btn.getAttribute("data-redo"), false); });
      });
    }});
  }
  /* correction beat: mark one card "not for me" (or put it back), re-plan the same request, land on the new plan with a diff */
  async function redoPlan(cardId, restore){
    if (busyAction || !cardId) return;
    busyAction = true;
    const cardName = (function(){ const rows = ((currentPlan && currentPlan.stops && currentPlan.stops.length ? currentPlan.stops : currentPlan && currentPlan.picks) || []).reduce(function(a, st){ return a.concat((st.why && st.why.contributions) || [], st.sources || []); }, []); const hit = rows.filter(function(r){ return r && r.card_id === cardId; })[0]; return hit ? hit.name : ""; })();
    view.innerHTML = '<div class="redo-wait" role="status"><p class="r7-eyebrow">' + esc(restore ? (LANG === "zh" ? "放回去" : "Putting it back") : (LANG === "zh" ? "已标记" : "Marked not for me")) + '</p>' +
      '<h2 class="r7-display"><em translate="no">' + esc(cardName || "…") + '</em></h2>' +
      '<p class="muted">' + esc(LANG === "zh" ? "按同样的要求重新计划，一会儿告诉你变了什么。" : "Planning the same afternoon again. Then you will see exactly what changed.") + '</p><div class="skeleton sk-detail"></div></div>';
    try {
      const body = { redo_from: planId, lang: LANG === "zh" ? "zh" : "en" };
      body[restore ? "restore_card" : "dislike_card"] = cardId;
      const res = await fetch("/api/plan", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok || !res.body) throw new Error("Request failed (" + res.status + ")");
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", fin = false, got = null, errTxt = "";
      while (!fin) {
        const stp = await reader.read(); fin = !!stp.done;
        buf += dec.decode(stp.value || new Uint8Array(0), { stream: !fin });
        const parts = buf.split(/\r?\n/); buf = parts.pop();
        parts.forEach(function(raw){ let m = null; try { m = JSON.parse(raw); } catch (_) {} if (m && m.type === "plan" && m.plan && m.plan.id) got = m.plan; else if (m && m.type === "error") errTxt = m.text || "error"; });
      }
      if (!got) throw new Error(errTxt || "The plan stream ended before a plan arrived.");
      cachePlan(got);
      busyAction = false;
      go("#/plan/" + encodeURIComponent(String(got.id)));
    } catch (e) {
      busyAction = false;
      if (isAbort(e)) return;
      toast((e && e.message) || t("That did not work. Try again."));
      if (currentPlan) paint(currentPlan);
    }
  }
  function diffHTML(plan){
    const d = plan && plan.diff; if (!d || !d.card) return "";
    const zh = LANG === "zh";
    const rows = (d.changes || []).map(function(c){
      const was = c.was ? '<s translate="no">' + esc(c.was) + '</s>' : "", now = c.now ? '<b translate="no">' + esc(c.now) + '</b>' : '<i>' + esc(zh ? "没有替代" : "nothing replaces it") + '</i>';
      return '<li><span class="df-n num">' + esc(d.unit === "pick" ? (zh ? "第" + c.stop + "个" : "Pick " + c.stop) : zh ? "第" + c.stop + "站" : "Stop " + c.stop) + '</span>' + (c.was ? was + ' <span aria-hidden="true">&rarr;</span> ' : (zh ? "新增 " : "added ")) + now + '</li>';
    }).join("");
    const rc = (d.recredit || []).map(function(c){
      return '<li><span class="df-n num">' + esc(zh ? "第" + c.stop + "站" : "Stop " + c.stop) + '</span><b translate="no">' + esc(c.name) + '</b> ' + esc(zh ? "还在，理由换成了 " : "stays, now because of ") + '<span translate="no">' + esc((c.now || []).join(", ") || "—") + '</span></li>';
    }).join("");
    const head = d.restore ? (zh ? "放回 " : "Put back ") : (zh ? "不含 " : "Without ");
    const lead = d.same ? (zh ? "路线没变：别的地方同样合适。" : "The route held: nothing else fit better.") : "";
    return '<section class="plan-diff" aria-label="' + attr(zh ? "和上一版的差别" : "What changed") + '">' +
      '<p class="r7-eyebrow">' + esc(zh ? "和上一版的差别" : "What changed") + '</p>' +
      '<h3 class="df-h">' + esc(head) + '<em translate="no">' + esc(d.card) + '</em></h3>' +
      ((rows || rc) ? '<ul class="df-list">' + rows + rc + '</ul>' : '') + (lead ? '<p class="df-lead">' + esc(lead) + '</p>' : '') +
      (d.kept && d.kept.length ? '<p class="df-kept">' + esc(zh ? "没变：" : "Kept: ") + '<span translate="no">' + esc(d.kept.join(", ")) + '</span></p>' : '') +
      '<div class="df-acts">' + (d.from ? '<a class="df-link" href="#/plan/' + attr(d.from) + '">' + esc(zh ? "看上一版" : "See the previous plan") + '</a>' : '') + '</div>' +
    '</section>';
  }
  function stopHTML(stop, i, all){
    const mapUrl = safeHttpUrl(stop && stop.map_url);
    const opsText = (stop && stop.ops) || "Hours not checked";
    const place = stop && (stop.neighborhood || stop.address) || "";
    const link = i > 0 && stop && stop.distance ? '<div class="stop-connector" aria-label="' + attr(stop.distance) + '">' + esc(String(stop.distance).replace(/ from stop \d+/, "")) + "</div>" : "";
    return link + '<section class="stop">' +
      '<div class="stop-head">' +
        '<span class="stop-index num">' + (i + 1) + "</span>" +
        '<div class="stop-main">' +
          '<p class="r7-stop-eyebrow num">' + esc("Stop " + String(i + 1).padStart(2, "0")) + '</p>' +
          (stop && stop.arrive ? '<p class="stop-time">' + esc(stop.arrive) + (stop.stay_min ? " &middot; " + esc(String(stop.stay_min)) + (LANG === "zh" ? " 分钟" : " min") : "") + "</p>" : "") +
          '<h3 class="stop-name">' + esc((stop && stop.name) || "Somewhere") + "</h3>" +
          '<p class="stop-where">' + esc([stop && stop.kind && t(String(stop.kind).toLowerCase()), place].filter(Boolean).join(" · ")) + "</p>" +
          (stop && stop.open_on_arrival === true ? '<p class="stop-open">' + esc(t("Open when you arrive, per listed hours")) + "</p>" : stop && stop.open_on_arrival === false ? '<p class="stop-open stop-open-warn">' + esc(t("May be closed when you arrive")) + "</p>" : "") +
        "</div>" +
      "</div>" +
      '<div class="evidence">' +
        sourcesHTML(stop) +
        stopEvidenceHTML("qloo", "From the catalogue", stop && stop.from_qloo, false, stop && stop.vibes) +
        stopEvidenceHTML("read", "Sparkling's read", stop && stopRead(stop), true) +
      "</div>" +
      '<div class="stop-ops">' +
        "<span>" + esc(opsText) + "</span>" +
        (mapUrl ? '<span class="sep" aria-hidden="true">&middot;</span><a href="' + attr(mapUrl) + '" target="_blank" rel="noopener">Open map</a>' : "") +
        '<span class="sep" aria-hidden="true">&middot;</span><button type="button" data-swap="' + i + '"' + (busyAction ? " disabled" : "") + ">Swap</button>" +
      "</div>" +
      '<button class="why-btn why-stop-btn" type="button" data-why-stop="' + i + '">Why this stop?</button>' +
    "</section>";
  }
  function routeMapHTML(stops, W0, H0){
    const pts = stops.map(function(s){ return s && s.coords && isFinite(s.coords.lat) && isFinite(s.coords.lon) ? s.coords : null; });
    if (pts.some(function(x){ return !x; }) || pts.length < 2) return "";
    const lat0 = pts.reduce(function(a, p){ return a + p.lat; }, 0) / pts.length;
    const kx = Math.cos(lat0 * Math.PI / 180);
    const xs = pts.map(function(p){ return p.lon * kx; }), ys = pts.map(function(p){ return -p.lat; });
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const W = W0 || 350, H = H0 || 150, pad = 28;
    const sc = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6), (H - 2 * pad) / Math.max(maxY - minY, 1e-6));
    const ox = (W - sc * (maxX - minX)) / 2, oy = (H - sc * (maxY - minY)) / 2;
    const P = pts.map(function(_, i){ return [ox + sc * (xs[i] - minX), oy + sc * (ys[i] - minY)]; });
    let grid = "";
    for (let g = 1; g < 7; g++) grid += '<line x1="' + (g * W / 7) + '" y1="0" x2="' + (g * W / 7) + '" y2="' + H + '"/>';
    for (let g = 1; g < 4; g++) grid += '<line x1="0" y1="' + (g * H / 4) + '" x2="' + W + '" y2="' + (g * H / 4) + '"/>';
    return '<figure class="route-map' + (W0 ? ' route-map-side' : '') + '" role="img" aria-label="Route between the stops, schematic">' +
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet"><g class="rm-grid">' + grid + "</g>" +
      '<polyline class="rm-path" points="' + P.map(function(q){ return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '"/>' +
      P.map(function(q, i){ return '<g class="rm-pin"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="12"/><text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 4.5).toFixed(1) + '" text-anchor="middle">' + (i + 1) + "</text></g>"; }).join("") +
      "</svg><figcaption>"+t("Schematic route")+" &middot; "+t("not to scale")+"</figcaption></figure>";
  }
  function sideHTML(stops, plan){
    if (!stops.length) return "";
    /* desk:side-map — tall labelled route for the desktop inspector; pins open Why this stop */
    const pts = stops.map(function(s){ return s && s.coords && isFinite(s.coords.lat) && isFinite(s.coords.lon) ? s.coords : null; });
    let map = "";
    if (pts.length >= 2 && !pts.some(function(x){ return !x; })) {
      const lat0 = pts.reduce(function(a, p){ return a + p.lat; }, 0) / pts.length, kx = Math.cos(lat0 * Math.PI / 180);
      const xs = pts.map(function(p){ return p.lon * kx; }), ys = pts.map(function(p){ return -p.lat; });
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      const W = 380, H = 620, px = 96, py = 70;
      const sc = Math.min((W - 2 * px) / Math.max(maxX - minX, 1e-6), (H - 2 * py) / Math.max(maxY - minY, 1e-6));
      const ox = (W - sc * (maxX - minX)) / 2, oy = (H - sc * (maxY - minY)) / 2;
      const P = pts.map(function(_, i){ return [ox + sc * (xs[i] - minX), oy + sc * (ys[i] - minY)]; });
      let grid = "";
      for (let g = 1; g < 6; g++) grid += '<line x1="' + (g * W / 6).toFixed(1) + '" y1="0" x2="' + (g * W / 6).toFixed(1) + '" y2="' + H + '"/>';
      for (let g = 1; g < 10; g++) grid += '<line x1="0" y1="' + (g * H / 10).toFixed(1) + '" x2="' + W + '" y2="' + (g * H / 10).toFixed(1) + '"/>';
      const short = function(s){ s = String(s || ""); return s.length > 22 ? s.slice(0, 21) + "\u2026" : s; };
      map = '<figure class="route-map route-map-side" role="img" aria-label="' + attr(t("Route between the stops, schematic")) + '">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet"><g class="rm-grid">' + grid + "</g>" +
        '<polyline class="rm-path" points="' + P.map(function(q){ return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '"/>' +
        P.map(function(q, i){
          const right = q[0] < W * 0.55, lx = right ? q[0] + 20 : q[0] - 20, anchor = right ? "start" : "end", st = stops[i] || {};
          return '<g class="rm-pin" data-why-stop="' + i + '"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="13"/>' +
            '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 4.5).toFixed(1) + '" text-anchor="middle">' + (i + 1) + "</text>" +
            '<text class="rm-label" translate="no" x="' + lx.toFixed(1) + '" y="' + (q[1] - 1).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(short(st.name)) + "</text>" +
            '<text class="rm-sub" x="' + lx.toFixed(1) + '" y="' + (q[1] + 13).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(String(st.arrive || "")) + "</text></g>";
        }).join("") +
        "</svg><figcaption>" + t("Schematic route") + " &middot; " + t("not to scale") + "</figcaption></figure>";
    }
    const legs = stops.map(function(st, i){
      const m = i > 0 && st && st.distance ? String(st.distance).match(/(\d+)\s*min/) : null;
      return m ? "<li>" + i + " \u2192 " + (i + 1) + " \u00b7 " + esc(LANG === "zh" ? m[1] + " 分钟步行" : m[1] + " min walk") + "</li>" : "";
    }).join("");
    return '<aside class="plan-side" aria-label="' + attr(t("Route")) + '"><p class="ps-eyebrow">' + esc(t("Route")) + "</p>" + map +
      (legs ? '<ul class="ps-legs">' + legs + "</ul>" : "") + "</aside>";
  }
  function planSummary(stops){
    if (!stops.length) return "";
    const first = stops[0] && stops[0].arrive, last = stops[stops.length - 1] && stops[stops.length - 1].leave;
    return first && last ? first + " to " + last : "";
  }
  /* stayin: result for a night in — 3 picks with poster, year, why-it-fits, and the cards behind each */
  function pickWhyLine(pk){
    const zh = LANG === "zh";
    const names = (Array.isArray(pk.sources) ? pk.sources : []).map(function(x){ return x && x.name; }).filter(Boolean).slice(0, 2);
    const tags = (Array.isArray(pk.tags) ? pk.tags : []).slice(0, 2);
    if (!names.length) return pk.why_line || t("The catalogue returned it for your cards taken together.");
    if (zh) {
      const zhTags = tags.map(function(x){ return typeof tagZh === "function" ? tagZh(x) : x; })
        .filter(function(x){ return x != null && /[\u4e00-\u9fff]/.test(String(x)); });
      return "因为你记过" + names.map(function(n){ return "《" + n + "》"; }).join("和") + (zhTags.length ? "；口味目录把它归在 " + zhTags.join("、") + "。" : "。");
    }
    return "Because you kept " + names.join(" and ") + (tags.length ? "; the catalogue files it under " + tags.join(", ").toLowerCase() + "." : ".");
  }
  function pickHTML(pk, i){
    const zh = LANG === "zh";
    const meta = [pk.year ? String(pk.year) : "", pk.by || ""].filter(Boolean).join(" · ");
    const src = Array.isArray(pk.sources) ? pk.sources.filter(function(x){ return x && x.name; }) : [];
    const BAND = zh ? { near: "熟悉", mid: "邻近", far: "远一步" } : { near: "familiar", mid: "nearby", far: "a step out" };
    return '<article class="pick type-' + attr(pk.kind === "music" ? "music" : pk.kind === "book" ? "book" : "film") + '">' +
      '<div class="pick-poster">' + (pk.image ? '<img src="' + attr(pk.image) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'ph\');this.remove()">' : "") + '<span class="pick-n num">' + String(i + 1).padStart(2, "0") + '</span></div>' +
      '<div class="pick-body">' +
        '<p class="pick-eyebrow">' + esc(t(pk.kind || "film")) + (meta ? '<span class="r7-sep" aria-hidden="true"></span><span class="num" translate="no">' + esc(meta) + "</span>" : "") + "</p>" +
        '<h3 class="pick-name" translate="no">' + esc(pk.name || "") + "</h3>" +
        '<p class="pick-why">' + esc(pickWhyLine(pk)) + "</p>" +
        (stopRead(pk) ? '<p class="pick-desc">' + esc(stopRead(pk)) + "</p>" : "") +
        (src.length ? '<div class="pick-src">' + src.map(function(x){
          return '<button type="button" class="pick-trace" data-nav="#/cards/' + attr(x.card_id || "") + '"' + (x.card_id ? "" : " disabled") + '>' +
            (x.image ? '<img src="' + attr(x.image) + '" alt="" loading="lazy" onerror="this.remove()">' : '<i class="ph"></i>') +
            '<span><b translate="no">' + esc(x.name) + (x.n > 1 ? " <em>×" + esc(String(x.n)) + "</em>" : "") + "</b>" +
            (x.quote ? '<small translate="no">&ldquo;' + esc(x.quote) + "&rdquo;</small>" : "") + "</span>" +
            (x.band ? '<span class="pick-band">' + esc(BAND[x.band] || x.band) + "</span>" : "") + "</button>";
        }).join("") + "</div>" : "") +
        '<button class="why-btn" type="button" data-why-pick="' + i + '">' + esc(t("Why this pick?")) + "</button>" +
      "</div></article>";
  }
  function paintIn(plan){
    const picks = Array.isArray(plan.picks) ? plan.picks : [];
    const saved = !!plan.saved;
    const kinds = Array.isArray(plan.kinds) ? plan.kinds : [];
    const one = kinds.length === 1 ? kinds[0] : null;
    const em = { film: "Press play.", tv: "One more episode.", music: "Put it on.", book: "Turn the page.", podcast: "Put it on." }[one] || "Take your time.";
    const hp = String(plan.header || "").split(" · ");
    const when = hp[0] || "", moodC = hp[2] || "";
    view.innerHTML =
      '<header class="r7-plan-mast pick-mast">' +
        '<p class="r7-eyebrow"><span>' + esc(LANG === "zh" ? trZh(when) : when) + '</span><span class="r7-sep" aria-hidden="true"></span><span>' + esc(t("Stay in")) + "</span>" + (saved ? '<span class="r7-saved">Saved</span>' : "") + "</p>" +
        '<h2 class="plan-header r7-display"><span>' + esc(t("Stay in")) + (LANG === "zh" ? "，" : ".") + '</span> <em>' + esc(t(em)) + "</em></h2>" +
        '<div class="plan-chips">' + (moodC ? '<span class="plan-chip">' + esc(LANG === "zh" ? trZh(moodC) : moodC) + "</span>" : "") + '<span class="plan-chip">' + esc(picks.length + " " + (LANG === "zh" ? "个推荐" : plural(picks.length, "pick", "picks"))) + '</span><span class="plan-chip">' + esc(t(one || "mixed")) + "</span></div>" +
        '<button class="plain-cta" type="button" data-plain="1"><span>' + esc(t("Same notes, no Qloo")) + '</span><span class="plain-cta-go">' + esc(t("Compare →")) + "</span></button>" +
      "</header>" +
      (Array.isArray(plan.left_out) && plan.left_out.length ? '<p class="plan-notice" role="note">' + esc((LANG === "zh" ? "已排除（你标了“不适合我”）：" : "Left out, you said not for me: ") + plan.left_out.join(", ")) + "</p>" : "") +
      diffHTML(plan) +
      '<div class="picks">' + picks.map(pickHTML).join("") + "</div>" +
      '<p class="pick-foot">' + esc(t("Already in your cards? Left out.")) + " " + esc(t("Where to watch is not shown: the catalogue does not list it.")) + "</p>" +
      '<div class="plan-actions">' +
        '<button class="btn" type="button" data-nav="#/plan">' + esc(t("Plan something else")) + "</button>" +
        '<button class="btn btn-primary" type="button" data-action="save"' + (saved || busyAction ? " disabled" : "") + ">" + (saved ? "Saved" : "Save") + "</button>" +
      "</div>" +
      (Array.isArray(plan.log) && plan.log.length ?
        '<details class="how"><summary>How this was made</summary>' + traceHeadHTML(plan) + '<ol class="trace">' +
          (Array.isArray(plan.trace) && plan.trace.length === plan.log.length ? plan.trace : plan.log.map(function(l){ return { text: l }; })).map(function(l, i){ return '<li><span class="trace-n num">' + (i + 1) + '</span><span class="trace-t">' + esc(l.text) + '</span>' + (l.ms != null ? '<span class="trace-ms num">+' + (l.ms / 1000).toFixed(1) + 's</span>' : "") + "</li>"; }).join("") +
        "</ol>" + receiptHTML(plan.receipt) + "</details>" : "");
    if (plan && plan.id) prefetchPlain(plan.id);
  }
  function paint(plan){
    if (!isCurrent(token)) return;
    currentPlan = plan;
    if (plan && plan.mode === "in") { view.classList.add("plan-in-view"); paintIn(plan); return; }
    view.classList.remove("plan-in-view");
    const stops = Array.isArray(plan.stops) ? plan.stops : [];
    const saved = !!plan.saved;
    view.innerHTML =
      (function(){ var hp=String(plan.header||"Your plan").split(" · "); var t=hp.length>2?hp.slice(0,2):[hp[0]]; var ch=hp.length>2?hp.slice(2):[];
        var walk=stops.reduce(function(a,st){ var m=String(st&&st.distance||"").match(/(\d+)\s*min/); return a+(m?Number(m[1]):0); },0);
        var first=stops[0]&&stops[0].arrive, last=stops.length&&stops[stops.length-1].leave;
        return '<header class="r7-plan-mast">' +
          '<p class="r7-eyebrow">' + t.map(function(x, k){ return (k ? '<span class="r7-sep" aria-hidden="true"></span>' : "") + '<span>' + esc(x) + '</span>'; }).join("") + (saved ? '<span class="r7-saved">Saved</span>' : "") + '</p>' +
          '<h2 class="plan-header r7-display"><span>Go</span> <em>live it.</em></h2>' +
          (ch.length?'<div class="plan-chips">'+ch.map(function(c){return '<span class="plan-chip">'+esc(LANG === "zh" ? trZh(c) : c)+"</span>";}).join("")+"</div>":"") +
          '<dl class="r7-stats">' +
            '<div><dt>' + esc(plural(stops.length, "stop", "stops")) + '</dt><dd class="num">' + stops.length + '</dd></div>' +
            '<div><dt>window</dt><dd class="num r7-small">' + esc(first && last ? String(first).replace(/ ?[AP]M$/,"") + "\u2013" + last : "\u2014") + '</dd></div>' +
            '<div><dt>walking</dt><dd class="num">' + (walk ? walk + '<small>' + (LANG === "zh" ? "分钟" : "min") + '</small>' : "\u2014") + '</dd></div>' +
          '</dl>' + '<button class="plain-cta" type="button" data-plain="1"><span>Same notes, no Qloo</span><span class="plain-cta-go">Compare &rarr;</span></button>' + '</header>'; })() +
      (Array.isArray(plan.left_out) && plan.left_out.length ? '<p class="plan-notice" role="note">' + esc((LANG === "zh" ? "已排除（你标了“不适合我”）：" : "Left out, you said not for me: ") + plan.left_out.join(", ")) + "</p>" : "") +
      diffHTML(plan) +
      (plan.notice ? '<p class="plan-notice" role="note">' + esc(plan.notice) + "</p>" : "") +
      routeMapHTML(stops) + sideHTML(stops, plan) +
      stops.map(function(st, i){ return stopHTML(st, i, stops); }).join("") +
      '<div class="plan-actions">' +
        '<button class="btn" type="button" data-action="shorten"' + (stops.length <= 1 || busyAction ? " disabled" : "") + ">Shorten</button>" +
        '<button class="btn" type="button" data-action="budget"' + (busyAction ? " disabled" : "") + ">Lower budget</button>" +
        '<button class="btn" type="button" data-plain="1">' + esc(t("Plain LLM")) + "</button>" +
        '<button class="btn btn-primary" type="button" data-action="save"' + (saved || busyAction ? " disabled" : "") + ">" + (saved ? "Saved" : "Save") + "</button>" +
      "</div>" +
      (Array.isArray(plan.log) && plan.log.length ?
        '<details class="how"><summary>How this was made</summary>' + traceHeadHTML(plan) + '<ol class="trace">' +
          (Array.isArray(plan.trace) && plan.trace.length === plan.log.length ? plan.trace : plan.log.map(function(l){ return { text: l }; })).map(function(l, i){ return '<li><span class="trace-n num">' + (i + 1) + '</span><span class="trace-t">' + esc(l.text) + '</span>' + (l.ms != null ? '<span class="trace-ms num">+' + (l.ms / 1000).toFixed(1) + 's</span>' : "") + "</li>"; }).join("") +
        "</ol>" + receiptHTML(plan.receipt) + "</details>" : "");
    if (plan && plan.id) prefetchPlain(plan.id);
  }
  function traceHeadHTML(plan){
    const q = plan.receipt && Array.isArray(plan.receipt.queries) ? plan.receipt.queries.length : 0;
    const last = plan.trace && plan.trace.length ? plan.trace[plan.trace.length - 1].ms : null;
    const bits = [plan.log.length + " steps", q ? q + " Qloo calls" : "", last != null ? (last / 1000).toFixed(0) + " s" : ""].filter(Boolean);
    return '<p class="trace-head num">' + esc(bits.join(" · ")) + "</p>";
  }
  function receiptHTML(r){
    if (!r) return "";
    const seeds = Array.isArray(r.seeds) ? r.seeds : [];
    const qs = Array.isArray(r.queries) ? r.queries : [];
    const zh = LANG === "zh";
    const SENT_ZH = {
      "Card IDs only. No note text, no location.": "只发卡片 ID，不发笔记原文，也不发位置。",
      "Card IDs and your area. No note text.": "只发卡片 ID 和你的区域，不发笔记原文。"
    };
    const PROV_ZH = { "cached": "缓存", "live": "实时", "live + cached": "实时 + 缓存" };
    const sent = String(r.sent_to_qloo || "");
    const sentOut = zh ? (SENT_ZH[sent] || t(sent)) : sent;
    let prov = "";
    if (r.provenance) {
      const live = r.provenance.live | 0, cached = r.provenance.cached | 0;
      const label = String(r.provenance.label || "");
      prov = zh
        ? " · " + esc(PROV_ZH[label] || t(label)) + "（实时 " + live + " 次，缓存 " + cached + " 次）"
        : " · " + esc(label) + " (" + live + " live, " + cached + " cached)";
    }
    return '<div class="receipt"><p class="receipt-title">' + (zh ? "回执" : "Receipt") + '</p>' +
      '<p class="receipt-line"><span>' + (LANG === "zh" ? "发给 Qloo 的种子" : "Seeds sent to Qloo") + '</span> ' + seeds.map(function(x){ return esc(x.name) + ' <code>' + esc(String(x.qloo_id || "").slice(0, 8)) + '</code>'; }).join(", ") + "</p>" +
      qs.map(function(q){ return '<p class="receipt-line"><code>GET ' + esc(q.endpoint) + "</code>" + (q["filter.location.query"] ? (LANG === "zh" ? " 类型 place · 标签 " : " type place · tag ") + esc(q["filter.tags"] || (LANG === "zh" ? "无" : "none")) + (LANG === "zh" ? " · 位置 " : " · near ") + esc(q["filter.location.query"] || "") : " " + esc(String(q["filter.type"] || "").split(":").pop())) + " · " + esc(String(q.returned)) + (LANG === "zh" ? " 个返回" : " back") + "</p>"; }).join("") +
      '<p class="receipt-line muted">' + esc(sentOut) + prov + "</p></div>";
  }
  function setActionBusy(b){
    Array.prototype.forEach.call(view.querySelectorAll("[data-action], [data-swap]"), function(el){
      el.disabled = b ||
        (el.getAttribute("data-action") === "shorten" && currentPlan && Array.isArray(currentPlan.stops) && currentPlan.stops.length <= 1) ||
        (el.getAttribute("data-action") === "save" && currentPlan && currentPlan.saved);
    });
  }
  async function runPlanAction(action, extraBody){
    if (busyAction) return;
    busyAction = true;
    setActionBusy(true);
    try {
      const data = await api("/api/plan/" + encodeURIComponent(planId) + "/" + action, { method: "POST", body: extraBody || {}, signal: ac.signal });
      let fresh = data && data.plan;
      if (action === "save" && !fresh && currentPlan) {
        fresh = currentPlan;
        fresh.saved = true;
      }
      if (fresh && fresh.id) {
        if (action === "save") fresh.saved = true;
        cachePlan(fresh);
        paint(fresh);
      }
      if (action === "save") {
        const stops = currentPlan && Array.isArray(currentPlan.stops) ? currentPlan.stops : [];
        if (stops.length && stops[0] && stops[0].name) {
          writeDidYouGo({ plan_id: fresh && fresh.id ? fresh.id : planId, place: String(stops[0].name) });
        }
      }
      if (data && data.notice) toast(data.notice);
      else if (action === "save") toast("Plan saved.");
      else if (action === "swap") {
        const idx = (extraBody && extraBody.index) || 0;
        toast("Swapped stop " + (idx + 1) + ".");
        const el = view.querySelectorAll(".stop")[idx];
        if (el) { el.classList.add("just-swapped"); setTimeout(function(){ el.classList.remove("just-swapped"); }, 1600); }
      } else if (action === "shorten") toast("Shortened.");
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      toast((e && e.message) || t("That did not work. Try again."));
    } finally {
      busyAction = false;
      if (isCurrent(token)) setActionBusy(false);
    }
  }
  function openBudgetSheet(){
    const current = numberValue(state.user && state.user.budget) || 40;
    const sheet = openSheet({
      title: "Lower the budget",
      body:
        '<form data-budget-form>' +
          '<div class="sheet-field"><label for="budgetCap">New budget cap</label>' +
          '<input id="budgetCap" type="number" inputmode="numeric" min="1" step="1" value="' + attr(current) + '" data-autofocus></div>' +
          '<p class="inline-error" data-budget-error role="alert" hidden></p>' +
          '<div class="sheet-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Re-rank stops</button></div>' +
        "</form>",
    });
    const formEl = sheet.querySelector("[data-budget-form]");
    const input = sheet.querySelector("#budgetCap");
    const err = sheet.querySelector("[data-budget-error]");
    formEl.addEventListener("submit", async function(e){
      e.preventDefault();
      const n = numberValue(input.value);
      if (!n || n < 1) {
        err.textContent = "A number above zero is all it needs.";
        err.hidden = false;
        if (input) input.focus();
        return;
      }
      err.hidden = true;
      const submitBtn = formEl.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const data = await api("/api/plan/" + encodeURIComponent(planId) + "/budget", { method: "POST", body: { budget: n } });
        closeModal();
        const fresh = data && data.plan;
        if (fresh && fresh.id) { cachePlan(fresh); paint(fresh); }
        if (data && data.notice) toast(data.notice);
      } catch (e2) {
        err.textContent = (e2 && e2.message) || t("That did not work. Try again.");
        err.hidden = false;
        submitBtn.disabled = false;
      }
    });
  }

  on(view, "click", function(e){
    if (e.target.closest("[data-plain]")) { openPlain(); return; }
    const wsBtn = e.target.closest("[data-why-stop]");
    if (wsBtn) { openWhyStop(Number(wsBtn.getAttribute("data-why-stop")) || 0); return; }
    const wpBtn = e.target.closest("[data-why-pick]");
    if (wpBtn) { openWhyStop(Number(wpBtn.getAttribute("data-why-pick")) || 0, true); return; }
    const swapBtn = e.target.closest("[data-swap]");
    if (swapBtn) {
      runPlanAction("swap", { index: Number(swapBtn.getAttribute("data-swap")) || 0 });
      return;
    }
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");
    if (action === "shorten") runPlanAction("shorten");
    else if (action === "save") runPlanAction("save");
    else if (action === "budget") openBudgetSheet();
  });
}

