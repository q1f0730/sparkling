# Desktop layout benchmarks (for Sparkling >=1024px)

What we have: a 520px phone column centred on the page plus a fixed left rail. The phone top bar (avatar, title, inbox)
still renders inside the column, the right ~35% of a 1440 screen is empty, and on Plan the right pane repeats the stop list.
Question for each benchmark: what does a mature desktop app put in the sidebar, how does it split list and detail, how wide
does it let text run, and how does it show a route.

| App | Source | Pattern we take |
|---|---|---|
| Bear (Mac) | https://getia-md.github.io/bear.html ; https://bear.app/faq/about-the-sidebar-in-bear/ ; https://bear.app/faq/mac-keyboard-shortcuts | Three panes: sidebar (built-in collections + tags) -> note list -> editor; each pane collapses (^1/^2/^3). Sidebar holds *every* place you can go, including system lists (Untagged, Todo, Archive, Trash). Take: one sidebar that lists all destinations, not 3 tabs. |
| Things 3 (Mac) | https://getia-md.github.io/things.html ; https://culturedcode.com/things/support/articles/4001304/ | Sidebar order is "capture first": Inbox (with count) on top, then time-based lists, Logbook/Trash below, Settings out of the way. Counts sit right-aligned in the row. Take: Inbox row with a count badge in the sidebar, Settings pinned to the sidebar foot. |
| Readwise Reader (web) | https://docs.readwise.io/reader/docs/faqs/appearance ; https://github.com/huangyingting/readwise.io (feature map of the 3-pane shell) | Left navigation, centre list/reader canvas, right context panel (Info / Notebook / Chat) that can be hidden with `]`. The right panel describes the *focused* document. Take: a right inspector that follows the selection (selected note -> its cards; selected card -> its detail). |
| Linear | https://linear.app/docs/peek ; https://linear.app/changelog/2021-12-02-workspace-templates (Split Inbox) ; https://linear.app/changelog/2021-06-03-issue-view-layout | Peek: preview the focused item without leaving the list. Split Inbox: list on the left, focused item on the right "so you can review without moving back and forth". Issue page: content column is centred and capped for readability; the details pane grows with the window instead of the text. Take: card detail opens in the inspector instead of a page navigation; long-form pages cap the text column and give spare width to a side pane. |
| Airbnb / hotel search (Baymard) | https://baymard.com/research-articles/accommodations-split-view ; https://completefrontend.com/system-design/problems/airbnb | Split view: list ~60% / sticky map ~40% at 1440; 95% of test users engaged the map when it was shown by default next to the list. Take: Plan result = stop timeline beside a big sticky map, never a thumbnail map plus a second list. |
| Itinerary planners (Plotline etc.) | https://screensdesign.com/articles/travel-itinerary-app-design-examples | "The list explains order, the map exposes distance and clustering." Take: numbered stops in the timeline match numbered pins on the map; hovering a stop highlights its pin; walk legs live on the timeline, not duplicated beside the map. |
| Line length research | https://baymard.com/research-articles/line-length-readability ; https://fonts.google.com/knowledge/using_type/understanding_measure_line_length | 50-75 characters per line for body text (Bringhurst 45-75). Take: note text, card detail prose, inbox and settings cap at ~640-680px (~65ch Figtree 15-16px); CJK reads well narrower, same cap is fine. |
| Letterboxd web (product knowledge, not fetched) | https://letterboxd.com | Film detail page: poster in a narrow left column, title + meta + your diary entries in the main column, stats on the right; posters in dense grids on lists. Take: Cards grid can go 3-4 columns of covers on desktop; detail puts the cover beside the text instead of stacked. |
| Notion Calendar / Arc (product knowledge, not fetched) | https://www.notion.com/product/calendar ; https://arc.net | Slim, quiet sidebar with small type, brand mark at top, account/settings at the bottom; content surface is a single raised "card" on a tinted ground. Take: the app sits on one raised paper surface, sidebar sits on the oat ground, no floating centred phone column. |

## Patterns adopted
1. **Sidebar = all destinations.** Brand mark (no tagline paragraph); New note button; Notes, Cards, Threads, Letter, Plan;
   Inbox with count; Settings + account at the foot. ~232px, collapses to a 72px icon rail at 1024-1199px.
2. **No phone top bar on desktop.** Screen title becomes the page heading inside the main pane; back buttons only where a
   page is a true drill-down (card full page, settings sub-page).
3. **List + inspector.** Main pane holds the list (feed / grid / timeline); a right inspector (~380-460px) shows the
   selected thing. Selection changes the inspector, not the page.
4. **Readable measure.** Text columns cap at ~680px; spare width goes to the inspector or the map, never to longer lines.
5. **Plan = split view.** Timeline left, big sticky map right, numbered pins = numbered stops, no duplicate list.
