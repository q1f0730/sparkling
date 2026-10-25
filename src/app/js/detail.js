/* ---------------------------------------------------------------------------
   Card detail
   --------------------------------------------------------------------------- */
function renderCardDetail(id){
  const token = beginView();
  setShell({ title: "Card", back: state.lastMain || "#/cards", tabs: false });
  const ac = abortable();

  let card = null;
  let footprints = [];
  let viewChanged = null;
  let qlooTags = [];
  let photos = [];
  let reactionBusy = false;
  let reactionError = "";
  let loadSeq = 0;
  let swipeStart = null;

  const KIND_LABELS = {
    note: "Note",
    rewatch: "Rewatch",
    first_watch: "First watch",
    listen: "Listen",
    read: "Read",
    visit: "Visit",
    quote: "Quote",
    screenshot: "Screenshot",
    link: "Link",
  };
  function kindLabel(kind){ return KIND_LABELS[kind] || "Note"; }
  function sourceLabel(fp){
    if (fp.source === "imported" || fp.source === "imported_pref") return { label: "Imported", title: "From your Letterboxd export" };
    if (fp.source === "seed") return { label: "Sample", title: "From the sample notebook" };
    return null;
  }
  function compactViewChanged(list){
    const pos = list.find(function(f){ return f.sentiment === "positive"; });
    const neg = list.find(function(f){ return f.sentiment === "negative"; });
    if (!pos || !neg) return null;
    if (!String(pos.quote || "").trim() || !String(neg.quote || "").trim()) return null;
    return pos.created_at > neg.created_at ? { a: neg, b: pos } : { a: pos, b: neg };
  }
  let shell = false;
  function restSkeletonHTML(){
    /* heights mirror what lands: footprint rows (count known from the list), the tag row, the actions */
    const n = Math.max(1, Math.min(4, Number(card && card.footprints) || 1));
    let h = '<div class="dsk" aria-hidden="true"><div class="dsk-h"><span class="sk-b w30"></span><span class="sk-b w8"></span></div>';
    for (let i = 0; i < n; i++) h += '<div class="dsk-fp"><span class="sk-b w24"></span><span class="sk-b w92"></span><span class="sk-b w64"></span></div>';
    h += '<div class="dsk-h dsk-gap"><span class="sk-b w40"></span></div><div class="dsk-tags"><span class="sk-b pill"></span><span class="sk-b pill w2"></span><span class="sk-b pill"></span></div></div>';
    return h;
  }
  function skeletonHTML(){
    return '<div class="skeleton sk-detail"></div>' +
      '<div class="skeleton sk-line w80" style="margin-top:18px"></div>' +
      '<div class="skeleton sk-line w60"></div>' +
      '<div class="skeleton sk-line w100" style="margin-top:22px"></div>' +
      '<div class="skeleton sk-line w80"></div>' +
      '<div class="skeleton sk-line w40"></div>';
  }
  function headerHTML(){
    if (!card) return "";
    const name = String(card.name || "Untitled");
    const image = imgSrc(card.image);
    const head = '<header class="r7-detail-head">' +
        '<h2 class="detail-title r7-detail-title">' + esc(name) + "</h2>" +
        '<p class="detail-context">' + esc(cardContext(card)) + "</p>" +
        '<button class="pk-notthis" type="button" data-not-this>' + esc(t("Not this?")) + "</button>" +
      '</header>';
    if (image) {
      return head + '<div class="detail-hero r7-hero">' +
          '<div class="detail-hero-img ' + typeClass(card.type) + '">' +
            '<div class="cover-fallback" aria-hidden="true"></div>' +
            '<img src="' + attr(image) + '" alt="" onerror="this.remove()">' +
          "</div>" +
        '<button class="r8-flipbtn" type="button" data-flip aria-label="Flip card">' + esc(t("Flip")) + '</button>' +
        '<div class="r8-back" data-back hidden aria-live="polite"></div>' +
        "</div>";
    }
    return head;
  }
  function backHTML(){
    const fps = footprints.slice().sort(function(a,b){ return a.created_at - b.created_at; });
    const first = fps[0];
    const notes = fps.filter(function(f){ return String(f.quote||"").trim(); });
    let h = '<dl class="r8-meta"><dt>' + esc(t("Type")) + '</dt><dd>' + esc(String(card.type || "").replace(/^./, function(c){return c.toUpperCase();})) + '</dd>' +
      '<dt>' + esc(t("First met")) + '</dt><dd>' + esc(first ? formatDate(first.created_at) : "—") + '</dd>' +
      '<dt>' + esc(t("Footprints")) + '</dt><dd>' + fps.length + '</dd></dl>';
    h += notes.slice(0,2).map(function(f){ return '<p class="r8-src">“' + esc(String(f.quote).slice(0,120)) + '”</p>'; }).join("");
    return h;
  }
  function reactionHTML(){
    const heart = card ? Number(card.heart) || 0 : 0;
    return '<div class="detail-controls">' +
        '<button class="heart-btn" type="button" data-react="1" aria-pressed="' + (heart === 1 ? "true" : "false") + '">' +
          icons.heart + "<span>" + (heart === 1 ? "Loved" : "Love this") + "</span>" +
        "</button>" +
        '<button class="heart-btn notme" type="button" data-react="-1" aria-pressed="' + (heart === -1 ? "true" : "false") + '">' +
          icons.close + "<span>Not for me</span>" +
        "</button>" +
      "</div>" +
      '<p class="inline-error" role="alert"' + (reactionError ? "" : " hidden") + ">" + esc(reactionError) + "</p>";
  }
  function paintReaction(){
    const block = view.querySelector("[data-reaction-block]");
    if (!block) return;
    const active = document.activeElement;
    const keep = active && active.getAttribute ? active.getAttribute("data-react") : null;
    block.innerHTML = reactionHTML();
    if (keep) {
      const next = block.querySelector('[data-react="' + keep + '"]');
      if (next) { try { next.focus(); } catch (_) {} }
    }
  }
  function summaryHTML(){
    if (!card) return "";
    const n = footprints.length || (shell ? Number(card.footprints) || 0 : 0);
    if (!n) return '<p class="summary">No footprints yet.</p>';
    const oldest = footprints[footprints.length - 1];
    const newest = footprints[0];
    const first = card.first_at || (oldest && oldest.created_at);
    const last = card.last_at || (newest && newest.created_at);
    return '<dl class="r7-stats r7-detail-stats">' +
      '<div><dt>' + esc(n === 1 ? "mention" : "mentions") + '</dt><dd class="num">' + n + '</dd></div>' +
      '<div><dt>first met</dt><dd>' + esc(first ? monthYear(first) : "\u2014") + '</dd></div>' +
      '<div><dt>last seen</dt><dd>' + esc(last ? lastSeen(last) : "\u2014") + '</dd></div>' +
    '</dl>';
  }
  function filmstripHTML(){
    if (!photos.length) return "";
    return '<div class="filmstrip">' + photos.map(function(url){
      return '<img class="strip-img" src="' + attr(url) + '" alt="Photo from your notes" loading="lazy">';
    }).join("") + "</div>";
  }
  /* the context of a mention rather than the whole note: a ~200 char window around the card's name,
     the name marked, an ellipsis on whichever side was trimmed. Always escaped. */
  function fpQuoteHTML(quote, name){
    const text = String(quote || "").trim();
    if (!text) return "";
    const limit = 200;
    const label = String(name || "");
    const at = label ? text.toLowerCase().indexOf(label.toLowerCase()) : -1;
    if (at < 0) return esc(text.slice(0, limit)) + (text.length > limit ? "…" : "");
    const end = at + label.length;
    if (text.length <= limit) {
      return esc(text.slice(0, at)) + '<mark class="fp-hit">' + esc(text.slice(at, end)) + "</mark>" + esc(text.slice(end));
    }
    let start = Math.max(0, at - Math.floor((limit - label.length) / 2));
    let stop = Math.min(text.length, start + limit);
    if (start > 0) {
      const sp = text.indexOf(" ", start);
      if (sp > -1 && sp < at) start = sp + 1;
    }
    if (stop < text.length) {
      const sp = text.lastIndexOf(" ", stop);
      if (sp > end) stop = sp;
    }
    return (start > 0 ? "…" : "") + esc(text.slice(start, at)) +
      '<mark class="fp-hit">' + esc(text.slice(at, end)) + "</mark>" +
      esc(text.slice(end, stop)) + (stop < text.length ? "…" : "");
  }
  function timelineHTML(){
    if (!footprints.length) {
      return '<p class="compact-empty">No footprints yet. Write about this again and it will gather here.</p>';
    }
    return '<h3 class="section-label r7-section"><span>Footprints</span><span class="r7-count num">' + footprints.length + '</span></h3>' +
      '<div class="fp-list" style="margin-top:0">' + footprints.map(function(fp){
        const source = sourceLabel(fp);
        const image = imgSrc(fp.image_url);
        const quote = String(fp.quote || "").trim();
        return '<div class="fp" data-fp-id="' + attr(fp.id) + '">' +
          '<div class="fp-top">' +
            '<span class="fp-date">' + esc(formatDayLabel(fp.created_at)) + "</span>" +
            '<span class="fp-kind">' + esc(kindLabel(fp.kind)) + "</span>" +
            (source ? '<span class="fp-kind" title="' + attr(source.title) + '">' + esc(source.label) + "</span>" : "") +
            '<button class="fp-detach" type="button" data-detach="' + attr(fp.id) + '" aria-label="Not about this footprint" title="Not about this footprint">×</button>' +
          "</div>" +
          (quote ? '<p class="fp-quote">' + fpQuoteHTML(quote, card && card.name) + "</p>" : "") +
          (image ? '<img class="fp-thumb" src="' + attr(image) + '" alt="Photo from this footprint" loading="lazy">' : "") +
        "</div>";
      }).join("") + "</div>";
  }
  function viewChangedHTML(){
    if (!viewChanged || !viewChanged.a || !viewChanged.b) return "";
    return '<section class="viewchanged">' +
      "<h3>Your view changed</h3>" +
      '<div class="vw-grid">' +
        '<div class="vw-quote"><blockquote>' + esc(viewChanged.a.quote || "") + '</blockquote><span class="vw-date">' + esc(formatDate(viewChanged.a.created_at)) + "</span></div>" +
        '<div class="vw-quote"><blockquote>' + esc(viewChanged.b.quote || "") + '</blockquote><span class="vw-date">' + esc(formatDate(viewChanged.b.created_at)) + "</span></div>" +
      "</div>" +
    "</section>";
  }
  function qlooHTML(){
    if (!qlooTags.length) return "";
    return '<section class="qloo-tags">' +
      '<div class="qloo-head r7-section"><h3>From the catalogue</h3><span class="catalogue">Catalogue data</span></div>' +
      tagsHTML(qlooTags) +
    "</section>";
  }
  function canPlan(){
    if (!card) return false;
    const heart = Number(card.heart) || 0;
    if (heart < 0) return false;
    if (heart === 1) return true;
    const negative = footprints.filter(function(f){ return f.sentiment === "negative"; }).length;
    return footprints.length >= 1 && negative * 2 < footprints.length;
  }
  function footerHTML(){
    return '<div class="detail-actions">' +
      '<button class="btn btn-primary" type="button" data-use-plan' + (canPlan() ? "" : " hidden") + ">Use in a plan</button>" +
      '<button class="btn" type="button" data-card-more>More</button>' +
    "</div>";
  }
  function syncPlanButton(){
    const button = view.querySelector("[data-use-plan]");
    if (button) button.hidden = !canPlan();
  }
  function hideBrokenImages(){
    Array.prototype.forEach.call(view.querySelectorAll("img"), function(img){
      function hide(){ img.hidden = true; }
      img.addEventListener("error", hide);
      if (img.complete && img.naturalWidth === 0) hide();
    });
  }
  function paint(preserve){
    if (!card) return;
    const y = preserve ? window.scrollY : 0;
    shell = false;
    view.innerHTML = '<article class="detail">' +
      headerHTML() +
      '<div class="d-sum" data-d-sum>' + summaryHTML() + "</div>" +
      '<div data-reaction-block>' + reactionHTML() + "</div>" +
      '<div class="d-rest" data-d-rest>' + restHTML() + "</div>" +
    "</article>";
    hideBrokenImages();
    Array.prototype.forEach.call(view.querySelectorAll(".fp"), function(fp){
      fp.style.touchAction = "pan-y";
    });
    if (preserve) { try { window.scrollTo(0, y); } catch (_) {} }
  }

  function restHTML(){ return filmstripHTML() + timelineHTML() + viewChangedHTML() + qlooHTML() + footerHTML(); }
  function paintShell(){
    /* everything the list already knows (title, cover, counts, reactions) paints now, so the cover lands at once;
       only footprints, tags and actions wait, as a warm skeleton of the same height */
    shell = true;
    view.innerHTML = '<article class="detail is-loading" aria-busy="true">' +
      headerHTML() +
      '<div class="d-sum" data-d-sum>' + summaryHTML() + "</div>" +
      '<div data-reaction-block>' + reactionHTML() + "</div>" +
      '<div class="d-rest" data-d-rest>' + restSkeletonHTML() + "</div>" +
    "</article>";
    hideBrokenImages();
  }
  function fillShell(){
    /* swap only what was waiting; the header and cover nodes stay, so a morph in flight keeps its target */
    const art = view.querySelector("article.detail.is-loading"), rest = art && art.querySelector("[data-d-rest]");
    if (!art || !rest) { paint(false); return; }
    shell = false;
    const sum = art.querySelector("[data-d-sum]"), nh = summaryHTML();
    if (sum && sum.innerHTML !== nh) sum.innerHTML = nh;
    paintReaction();
    rest.innerHTML = restHTML();
    art.classList.remove("is-loading"); art.removeAttribute("aria-busy");
    rest.classList.add("d-in"); setTimeout(function(){ rest.classList.remove("d-in"); }, 400);
    hideBrokenImages();
    Array.prototype.forEach.call(view.querySelectorAll(".fp"), function(fp){ fp.style.touchAction = "pan-y"; });
  }
  async function load(opts){
    const quiet = !!(opts && opts.quiet);
    const seq = ++loadSeq;
    let warm = null, painted = false;
    if (!quiet) {
      const hit = SpCards.cached(id), sumy = SpCards.summary(id);
      if (hit && hit.card) { warm = hit; }
      else if (sumy && sumy.name) { card = Object.assign({}, sumy); footprints = []; viewChanged = null; qlooTags = []; photos = []; paintShell(); painted = true; }
      else view.innerHTML = skeletonHTML();
    }
    try {
      const data = warm || await (quiet ? SpCards.load(id) : SpCards.get(id));
      if (!isCurrent(token) || seq !== loadSeq) return;
      if (!data || !data.card) throw new Error("The card did not come back.");
      if (quiet && card && JSON.stringify(data.card) === JSON.stringify(card) && (data.footprints || []).length === footprints.length && JSON.stringify(data.footprints) === JSON.stringify(footprints)) return;
      card = Object.assign({}, data.card);
      footprints = (Array.isArray(data.footprints) ? data.footprints : [])
        .slice()
        .sort(function(a, b){ return (Number(b.created_at) || 0) - (Number(a.created_at) || 0); });
      viewChanged = data.view_changed || compactViewChanged(footprints);
      qlooTags = (Array.isArray(data.qloo_tags) ? data.qloo_tags : (Array.isArray(card.tags) ? card.tags : [])).slice(0, 3);
      photos = [];
      const seenPhotos = new Set();
      (Array.isArray(data.photos) ? data.photos : []).forEach(function(url){
        const safe = imgSrc(url);
        if (safe && !seenPhotos.has(safe)) { seenPhotos.add(safe); photos.push(safe); }
      });
      reactionError = "";
      if (painted) fillShell(); else paint(!!quiet);
      if (warm && !SpCards.fresh(id)) setTimeout(function(){ if (isCurrent(token)) load({ quiet: true }); }, 500);
    } catch (e) {
      if (!isCurrent(token) || seq !== loadSeq || isAbort(e)) return;
      if (quiet) {
        toast("The card did not refresh.");
        return;
      }
      if (e && e.status === 404) {
        view.innerHTML = emptyBlock("This card is gone.", "It may have been removed. Your notes are still here.", '<button class="btn btn-sm" type="button" data-nav="#/cards">Back to your cards</button>');
      } else {
        view.innerHTML = errorBlock("This card did not load. Check your connection, then try again.", "card");
      }
    }
  }

  async function react(value){
    if (reactionBusy || !card) return;
    reactionBusy = true;
    reactionError = "";
    const current = Number(card.heart) || 0;
    const next = current === value ? 0 : value;
    card = Object.assign({}, card, { heart: next }); // optimistic: the pill answers at once
    paintReaction();
    try {
      const data = await api("/api/cards/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { heart: next },
        signal: ac.signal,
      });
      if (!isCurrent(token)) return;
      if (data && data.error) throw new Error(data.error);
      if (data && data.card) card = Object.assign({}, card, data.card);
    } catch (e) {
      if (!isCurrent(token) || isAbort(e)) return;
      card = Object.assign({}, card, { heart: current });
      reactionError = e && e.status === 404 ? "This card is no longer here." : "That did not save. Try again.";
    } finally {
      reactionBusy = false;
      if (isCurrent(token)) {
        paintReaction();
        syncPlanButton();
      }
    }
  }

  function detachFootprint(fpId){
    const fp = footprints.find(function(x){ return String(x.id) === String(fpId); });
    if (!fp) return;
    confirmSheet({
      title: "Not about this?",
      copy: "This footprint will be removed from the card. Your note stays in your notebook.",
      confirmLabel: "Remove footprint",
      busyLabel: "Removing",
      danger: true,
      onConfirm: async function(){
        await api("/api/footprints/" + encodeURIComponent(fp.id), { method: "DELETE" });
        if (!isCurrent(token)) return;
        footprints = footprints.filter(function(x){ return String(x.id) !== String(fp.id); });
        card.footprints = footprints.length;
        card.last_at = footprints.length ? footprints[0].created_at : null;
        card.first_at = footprints.length ? footprints[footprints.length - 1].created_at : null;
        viewChanged = compactViewChanged(footprints);
        photos = footprints.map(function(x){ return imgSrc(x.image_url); }).filter(Boolean);
        paint(true);
        toast("Footprint removed.");
        load({ quiet: true });
      },
    });
  }

  function removeCard(){
    confirmSheet({
      title: "Remove this card?",
      copy: "The card and its footprints will be removed. Your notes and photos stay in your notebook.",
      confirmLabel: "Remove card",
      busyLabel: "Removing",
      danger: true,
      onConfirm: async function(){
        await api("/api/cards/" + encodeURIComponent(id), { method: "DELETE" });
        setTimeout(function(){ toast("Card removed. Your notes are still here."); }, 80);
        go("#/cards");
      },
    });
  }

  function openMore(){
    const sheet = openMenu("Card", [
      { key: "remove", label: "Remove card", sub: "Your notes and photos are kept.", danger: true },
    ]);
    Array.prototype.forEach.call(sheet.querySelectorAll("[data-menu]"), function(item){
      item.addEventListener("click", function(){
        const key = item.getAttribute("data-menu");
        closeModal();
        if (key === "remove") removeCard();
      });
    });
  }

  function notThis(){
    if (!card || !window.Picker) return;
    const t0 = typeOf(card.type);
    Picker.open({ mode: "sheet", title: "Find the right one", query: String(card.name || ""), type: "all", onPick: async function(r){
      if (String(r.qloo_id).toLowerCase() === String(card.qloo_id || "").toLowerCase()) return;
      try {
        const d = await api("/api/cards/" + encodeURIComponent(id) + "/swap", { method: "POST", body: { qloo_id: r.qloo_id, type: r.type || t0 } });
        if (!d || !d.card_id) throw new Error("no card");
        toast(t("Switched."));
        if (String(d.card_id) !== String(id)) go("#/cards/" + encodeURIComponent(d.card_id)); else load({ quiet: true });
      } catch (e) { toast(t("That did not switch. Try again.")); }
    } });
  }

  function useInPlan(){
    if (!card) return;
    const name = String(card.name || "");
    putPlanPrefill(typeOf(card.type) === "place" ? "An afternoon around " + name : "An afternoon that feels like " + name);
    go("#/plan");
  }

  on(view, "click", function(e){
    const heart = e.target.closest("[data-react]");
    if (heart) {
      const value = Number(heart.getAttribute("data-react"));
      if (value === 1 || value === -1) react(value);
      return;
    }
    const detach = e.target.closest("[data-detach]");
    if (detach) { detachFootprint(detach.getAttribute("data-detach")); return; }
    if (e.target.closest("[data-use-plan]")) { useInPlan(); return; }
    const fb = e.target.closest("[data-flip]");
    if (fb) {
      const box = fb.parentNode.querySelector("[data-back]");
      if (box) { if (box.hidden) { box.innerHTML = backHTML(); box.hidden = false; fb.textContent = t("Front"); } else { box.hidden = true; fb.textContent = t("Flip"); } }
      return;
    }
    if (e.target.closest("[data-not-this]")) { notThis(); return; }
    if (e.target.closest("[data-card-more]")) { openMore(); }
  });
  on(view, "pointerdown", function(e){
    if (e.pointerType === "mouse" && e.button !== 0) { swipeStart = null; return; }
    if (e.target.closest("button,a,img")) { swipeStart = null; return; }
    const fp = e.target.closest("[data-fp-id]");
    if (!fp) { swipeStart = null; return; }
    swipeStart = { id: fp.getAttribute("data-fp-id"), x: e.clientX, y: e.clientY };
  });
  on(view, "pointerup", function(e){
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const fpId = swipeStart.id;
    swipeStart = null;
    if (dx < -64 && Math.abs(dx) > Math.abs(dy) * 1.4) detachFootprint(fpId);
  });
  on(view, "pointercancel", function(){ swipeStart = null; });

  bindRetries({ card: load });
  load();
}

