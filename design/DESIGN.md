# Sparkling design brief (v1, mobile-first)

Source of truth for product behaviour: whitepaper v0.2 (Chapters 7-10), condensed here.
Stitch could not be used (background runs cannot sign in), so this sheet was dealt with
taste-skill (`draw.mjs --app --kind workspace --style editorial-greeting`) and adapted.

## Face (the one idea)
A paper notebook. The Notes screen opens with a typeset serif greeting built from data
("Thursday. Two things came back to you this week."), never "Welcome back". The surface
is a warm paper tint (#f7f6f2) with white sheets; ink text; one deep teal accent.

## Tokens
```css
:root{
  --ground:#f7f6f2; --sheet:#ffffff; --surface:#f1efe9; --border:#e6e3db; --rule:#efede7;
  --text:#1f201d; --muted:#6b6a65; --faint:#a3a19a; --accent:#1b6e66; --accent-ink:#ffffff;
  --negative:#b42318; --dot:#d93f2b; /* the red dot only */
  --film:#3b5bdb; --music:#7048e8; --book:#2f9e44; --place:#e8590c; --other:#868e96;
  --radius-card:22px; --radius-control:999px; --gap:16px; --pad:20px; --control-h:38px;
  --serif:"Instrument Serif",Georgia,serif; --sans:"Instrument Sans",Inter,system-ui,sans-serif;
}
```
Type: serif only for greeting, card titles and big typographic card faces. Everything else
sans 14/400, labels 12/500, section 14/600. Sentence case, no tracked capitals, no emoji,
no exclamation marks. Figures tabular-nums, weight 400. No shadows at rest; one shadow only on the
floating post box when focused. Accent under 2% of pixels.

## Shell (phone, 390x844)
- Top bar 48px on --ground: avatar circle (left, opens Settings), screen title (serif 22), inbox
  icon (right) with a 7px red dot + count when items wait.
- Bottom tab bar: Notes · Cards · Plan (three only), text labels with thin line icons.
- Sample mode: a thin ribbon under the top bar on every screen: "Sample notebook · made-up data".

## Screens (all must exist)
1. Onboarding — wordmark "Sparkling" with three shimmering dots (once), headline
   "Keep the things that stay with you.", sub, three stacked choices (Add your first note /
   Try a sample notebook / Bring some history), footer "Your notes stay yours. Export or delete anytime."
2. Notes — greeting, post box (placeholder rotates: What stayed with you today? · Something you
   watched, heard, read or found? · Paste a link or drop a screenshot.), camera + link buttons, Save.
   Optional "Did you go to X?" quiet row. Filter chips All · With cards · Photos · Plain notes. Timeline grouped
   by day (Today, Tuesday, 12 Oct), each note: user's text verbatim with recognised mentions underlined
   soft blue (tap -> card), time, "1 card" / "plain note". Pending recognition: dotted underline.
   Search icon. Empty state copy from whitepaper.
3. Camera sheet — upload/take photo, caption "Add a few words, or just save", Save; thumbnail shows
   "reading the text..." scan line, then card-colour corner tab.
4. Cards — Wall | Threads toggle; chips All · Film & TV · Music · Books · Places · More. Masonry, 2 columns,
   three sizes (S/M/L by attention). Card: 4px type colour bar, typographic face (title in serif, large) or
   cover image, one context line, footprint dots (max 7 then a number), heart if loved, muted if "not for me".
5. Card detail — header (title serif 36, type · year/creator, heart / not-for-me), summary line
   "First met Mar 2025 · 5 times since · last Wed", film strip of user photos, footprint timeline (date, kind
   label, original quote), "Your view changed" block (two quotes side by side, no commentary),
   "From Qloo" tag chips labelled as Qloo catalogue data, footer: Use in a plan · More (Merge, Remove card).
6. Inbox "Take a look" — one item at a time: the original sentence with mention highlighted, "Did you mean",
   best guess + up to two alternatives, Yes, that / Not a thing, Keep all guesses, Undo toast 10s.
   Empty: "Nothing to look at. Sparkling was sure about everything lately." Done: "That's everything."
7. Threads — per thread: "From Qloo" tag name, chips of cards with counts "From your notes", optional
   lighter line "Sparkling's read". Too few: "Threads show up once a few things keep coming back."
8. Plan request — sentence form: [Saturday afternoon] · around [Greenpoint] · under [$40]; mood
   Familiar / A little different / Surprise me; free-text line; button "Make a plan".
   Generating: streamed plain-language activity log ("Using 4 cards as seeds", "Asked Qloo for bookshops
   near Greenpoint", "Left out 3 you already know"), "About 30 seconds".
9. Plan result — 2 stops (max 3): number, name, neighbourhood/distance, three labelled lines
   (From your notes / From Qloo / Sparkling's read), operational line "Hours not checked · Open map · Swap".
   Actions: Shorten · Lower budget · Save. "How this was made" collapsible log. Saved plans list.
10. Settings — Planning area, Default budget and time, Bring some history, What Sparkling sends to Qloo,
    Export everything, Delete everything (type DELETE), Sample notebook (open/reset/remove).

## Motion
Note lifts into timeline 180ms; underline draws left->right; "+1" fades beside mention; card grows 240ms
ease. Respect prefers-reduced-motion. No confetti, no streaks, no badges.

## Evidence labels (always distinct)
- From your notes: ink on --surface pill
- From Qloo: teal outline pill
- Sparkling's read: italic, --muted, lighter
