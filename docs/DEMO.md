# Sparkling demo script (about 3 minutes)

Persona: Juno Park, a fictional New York account with 18 notes.

1. **Notebook (0:00-0:30).** Open the sample notebook. Say: "Juno just writes, like a tweet. She never fills a form." Show an 18-note feed with entity chips growing under each note.
2. **Cards (0:30-1:10).** Open the wall. One card per entity, sized by how often Juno returns to it. Open one card and show its footprints: rewatches, notes, dates.
3. **Inbox (1:10-1:30).** The red dot: "Solaris" is ambiguous (1972 or 2002). Sparkling asks once and never guesses.
4. **Threads (1:30-2:10).** Threads are built from shared Qloo tags. Tap "Why this thread?" to see the exact tags and Juno's own words. Toggle Then/Now to show how her taste moved.
5. **Go live it (2:10-2:50).** Plan a Saturday in Brooklyn. Qloo returns real places with labelled reasons. If an area has no match, the app says so and widens the search (shown in the notice). Hours come from Qloo and are marked "not live-checked".
6. **Contrast (2:50-3:00).** Same prompt to a plain LLM: invented venues and generic taste. Sparkling uses only Qloo entity IDs.

Fallback if the model quota is out: the sample notebook is cached (llm_cache), so the demo still runs.
