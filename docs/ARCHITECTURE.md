# Sparkling architecture

- Cloudflare Worker (src/index.js) serves the SPA (src/app.html) and a JSON/NDJSON API.
- D1 stores notes, cards, footprints and an LLM cache; KV stores photos.
- recognize.js: note text -> mentions (Workers AI, rule-based fallback) -> Qloo /search -> sure cards or inbox.
- plan.js: card seeds -> Qloo tags and /v2/insights per stop, widening area honestly; every stop carries a receipt.
- Threads: Qloo tags shared by cards; Then/Now compares recent vs earlier notes.
- Qloo data is fetched live and never stored in this repo.
