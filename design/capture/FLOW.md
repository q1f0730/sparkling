# Capture: the + button, the frosted composer, the ASCII reading

Replaces the inline post box at the top of Notes ("What stayed with you today?") and the separate "Add a link" sheet.
Every old capability stays: text notes, photo notes (camera + library), links, recognition, the inbox red dot, drafts.

## States

| # | State | What the user sees | Exit |
|---|---|---|---|
| 0 | **Idle** | Round sage-ink `+` (56 px) bottom-right. Mobile: above the floating tab bar. Desktop: bottom-right of the notes column (left of the inspector). A small butter dot on it when a draft is waiting. | tap / `N` / sidebar "New note" -> 1 |
| 1 | **Open** | Frosted translucent composer springs out of the `+` (origin = the button, 340 ms spring). Mobile: bottom sheet docked to the bottom, lifted above the keyboard (visualViewport). Desktop: popover 440 px wide anchored above the `+`. Page behind stays visible, lightly veiled; textarea autofocuses. | Esc / tap outside / drag-down / close -> 0 (draft kept) |
| 1a | Typing | Textarea grows to ~8 lines. A URL anywhere in the text becomes a link chip under the text (auto-detected; no separate link sheet). Paste a lone URL -> chip. | |
| 1b | Attaching | Toolbar: Camera (mobile only, `capture=environment`), Photo (image picker, multiple), File (any file: images join as photos, .txt/.md/.csv text is read into the note, anything else gets a one-line "photos and text files for now"). Paste or drop an image also attaches. Thumbnails 56 px with a remove x. Max 4 photos, 8 MB each. | |
| 1c | Ready | Send = round icon button (arrow up). Disabled + faded until there is text, a link or a photo. Desktop hint in DM Mono: "⌘↵ to save" (Ctrl on Windows). | send -> 2 |
| 2 | **Sent (optimistic)** | Composer collapses back into the `+` (reverse spring). The new note slides in at the top of the feed (FLIP: older notes glide down, new one rises 14 px + fades in). Draft cleared. Filters/search reset to All if active. | |
| 3a | Text note: recognising | Existing "Recognising…" pill with orb shimmer; mention spans pending. When `/api/notes/:id` stops being `pending` the matched words draw their underline and entity chips grow in. Inbox badge refreshes (red dot). | |
| 3b | Photo note: **reading** | The photo appears as coloured ASCII printed on paper (darkest = heaviest glyph `#%*+=~-:,. `, ink colours from the photo). A slow highlighter pass (butter wash, 3 rows tall, 2.6 s per sweep) reads down the print; a cell is re-read now and then. Caption pill in DM Mono: "Reading the picture" with breathing dots. No progress numbers. Tied to the real request: upload -> poll the note until it is not `pending`; at least 1.2 s of reading even if the server is instant. | |
| 3c | Photo note: **develop** | The print develops from the centre outward with noisy edges (1.7 s), the photo warming from a pale sepia print. Then the recognised chips/cards fade in under it. | |
| 4 | Error: save failed | The note stays in the feed, dimmed paper, with "Didn't save" + small "Retry" and "Discard". Photo keeps its ASCII print (no develop). | Retry -> 2 |
| 5 | Offline | Same as 4 but copy "Waiting for a connection"; retries by itself on `online`. | |
| 6 | Slow (> 25 s) | Print develops anyway; the "Recognising…" pill stays; the next feed refresh fills chips. | |
| 7 | Recognition failed | Photo develops; foot reads "No card this time". | |

## Rules
- Draft survives close, route change and reload (text + link in localStorage; photos in memory for the session).
- Reduced motion: no spring (fade 120 ms), no highlighter pass (static print + caption), develop = 260 ms cross-fade.
- Reduced transparency: composer is solid card.
- Keyboard (desktop): `N` opens when focus is not in a field; `⌘/Ctrl+Enter` sends; `Esc` closes; focus returns to the `+`. Focus is trapped in the composer while open.
- a11y: `+` = "New note" (aria-expanded, aria-controls); composer = `role="dialog" aria-modal="false" aria-label="New note"`; icon buttons labelled ("Take a photo", "Add a photo", "Attach a file", "Save note", "Remove photo"); reading caption is `aria-live=polite`.
- zh-CN: every string through the dictionary; FAB label 写笔记, send 保存.
