/* ---------------------------------------------------------------------------
   Cards
   --------------------------------------------------------------------------- */
function renderCards(){
  const token = beginView();
  setShell({ title: "Cards", tabs: true, active: "cards" });
  const ac = abortable();

  const FILTERS = [
    ["all", "All"],
    ["film", "Film & TV"],
    ["music", "Music"],
    ["book", "Books"],
    ["place", "Places"],
    ["person", "People"],
    ["other", "More"],
  ];

  view.innerHTML =
    '<div class="cards-head">' +
      '<div class="segmented" role="group" aria-label="Cards view">' +
        '<button class="seg-btn" type="button" aria-pressed="true">Wall</button>' +
        '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/threads">Threads</button>' +
        '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/letter">Letter</button>' +
      "</div>" +
    "</div>" +
    '<header class="r7-mast" data-wall-mast hidden></header>' +
    '<div class="filters"><div class="chips-scroll" data-type-chips>' +
      FILTERS.map(function(pair, index){
        return '<button class="chip" type="button" data-cards-type="' + attr(pair[0]) + '" aria-pressed="' + (index === 0 ? "true" : "false") + '"><span>' + esc(pair[1]) + '</span><span class="chip-n num" data-chip-n></span></button>';
      }).join("") +
    "</div></div>" +
    '<div data-wall>' + cardSkeletonHTML() + "</div>";

  const wallEl = view.querySelector("[data-wall]");
  let filter = "all";
  let cards = [];
  let allCards = [];
  let loadSeq = 0;

  function paintChips(){
    Array.prototype.forEach.call(view.querySelectorAll("[data-cards-type]"), function(button){
      button.setAttribute("aria-pressed", button.getAttribute("data-cards-type") === filter ? "true" : "false");
    });
  }
  function hideBrokenImages(container){
    Array.prototype.forEach.call(container.querySelectorAll("img"), function(img){
      function hide(){ img.hidden = true; }
      img.addEventListener("error", hide);
      if (img.complete && img.naturalWidth === 0) hide();
    });
  }
  function emptyHTML(){
    if (filter !== "all") {
      return emptyBlock("", "No cards under this filter yet.", '<button class="btn btn-sm" type="button" data-show-all-cards>Show all cards</button>');
    }
    return emptyBlock(
      "No cards yet.",
      "Cards appear when your notes mention something Sparkling can recognise. Your notes are all still here.",
      '<button class="btn btn-sm" type="button" data-nav="#/notes">Write a note</button>'
    );
  }
  function tileHTML(card){
    const size = sizeOf(card.size);
    const type = typeOf(card.type);
    const name = String(card.name || "Untitled");
    const image = imgSrc(card.image);
    const heart = Number(card.heart) || 0;
    const count = Number(card.footprints) || 0;
    const face = image
      ? '<span class="card-face image-face">' +
          '<span class="cover-fallback"><span class="face-title">' + esc(name) + "</span></span>" +
          '<img src="' + attr(image) + '" alt="" loading="lazy">' +
        "</span>"
      : '<span class="card-face typographic-face"><span class="face-title">' + esc(name) + "</span></span>";
    const marker = heart === 1
      ? '<span class="card-heart" aria-hidden="true">' + icons.heart + "</span>"
      : heart === -1
        ? '<span class="notme">Not for me</span>'
        : "";
    const label = [name, cardContext(card)];
    if (count) label.push(count + " " + plural(count, "footprint", "footprints"));
    if (heart === 1) label.push("Loved");
    if (heart === -1) label.push("Not for me");
    return '<button class="card-tile size-' + size + " " + typeClass(type) + (heart === -1 ? " is-out" : "") + '" type="button" data-nav="#/cards/' + encodeURIComponent(card.id) + '" aria-label="' + attr(label.filter(Boolean).join(". ")) + '">' +
      '<span class="type-bar"></span>' +
      face +
      '<span class="card-body">' +
        (image ? '<span class="card-name">' + esc(name) + "</span>" : "") +
        '<span class="card-context">' + esc(cardContext(card)) + "</span>" +
        '<span class="card-meta">' + footprintsDots(count) + '<span class="spacer"></span>' + marker + "</span>" +
      "</span>" +
    "</button>";
  }
  function featureHTML(card){
    const type = typeOf(card.type);
    const name = String(card.name || "Untitled");
    const image = imgSrc(card.image);
    const count = Number(card.footprints) || 0;
    const seen = card.last_at ? lastSeen(card.last_at) : "";
    return '<button class="card-tile r7-feature ' + typeClass(type) + (Number(card.heart) === -1 ? " is-out" : "") + '" type="button" data-nav="#/cards/' + encodeURIComponent(card.id) + '" aria-label="' + attr([name, cardContext(card), count ? count + " " + plural(count, "footprint", "footprints") : ""].filter(Boolean).join(". ")) + '">' +
      '<span class="r7-feature-face">' + (image
        ? '<span class="cover-fallback"><span class="face-title">' + esc(name) + '</span></span><img src="' + attr(image) + '" alt="" loading="lazy">'
        : '<span class="r7-feature-type"><span class="face-title">' + esc(name) + '</span></span>') + '</span>' +
      '<span class="r7-feature-body">' +
        '<span class="r7-kicker"><span>Most on your mind</span></span>' +
        '<span class="r7-feature-name">' + esc(name) + '</span>' +
        '<span class="card-context">' + esc(cardContext(card)) + '</span>' +
        '<span class="r7-feature-foot">' +
          (count ? '<span class="r7-big num">' + count + '<small>\u00d7</small></span><span class="r7-big-label">' + esc(count === 1 ? "mentioned once" : "mentioned") + '</span>' : "") +
          (seen ? '<span class="r7-seen">' + esc(seen) + '</span>' : "") +
        '</span>' +
      '</span>' +
    '</button>';
  }
  function wallHTML(list){
    if (list.length === 1) {
      return '<div class="wall single"><div class="wall-col">' + tileHTML(list[0]) + "</div></div>" +
        '<p class="single-hint">' + esc(filter === "all"
          ? "Mention it again sometime and it will remember."
          : "The only card under this filter so far.") + "</p>";
    }
    let head = "";
    let rest = list;
    if (list.length >= 3) { head = featureHTML(list[0]); rest = list.slice(1); }
    const columns = [[], []];
    const weight = [0, 0];
    rest.forEach(function(card){
      const size = sizeOf(card.size);
      const w = size === 3 ? 2.6 : size === 2 ? 1.8 : 1;
      const index = weight[0] <= weight[1] ? 0 : 1;
      columns[index].push(card);
      weight[index] += w;
    });
    return head + '<div class="wall">' + columns.map(function(col){
      return '<div class="wall-col">' + col.map(tileHTML).join("") + "</div>";
    }).join("") + "</div>";
  }
  function inFilter(card, f){
    if (f === "all") return true;
    const tp = typeOf(card.type);
    return f === "film" ? (tp === "film" || tp === "tv") : tp === f;
  }
  function paintMast(){
    const mast = view.querySelector("[data-wall-mast]");
    if (!mast) return;
    if (!allCards.length) { mast.hidden = true; return; }
    const mentions = allCards.reduce(function(a, c){ return a + (Number(c.footprints) || 0); }, 0);
    const loved = allCards.filter(function(c){ return Number(c.heart) === 1; }).length;
    const kinds = Object.keys(allCards.reduce(function(a, c){ a[c.type || c.kind || '?'] = 1; return a; }, {})).length;
    const latest = allCards.reduce(function(a, c){ return Math.max(a, Number(c.last_at) || 0); }, 0);
    mast.hidden = false;
    mast.innerHTML =
      '<p class="r7-eyebrow"><span>The wall</span>' + (latest ? '<span class="r7-sep" aria-hidden="true"></span><span>' + esc(monthYear(latest)) + '</span>' : "") + '</p>' +
      '<h1 class="r7-display"><span>Everything</span> <em>you kept.</em></h1>' +
      '<dl class="r7-stats">' +
        '<div><dt>cards</dt><dd class="num">' + allCards.length + '</dd></div>' +
        '<div><dt>mentions</dt><dd class="num">' + mentions + '</dd></div>' +
        (loved ? '<div><dt>loved</dt><dd class="num">' + loved + '</dd></div>' : '<div><dt>' + t('kinds') + '</dt><dd class="num">' + kinds + '</dd></div>') +
      '</dl>';
    Array.prototype.forEach.call(view.querySelectorAll("[data-cards-type]"), function(button){
      const f = button.getAttribute("data-cards-type");
      const n = allCards.filter(function(c){ return inFilter(c, f); }).length;
      const el = button.querySelector("[data-chip-n]");
      if (el) el.textContent = n ? String(n) : "";
      button.hidden = f !== "all" && n === 0 && f !== filter;
    });
  }
  function paintWall(){
    if (!wallEl) return;
    wallEl.removeAttribute("aria-busy");
    cards = allCards.filter(function(c){ return inFilter(c, filter); });
    paintMast();
    if (!cards.length) {
      wallEl.innerHTML = emptyHTML();
      return;
    }
    wallEl.innerHTML = wallHTML(cards);
    hideBrokenImages(wallEl);
  }
  async function load(){
    const seq = ++loadSeq;
    if (allCards.length) { paintWall(); return; }
    if (wallEl) {
      wallEl.setAttribute("aria-busy", "true");
      wallEl.innerHTML = cardSkeletonHTML();
    }
    try {
      const data = await api("/api/cards?type=all", { signal: ac.signal });
      if (!isCurrent(token) || seq !== loadSeq) return;
      allCards = Array.isArray(data && data.cards) ? data.cards : [];
      allCards.forEach(function(c){ if (c && c.name) (window.SP_NAMES = window.SP_NAMES || {})[c.name] = 1; });
      paintWall();
    } catch (e) {
      if (!isCurrent(token) || seq !== loadSeq || isAbort(e)) return;
      if (!wallEl) return;
      wallEl.removeAttribute("aria-busy");
      wallEl.innerHTML = errorBlock("Your cards did not load. Check your connection, then try again.", "cards");
    }
  }

  on(view, "click", function(e){
    const chip = e.target.closest("[data-cards-type]");
    if (chip) {
      const next = chip.getAttribute("data-cards-type") || "all";
      if (next === filter) return;
      filter = next;
      paintChips();
      load();
      return;
    }
    if (e.target.closest("[data-show-all-cards]")) {
      if (filter !== "all") {
        filter = "all";
        paintChips();
        load();
      }
    }
  });
  bindRetries({ cards: function(){ allCards = []; load(); } });
  load();
}

