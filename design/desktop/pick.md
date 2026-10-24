# Desktop direction pick

Mockups: `design/desktop/dir-{a,b,c}-{notes,cards,plan,detail}.html` (generator `gen_mockups.py`), shots at 1440x900 in
`design/desktop/shots/dir-*-*.png`, one sheet per direction `dir-{a,b,c}-sheet.png`.
(Mock map labels are stretched because the mock SVG uses preserveAspectRatio=none; the real map keeps its aspect.)

## A. Studio three-pane  ← picked
Sidebar (brand, New note, Notes / Cards / Threads / Letter / Plan, Inbox with count, Settings + account at the foot) on the
oat ground; one raised paper surface holding the main list and a right inspector.

## B. Icon rail + wide canvas + slide-over peek
72px icon rail, content stretched across the whole width (2-column note masonry, 5-column card grid), card detail slides over
the grid with a scrim, Plan is a full-bleed map with a floating timeline card.

## C. Top bar + editorial two-page spread
Horizontal top nav, the screen split into two "pages": feed on the left, context on the right; Plan 50/50 timeline | map.

## Why A
1. **It answers every complaint in the brief directly.** The sidebar holds every destination (Inbox count, Threads, Letter,
   Settings were missing); the phone top bar has nowhere to live and goes away; the right third of the screen stops being
   empty because the inspector always has a job (selected note's cards, selected card, or the route map).
2. **Selection, not navigation** (Linear peek / split inbox, Readwise right panel). Clicking a card or a note keeps the list
   and your scroll position; the inspector changes. B also does this, but its scrim covers the grid you are choosing from,
   so comparing two cards takes two extra clicks.
3. **Readable measure.** A keeps note text at ~65ch (main column capped at 720px). B's two-column masonry breaks the
   chronological reading order of a notebook (Thursday appears beside Today) and its 5-up grid makes 24 covers feel like a
   stock-photo wall rather than a personal shelf. C caps measure well but its fixed 50/50 split leaves the right page with
   weak content on Notes (a repeated "this week" pair) and does not scale down to 1024.
4. **Plan as a split view** (Baymard: users engage the map when it sits beside the list by default). A gives the map the
   full inspector height next to the stop timeline, without the second stop list the current build has. B's full-bleed
   map is the most dramatic, but the schematic route has only 3 points and no street data, so a full-bleed canvas would be
   mostly empty grid; the floating panel also hides the route's left side.
5. **Degrades cleanly.** At 1024-1199 the sidebar collapses to a 76px icon rail and the inspector narrows to 340px; the
   main column still gets ~560px, the same width the phone layout was designed for. C's top bar runs out of room for 5
   tabs + inbox + settings in zh at 1024.
6. **Lowest risk to mobile.** A is additive: a sidebar and an inspector outside the existing view, plus width rules on the
   existing view. Mobile markup is untouched.

## Taken from the rejected directions
- From B: the card grid gets more columns than the phone (3 at 1280+, 2 at 1024 when the inspector is open).
- From C: the Plan map is tall and calm, labels in the map not a list beside it.
