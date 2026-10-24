/* ---------------------------------------------------------------------------
   Notes
   --------------------------------------------------------------------------- */
const END_PUNCT = /[.,!?;:)\]}，。！？；：）】》、]/;
function mentionedTextHTML(text, mentions, opts){
  const o = opts || {};
  const whole = String(text == null ? "" : text);
  const arr = Array.isArray(mentions) ? mentions : [];
  const valid = [];
  arr.forEach(function(m, index){
    if (!m || typeof m !== "object") return;
    const s = Number(m.start), e = Number(m.end);
    if (!Number.isInteger(s) || !Number.isInteger(e)) return;
    if (s < 0 || e <= s || e > whole.length) return;
    valid.push({ m: m, s: s, e: e, i: index });
  });
  valid.sort(function(a, b){ return a.s - b.s || b.e - a.e; });
  let cursor = 0;
  let out = "";
  let drawIndex = 0;
  valid.forEach(function(item){
    if (item.s < cursor) return;
    if (item.s > cursor) out += esc(whole.slice(cursor, item.s));
    let seg = whole.slice(item.s, item.e);
    // a surface echoed with trailing blanks must not push the next punctuation off the underline
    const trail = seg.match(/\s+$/);
    if (trail && END_PUNCT.test(whole.charAt(item.e))) seg = seg.slice(0, -trail[0].length);
    const m = item.m;
    const st = m.state || "plain";
    const cardId = m.card_id == null ? "" : String(m.card_id);
    if (st === "matched" && cardId) {
      const delay = drawIndex * 55;
      drawIndex += 1;
      const mt = (m.card && m.card.type) ? String(m.card.type).replace(/[^a-z]/g, "") : "";
      out += '<button type="button" class="mention matched' + (mt ? " mt-" + mt : "") + (o.draw ? " draw" : "") + '" style="--d:' + delay + 'ms" data-card="' + attr(cardId) + '"' + (m.plus_one ? "" : ' data-fresh="1"') + ((m.card && m.card.image) ? ' data-img="' + attr(String(m.card.image)) + '"' : '') + ' data-nav="' +
        attr("#/cards/" + encodeURIComponent(cardId)) + '">' + esc(seg) + "</button>";
      if (o.plus && m.plus_one) out += '<span class="plus-one" aria-hidden="true">+1</span>';
    } else if (st === "inbox") {
      out += '<span class="mention inbox" title="Waiting for a look">' + esc(seg) + "</span>";
    } else if (st === "pending") {
      out += '<span class="mention pending">' + esc(seg) + "</span>";
    } else {
      out += esc(seg);
    }
    cursor = item.e;
  });
  if (cursor < whole.length) out += esc(whole.slice(cursor));
  return out;
}
function noteHTML(note, opts){
  const o = opts || {};
  if (!note) return "";
  const id = String(note.id == null ? "" : note.id);
  const text = String(note.text == null ? "" : note.text);
  const created = Number(note.created_at);
  const image = imgSrc(note.image_url);
  const capL = window.Capture ? Capture.localFor(id) : null;
  const capFoot = capL ? Capture.footHTML(id) : "";
  const matched = (Array.isArray(note.mentions) ? note.mentions : []).filter(function(m){ return m && m.state === "matched" && m.card_id; }).length;
  const count = Number.isFinite(Number(note.card_count)) ? Number(note.card_count) : matched;
  const linkUrl = safeHttpUrl(note.link) || safeHttpUrl(extractFirstUrl(text));
  const time = formatTime(created);
  const meta = [];
  if (time) meta.push('<span class="note-time">' + esc(time) + "</span>");
  if (capFoot) meta.push(capFoot);
  else if (note.status === "pending") meta.push('<span class="fx-orb-pill note-count">' + (window.Fx ? Fx.orb(16) : "") + '<span class="fx-shine">' + esc(t("Recognizing")) + "…</span></span>");
  else meta.push('<span class="note-count">' + esc(cardCountLabel(count, note.mentions)) + "</span>");
  let body = "";
  if (text.trim()) body += '<p class="note-text" translate="no">' + mentionedTextHTML(text, note.mentions, o) + "</p>";
  const grown = (Array.isArray(note.mentions) ? note.mentions : []).filter(function(m){ return m && m.state === "matched" && m.card_id && m.card; });
  if (grown.length) {
    body += '<div class="grown' + (o.draw ? " grow-in" : "") + '">' + grown.slice(0, 3).map(function(m, k){
      const im = imgSrc(m.card.image);
      return '<button type="button" class="grown-chip ' + typeClass(m.card.type) + '" style="--k:' + k + '" data-card="' + attr(m.card_id) + '" data-nav="#/cards/' + attr(m.card_id) + '">' +
        (im ? '<img src="' + attr(im) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="grown-face">' + esc(String(m.card.name || "").slice(0, 1)) + "</span>") +
        '<span class="grown-name">' + esc(m.card.name) + "</span>" +
        '<span class="grown-meta">' + esc(typeLabel(m.card.type)) + (m.plus_one ? (m.card.n > 1 ? " · mentioned " + m.card.n + "×" : " · again") : " · new card") + "</span></button>";
    }).join("") + "</div>";
  }
  if (capL && capL.img) body += Capture.mediaHTML(id);
  else if (image) body += '<div class="note-media"><img class="note-photo" src="' + attr(image) + '" alt="Photo attached to this note" loading="lazy"></div>';
  if (linkUrl) {
    body += '<div class="note-link"><a class="link-chip" href="' + attr(linkUrl) + '" target="_blank" rel="noopener noreferrer">' +
      icons.link + '<span class="label">' + esc(linkHost(linkUrl)) + "</span></a></div>";
  }
  return '<article class="note' + (o.enter ? " note-enter" : "") + '" data-note-id="' + attr(id) + '">' +
    body +
    '<div class="note-foot">' +
      meta.join('<span class="note-dot" aria-hidden="true"></span>') +
      (id.indexOf("tmp-") === 0 ? "" : '<button class="note-menu" type="button" data-note-menu="' + attr(id) + '" aria-label="Note options" aria-haspopup="dialog">' + icons.more + "</button>") +
    "</div>" +
  "</article>";
}
function replaceNoteInDom(id, note, opts){
  const want = String(id);
  const nodes = view.querySelectorAll("[data-note-id]");
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute("data-note-id") === want) {
      nodes[i].outerHTML = noteHTML(note, opts || {});
      if (window.Capture) Capture.remount();
      return true;
    }
  }
  return false;
}
function greetingText(notesArr, cardsArr){
  const day = weekdayNameToday();
  const weekAgo = Date.now() - 7 * DAY;
  let returners = null;
  let thisWeek = null;
  if (Array.isArray(cardsArr)) {
    returners = cardsArr.filter(function(c){
      return Number(c.last_at) >= weekAgo && Number(c.footprints) > 1;
    }).length;
  }
  if (Array.isArray(notesArr)) {
    thisWeek = notesArr.filter(function(n){ return Number(n.created_at) >= weekAgo; }).length;
    if (returners === null) {
      const seen = new Set();
      notesArr.forEach(function(n){
        if (Number(n.created_at) < weekAgo) return;
        (Array.isArray(n.mentions) ? n.mentions : []).forEach(function(m){
          if (m && m.plus_one && m.state === "matched" && m.card_id) seen.add(String(m.card_id));
        });
      });
      returners = seen.size;
    }
  }
  const amount = function(n){ return n > 12 ? "Many" : countWordCap(n); };
  if (returners !== null && returners >= 2) return day + ". " + amount(returners) + " things came back to you this week.";
  if (returners === 1) return day + ". One thing came back to you this week.";
  if (thisWeek !== null && thisWeek >= 2) return day + ". " + amount(thisWeek) + " notes joined your notebook this week.";
  if (thisWeek === 1) return day + ". One note joined your notebook this week.";
  if (Array.isArray(notesArr)) {
    if (notesArr.length) return day + ". A few things are here when you want them.";
    return day + ". A quiet page, ready when you are.";
  }
  return day + ". Your notebook is here.";
}

