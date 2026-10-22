# Sparkling HTTP API (Worker). All JSON. Auth: cookie `sp` (session token) set by /api/session.

POST /api/session {mode:"new"|"sample"} -> {user:{id,handle,area,budget,sample:bool}}  (anonymous device account; sample = Juno's notebook copy)
GET  /api/me -> {user, inbox_count}
PATCH /api/me {area?, budget?, when?} -> {user}

GET  /api/notes?filter=all|cards|photos|plain&q=text -> {notes:[Note]}
POST /api/notes {text, link?} -> {note}         (saved immediately, recognition runs async; poll GET /api/notes/:id)
POST /api/notes/photo  multipart(file, caption) -> {note}
GET  /api/notes/:id -> {note}
PATCH /api/notes/:id {text} ; DELETE /api/notes/:id
Note = {id, text, kind:"text"|"photo"|"link", image_url?, ocr_text?, created_at(ms), status:"pending"|"done"|"failed",
        mentions:[{start,end,surface,card_id?,state:"matched"|"inbox"|"plain", plus_one?:bool}], card_count}

GET  /api/cards?type=all|film|music|book|place|other -> {cards:[Card]}
Card = {id, qloo_id, name, type:"film"|"tv"|"music"|"book"|"place"|"other", year?, by?, image?, size:1|2|3,
        footprints:n, heart:1|0|-1, last_at, first_at, tags:[name]}
GET  /api/cards/:id -> {card, footprints:[{id,note_id,kind,sentiment,quote,created_at,source:"note"|"imported"|"seed"}],
        view_changed?:{a:Footprint,b:Footprint}, qloo_tags:[name], photos:[url]}
PATCH /api/cards/:id {heart} ; DELETE /api/cards/:id (notes kept)
DELETE /api/footprints/:id  ("Not about this")

GET  /api/inbox -> {items:[{id, note_id, sentence, mention, guesses:[{qloo_id,name,type,year,by}]}]}
POST /api/inbox/:id {action:"accept", qloo_id} | {action:"reject"} | {action:"undo"}
POST /api/inbox/accept_all

GET  /api/threads -> {threads:[{tag, cards:[{id,name,type,footprints}], read?}], reason?}

POST /api/plan {when, area, budget, mood:"familiar"|"different"|"surprise", text?}
     -> NDJSON stream lines: {type:"log", text} ... then {type:"plan", plan:Plan} or {type:"error", state, text}
Plan = {id, header, stops:[{qloo_id,name,neighborhood,address,distance?,from_notes,from_qloo,read,ops:"Hours not checked",map_url}], log:[text]}
POST /api/plan/:id/swap {index} -> {plan} ; POST /api/plan/:id/shorten ; POST /api/plan/:id/budget {budget}
POST /api/plan/:id/save -> {plan} ; GET /api/plans -> {plans}
POST /api/plan/:id/went {went:true|false, text?}

GET  /api/export -> file ; POST /api/delete {confirm:"DELETE"}
POST /api/import/letterboxd multipart(file) -> {read, cards, inbox, notes}
