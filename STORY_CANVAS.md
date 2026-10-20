# Story canvas

Design rules for the canvas beside each Story step. Every canvas is the same size: a soft grey sheet with nothing boxed inside it, filled without cutting anything important off. Mockup: https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4

## How a story and map get made

The first mockup was curated by hand: I extracted the transcripts, picked the decisions and quotes, captured and cropped the pictures, and cut out their backgrounds. Each step of that work is listed here with the code that now does it, so any future session gets the same result without a person in the loop.

| Step | What happens | Where | Status |
| --- | --- | --- | --- |
| 1. Read the conversation | Collect user and assistant turns. Drop tool and system chatter: notifications, reminders, interruptions, context summaries, command output, environment preambles. Strip app wrappers (Codex in-app browser state, open pages, attached-file headers) and keep the request inside; the human's answers to the assistant's questions become "question → answer" | `desktop/collector.mjs`; `isSessionNoise` and `prepareSessionBatch` in `lib/story.mjs` | Built |
| 2. Keep what the human pasted | Images in user turns (Claude Code, its queued messages, Codex) become the human's own image items, so a sketch outranks a capture | `lib/session-media.mjs` (read), `desktop/collector.mjs` (upload), `/api/capture/media` | Built |
| 3. Capture references | Every URL mentioned becomes an item with a page screenshot | `app/api/capture`, `desktop/screenshot-worker.mjs` | Existed |
| 4. Capture what was built | Artifacts Claude publishes are rendered from their local HTML by Nox and become the picture of their link; public pages get server screenshots | `desktop/media-tools.mjs`; hosted screenshots | Built for artifacts; shipped URLs on phone size still open |
| 5. Fit every picture | Classify as page, object or ink; store the edge colour and trim box; make the cut-out for objects. Website captures are always pages | `lib/image-fit.mjs` (`classifyImage`, `cutOut`), run once in the screenshot worker | Library built; wiring after the merge |
| 6. Write the story and map | One call (about 20 s) returns the whole story and map, revising the current version. IDs, URLs, fonts and quotes are checked against the session. A rejected answer is retried once, and the retry names the rule it broke | `prepareSessionBatch`, `generateSession`, `validateSession` | Built |
| 7. Store them | Save the whole story and map on each run; earlier versions are replaced, not appended. The local and hosted workers both call it | `completeSession` in `lib/story-store.mjs`, migration 0007 (`stories.session_json`) | Built |
| 8. Render | Story steps and the Map, following the rules in this file | `components/session-view.tsx` (data, status, Retry) with `components/session-story.tsx` and `components/session-map.tsx` | Built (light mode; dark mode comes with the shared shell) |

The model never sees the pictures, so it cannot crop to a subject. The rules make up for that:
- **Fonts:** a typography node names its font and a sample, and the map renders a live specimen.
- **Mixed pictures:** if no picture shows only the subject, the model leaves it out rather than showing something confusing.
- **Trimming:** the renderer trims to the content box from step 5.

Sending small thumbnails to the model would let it choose better. It stays off because the README promises that images are not sent, and turning it on is your call.

## Who decides what

The story model reads transcript text and media metadata. It never sees the images, so it cannot judge how a picture will fit.

- **The model** picks:
  - the step's layout: choice, reference, before-after, detour, words or none
  - which saved items go on it
  - each item's role: option, picked, before, after, attempt or result
  - a short label for each item
- **The renderer** picks the variant of that layout from the number of items and their shapes, fits every image, and enforces the rules below. The model never names a variant.

When the model's choice cannot be filled (too few items, or none with a usable picture), the renderer falls back to the variant named in each layout's fallback line. It never draws an empty slot.

## The step

Each step is two columns on a white page. The page reads as one story, from step one down, with no title screen above it.

- **Left, in reading order:**
  1. a "Step 01" label and the date
  2. the title
  3. one short paragraph of about 30 words, in the human's own voice. Write it in the first person ("sketched six ways…", "didn't love it"), casually, in short sentences, reusing the human's own phrases where possible. It should sound like them telling a friend, not like an article. No bullet points.
- **Right:** the canvas.
- **Motion:** each step rises in as it scrolls into view, the words first and the canvas 90 ms later; a step you jump past is revealed with the one you land on. Pictures on a canvas lift slightly on hover, and a dropped attempt in a detour gets a dashed outline. Switching views fades the new one in over 280 ms. Reduced motion turns all of it off.

On a narrow screen the canvas goes below the paragraph.

## The canvas

Every canvas is a **16:10** sheet, the full width of the right column.

- It is one solid, very light grey sheet with all four corners rounded (radius 60 units). A hairline rim runs along the top. The edge is crisp at the top and blurs gently toward the bottom, keeping its outline. It does not fade to transparent.
- How it is drawn: the same rounded shape three times, sharp, light blur and medium blur, each masked to a band of the height. The blurred copies are drawn slightly smaller so their soft edge stays on the original outline. The content sits above all three, with no z-index of its own, so sketches can blend with the sheet.
- In dark mode it is a dark grey sheet on a near-black page.
- Nothing inside it is boxed: no cards, no frames, no white mats around images.
- There is no header line inside the canvas. Layout names and counts ("Before-after", "sketch → shipped") are for us, not the reader, so they never appear.
- Captions sit under each image: the item's name, plus a pill only when it carries meaning. A black pill means Picked or Kept; an outlined pill means Dropped. Fading and a struck-through name also mark dropped and unpicked items, so colour is never the only signal.

| Part | Size, in canvas units (1000 × 625) |
| --- | --- |
| Padding | 44 top, 46 sides, 60 bottom (content stays clear of the blurred lower edge) |
| Gap between images | 30 |

Text inside the canvas scales with its width (container units) and never drops below 10px. Text that does not fit is cut off with an ellipsis. It never makes the canvas taller.

### One sheet everywhere

The Story canvas and every Map tile use the same sheet component: a rounded grey shape with a hairline rim at the top that blurs gently toward the bottom. Size settings scale it: the corner radius, the blur, and how far the soft edge reaches. A tile is a small canvas, with the same image rules: ink blends in, objects sit on the sheet, and pages are inset with rounded corners.

### Text and measuring

- **Wrapping:** text wraps only at spaces and after `/`, `-` and `_`. The renderer inserts break points after those characters, and breaks inside a word only when nothing else fits.
- **Measuring:** every box is measured at the size it will render (fixed widths, not "shrink to fit") before layout runs. Otherwise the collision pass spaces the wrong boxes.
- **Dot field:** the faint dot grid sits behind the Map and behind each Story step's words.
  - In the Map it is fixed to the stage. Panning and dragging leave it still; zooming only changes its spacing.

### Only necessary images

Every image on a canvas must carry the step's point: the options that were weighed, the reference that set the bar, the before and after. No decorative extras, no second screenshot of the same thing, no image that only repeats the caption. When in doubt, show fewer.

## Fitting images

### Pages may be cropped; objects never are

Every image is one of these kinds, and each kind is fitted differently.

| Kind | What it is | How it is fitted |
| --- | --- | --- |
| **Page** | A website screenshot, a document page, an app screen | Fills the slot (`cover`), anchored to the top. Only the bottom and the sides may be cut. It keeps its own white and gets small rounded corners and a soft shadow. |
| **Object** | Anything with its own outline: a window panel, a ticket, a product shot, a UI component | Shown whole (`contain`), sitting on its caption. Its background is cut out when the preview is made (a flood fill from the edges, then trimmed), so it sits on the canvas with a soft shadow and no white edge. |
| **Ink on white** | A sketch, wireframe, type specimen or diagram: dark marks on a white ground | Shown whole. The paper blends into the canvas (`multiply`). In dark mode it is inverted to light lines (`invert` + `hue-rotate(180deg)`, `screen`), so the ink stays legible and keeps its hue. |
| **Work** | The part of an artifact Nox framed (see Artifact pictures) | Shown whole, sitting on its caption, with a page's white, corners and shadow. It was already cropped to the work, so it is never cropped again. In the Map its tile is close to its shape and it fills the tile. |
| **Scene** | A photo that runs to its edges | Cropped by at most 10% on each side. If it needs more, it is shown whole over a blurred, enlarged copy of itself. |

The kind comes from the item. Website captures are pages. Uploads and images pasted into a transcript are objects unless the human calls them a photo. When unsure, the renderer treats the image as an object, which is the safe choice because it never cuts anything off.

Cut-outs are made once, when the preview is made, and stored beside the original. An object whose background can't be separated cleanly is shown on its own edge colour instead, stored as `matColor`.

### Fill rules

1. **Slots tile the body.** Every variant is a grid whose slots add up to the whole body. Nothing is centered in leftover space.
2. **Trim first.** Plain margins inside an image are removed before it is fitted: blank paper around a sketch, the white page around a product shot.
3. **Pick a slot that matches the shape.** The variant is chosen so that each object's slot is within about 15% of the object's own proportions. The object then fills its cell instead of floating in it. Shapes are classed by width ÷ height:
   - landscape: 1.2 or more
   - square: 0.83 to 1.2
   - portrait: below 0.83
4. **Text sizes to its box.** A quote or a list grows to fill its box, choosing from three sizes by length. A short quote is never left in small type over empty space.
5. **No placeholder tiles.** An item with no picture becomes a text tile that fills its slot: its title in display type, then its domain or source. It is never a grey box.
6. **Too many items:** the renderer keeps the picked item and the items the transcript mentions most, then shows "+n" in the header count. It does not shrink the slots.

### Artifact pictures

An artifact's picture is the part of it that shows the work, not its title. When Nox renders a published artifact from its local HTML, it measures the page (`visualBoxes` in `desktop/artifact-region.mjs`) and frames one region (`pickRegion`):

- **What counts:** images, canvases, videos and inline SVGs first; then background art; then framed panels (a card or sheet, including ones painted by `::before`). Icons, thin rules, navigation and anything pinned to the screen don't count.
- **Layout isn't a picture:** a panel or background that fills the screen is a section of the page, so it is skipped.
- **Groups stay together:** pictures within 48 px of each other are framed as one, like a before and after, as long as they fit one screen.
- **Earlier wins a tie:** the page leads with what matters, so a picture further down needs more weight to win.
- **The frame:** 24 px of room, at least 480 px wide, between 4:3 and 16:9, rendered at 2x so it stays sharp on a card.
- **Kept whole:** a page that fits one screen (one composition), or one with too little visual to frame, keeps its top.

Clicking an artifact's picture opens the artifact in a new tab, as any link's picture opens its page, in the Story and the Map. A Claude page with no capture (a shared chat, a private artifact before Nox renders it) shows a text tile, never Claude's default share card, and Claude's own site images are not saved as references.

## Human-made material first

A sketch, drawing or photo the human made says more about their intent than any capture of the result. When a step has one, it should almost always be on the canvas.

- **Priority order:** an image the human made → an image the human pasted as a reference → a capture of the built result → a website screenshot.
- **Detecting it:** the image arrives in a user turn. The words around it say what it is ("this sketch I just did", "strictly follow this wireframe"). The model sees those words and marks the item `madeByYou`. The renderer captions it "Your sketch".
- **Best pairing:** a sketch and the thing built from it is a Before-after (sketch → result). It shows the idea and how faithfully it was built.
- **Collection:** Nox uploads them after the turns:
  - user-role images only, each once, checked by its bytes
  - at most 1600 px on the longest side and 3 MB
  - the same private file storage as uploads
  - the Connect dialog says pasted images and artifact captures are saved

## Layouts and variants

The layout says what kind of moment a step is, so the renderer knows how to arrange its canvas. The model picks it; readers never see its name.

| Layout | The step is… | Items and roles |
| --- | --- | --- |
| choice | a pick between options that were weighed | 2–4 items, exactly one "picked", the rest "option" |
| reference | an outside source that set a standard or direction | 1–3 items, all "reference" |
| before-after | something drawn or written, then built | one "before", one "after" |
| detour | an attempt that was dropped and undone | a "start", 1–2 "attempt", a "result" |
| words | a turn made in words, with no picture that shows it | no items; 1–5 rows in one form: flow, change, spec, line or number |
| none | a step that needs no canvas | nothing |

### ① Reference

One outside source that set a standard or direction.

| Variant | Use when | Slots |
| --- | --- | --- |
| **R-full** | 1 landscape item | one slot, 944 × 523, caption: domain + author |
| **R-split** | 1 portrait or square item | image 420 × 523 on the left; text panel 510 × 523 on the right with the title, domain and the human's quote about it |
| **R-set** | 1 primary + 2–3 related | primary 618 × 523; related items stacked in a 312-wide column |

Fallback: R-split with a text tile.

### ② Choice

Options compared side by side, and what got picked. The picked item is outlined in the accent colour and gets a "Picked" pill. The others are dimmed.

| Variant | Use when | Slots |
| --- | --- | --- |
| **C-hero** | 3 landscape or mixed | picked 618 × 523 on the left; 2 others 312 × 254 stacked on the right |
| **C-row** | 3–4 portrait | equal columns across the full height |
| **C-grid** | 4 landscape | 2 × 2, picked top-left |
| **C-many** | 5–9 options | picked 618 × 523; the others in a 2 × 2 grid on the right; the last tile shows "+n" |
| **C-duo** | 2 options | two 465 × 523 halves |

Fallback: with one option, the step is a Reference, not a Choice.

### ③ Before-after

Before and after.

| Variant | Use when | Slots |
| --- | --- | --- |
| **B-wipe** | before and after are the same view of the same thing (same source, same shape) | one 944 × 523 frame with both images layered and a draggable divider |
| **B-pair** | anything else with two pictures | two 451 × 523 slots with a 42-wide arrow between them |
| **B-spec** | the change can't be seen in a still (timing, motion, performance) | two columns of 3–5 rows, "property · value", in large type, with the changed values in the accent colour |

Fallback: B-spec.

### ④ Detour

Something was tried, abandoned and undone. A Before-after cannot show the return.

| Variant | Use when | Slots |
| --- | --- | --- |
| **D-path** | start, 1–2 attempts, result | a 40-high path band on top; 3–4 equal nodes below. Attempts have a dashed border and a "Dropped" pill; the result has a "Kept" pill |

Trigger words in the transcript: "revert", "discard", "go back to", "the beginning version looks better".

### ⑤ Words (no picture)

When no picture shows the step, the canvas still shows what happened, in a shape the reader gets at a glance. The test: cover the paragraph, and the canvas alone tells you the step. The model picks the form that fits:

| Form | The step is… | Rows |
| --- | --- | --- |
| **Flow** | a sequence: a process, a journey, a user flow | 3–5 steps in order, numbered dots on one line |
| **Change** | something went from one thing to another | 2: what it was (struck through) and what it became |
| **Spec** | a part decided in words: what, where, when | 2–5 label and value rows, split by hairlines |
| **Line** | a rule or stance, said best in the human's words | 1: copied exactly, at most 20 words, with who said it |
| **Number** | one measured result | 1: the value as the session states it, with what it measures |

Rules for every form:
- Rows are a few words each (at most 8; a line at most 20).
- The words come from the session: most of each row's words, and every number, appear in the conversation.
- The canvas shows, and the paragraph tells. They can share words, but a line never repeats the paragraph.
- Nothing is boxed: type, hairlines and the sheet only.

Lab with real steps: https://claude.ai/artifact/HAaF8VACh7Q3q5noxD5RuX

## Outcome (new)

Not in the current mockup: it was removed on Oct 17. Kept here for reference.

The shipped result of a finished session. It closes the story, so it gets more room and more care than a step.

### When it appears

Only when the session reached a result someone can use. The signals, any of which is enough:

- the human asks to push, deploy, publish or "make it live"
- a live URL, a merged pull request or a release appears in the transcript
- the human says the work is done

If work continues after shipping (a feedback pass, a fix), the Outcome always shows the latest shipped state. If the session never shipped, there is no Outcome, and the last step is an ordinary step.

The Outcome does not count toward the five steps, and it is never compacted.

### Layout

The Outcome spans the full width of the story, below the last step. Every Outcome is the same size: **16:9**, in canvas units 1000 × 562.

Above the canvas:

- an "Outcome" eyebrow with the ship date and address
- a title, up to 6 words
- a facts row in the session's own units: days, sessions, requests, steps, detours, review fixes

Canvas: padding 28, header 32, gap 14, body 944 × 460. The body is always a **main frame** (704 × 460: a 20-high browser bar over a 16:10 picture) and a **side column** (226 × 460). What changes between variants is what fills them.

| Variant | Main frame | Side column | Use when |
| --- | --- | --- | --- |
| **O-show** | The shipped result on desktop, in its most characteristic state (hovered, opened, playing) | The same result on a phone | A website or app |
| **O-trace** | The shipped result on desktop | One row per step: its key image and what it became ("Window panel sketch → the window") | The steps map clearly onto parts of the result |
| **O-then** | The human's first sketch layered over the shipped result, with a draggable divider | What survived from the sketch: one line per element, ✓ kept or – dropped | The human sketched the result early on |

For a result that isn't visual (a library, a command-line tool, an API): the main frame shows the README's first screen or a terminal session, and the side column shows the version, the install command and the test results.

## Map

The Map is not the Story. It keeps what is worth reusing from the session: the look and the rules behind it, key components, references and what was liked about each, principles, and strong choices. Layout follows do's Session Map.

- **Center:** no node repeats it. do's design, unchanged: a white box with a hairline border and the dot ring, with the output's name and "Session output" underneath. It links out when it has a URL. It does not use the sheet.
- **Main nodes:** up to six, evenly spaced around the center. Each is a tile sized by weight: about 196px tall for "major" (at most two), 128px for "normal", 92px for "minor". A tile shows its picture, or the node's quote when it has none.
- **Tile text:** a node with no picture shows its quote, growing to fit it (at most six lines). If a story canvas already shows that line, the tile shows the node's label in display type instead, so the two views never show the same line.
- **Summary bubble:** beside each tile on its outer side, shown by default. It holds the one-line summary and the node's name, but no kind or category label.
- **Details:** 1–3 per node. When you zoom in they fade in together with the line that leads to them, on the same timing, without scaling, inside the node's own slice of the map. A detail with a picture is a small tile; one without is an outlined label. The human's quote appears under each detail at the closest zoom.
- **Item grid:** a collection has two views, Map and Story. Cmd/Ctrl+Shift+G turns on Dev mode, which adds Gallery, the item grid where items are added and removed.
- **Links:** a reference node or detail opens its site in a new tab. Nothing opens a pop-up. There is no filter column and no link to the Story.
- **Interaction:**
  - Scroll or pinch zooms around the pointer.
  - Dragging a tile moves its bubble and details with it.
  - Dragging the background pans.
  - A drag never counts as a click.
  - ↺ resets the layout.
  - Tiles panned past the edge of the map fade out over its last 32px instead of being cut off.
  - The center's name counter-scales, so it stays at least about 10px on screen when zoomed out.
  - The center sits in the middle of the stage, zoomed so every tile and bubble fits around it, until the viewer drags, pans or zooms; a resize recenters it until then.
- **Lines:** each line ends on the part of its target that is visible at every zoom (a detail's picture or label), measured live and redrawn when the zoom level changes.
- **Layout:**
  - Tiles sit at even angles.
  - Details fan out beyond their tile.
  - A collision pass then separates any boxes that touch: siblings slide sideways, everything else moves outward along its own node's direction, and hidden items take no space.
  - Nothing may overlap at any zoom level, on desktop or phone.
  - Details on a left-hand tile read top to bottom in their listed order, as on the right.
  - Measuring for the layout briefly shows every detail; transitions are off meanwhile, so nothing flashes in and fades out over the overview.

## Curated documents

A Story and Map can be written by hand for one collection, for example to show a session exactly as it was told. The owner saves it with `POST /api/stories` and `{ action: "save", collectionId, session }`; `examples/newron-story.json` is the one saved to the Newron collection.

- **Never revised:** a curated document carries `curated: true` inside `stories.session_json` (no migration). The story job never claims it and cannot publish over it, even a job already running when it was saved. New turns and reconnects queue the collection as usual, but the Story never shows as updating.
- **Undo:** the first save keeps the version it replaced and the collection's name on the server. `{ action: "restore" }` puts both back exactly, and the story job then catches up with turns synced in between. `{ action: "rewrite" }` also clears it and writes the Story again from the first turn.
- **Checked strictly:** `normalizeCuratedSession` in `lib/story.mjs` accepts known fields only, bounds every text, and returns the stored shape with every optional field filled. The model's schema is unchanged, so generated sessions never use these forms.
- **Demo sessions (for the demo video, not a product feature):** a coding session listed in `lib/demo-sessions.ts` gets its curated document saved again whenever Nox connects it, in `POST /api/subscribe`: a new collection, a resume, or a reconnect after its collection was deleted. A deleted collection sits in Trash with its session paused; connecting a demo session again restores it from Trash instead of refusing. The main Newron chat is listed, so it always shows the Story mockup.
- **Pictures:** static files under `public/story/<name>/`, listed in the document's `pictures` with their fit (page, ink or object) and, for Map tiles, their shape and focus. Every picture reference in the document must name one of them.

- **Looks exactly like its mockup:** a curated collection is shown with the Story mockup's measurements, not the app's defaults: a 1160px Story column that starts right under the header, Geist for the Story and Map (DM Sans stays on the header and the Map's toolbar), the darker dot field, no rise-in, and a 1400px Map that fills the window under the header, with the app's faded edges. The Map has the Guided/Free toolbar and opens in Free view; its guided camera is the mockup's: the overview is the fitted map, a node is framed with its bubble and details at up to 2.6× the fit, one detail at 2.8×, gliding over 0.6 s; the chosen widget doesn't lift, and everything else, the center too, steps back to the same faintness.

A curated step's canvas follows the same rules as any other, in one pattern: pictures fill it, a short caption sits under each, and the human's own words sit in one line at the foot ("I said"), in the same place on every canvas.

| Layout | What it draws |
| --- | --- |
| reference | One or two pictures side by side, or three: the first at full height and the other two stacked beside it. Captions optional |
| before-after | Two pictures, captioned, with Dropped and Kept pills |
| wipe | One frame that wipes left to right from the dropped picture to the kept one as the step scrolls by: it starts once the whole frame is on screen and is done about a fifth of a screen later, before the frame reaches the middle. The page never pins. An optional fixed picture sits beside it (35% wide), so what changed reads against what stayed |
| rules | Each note (a picture of it, or its words in a bubble), an arrow, then the prompt line it became in monospace |

On the Map a curated tile may show problems and their fixes (each problem in grey, the fix under it), or a short principle in large type (26 characters or fewer). A detail may name the commit a fix shipped in and link to it. A curated tile shows up to five details.

## Limits for the model

| Field | Limit |
| --- | --- |
| Steps per story | 5. A sixth major decision compacts steps 1–4 and decides them again. The Outcome is extra |
| Step title | 2–7 words, casual ("Tried 3D, went back") |
| Outcome title | up to 6 words |
| Story paragraph | about 30 words, first person, the human's tone, no bullet points |
| Slot label | 1–4 words |
| Words on a canvas | rows of at most 8 words; a line at most 20 words, copied exactly |

## Check before shipping a canvas

- Every canvas on the page has the same size, and none has inner cards, frames or a header line.
- No slot is empty, and nothing sits in leftover space.
- No object is cut off. Pages are cut only at the bottom or sides.
- No text overflows its slot.
- Human-made images on the step are shown, or the reason they are not is clear.
- Picked, dropped and kept states are shown by shape (outline, dashed border, ✓ and –), not by colour alone.

## Rules from review

Each piece of feedback was turned into a general rule, so it holds for any session, not only the one it came from.

| Feedback | General rule | Where it is enforced |
| --- | --- | --- |
| "template" was confusing | Internal names are plain words: each step has a layout (choice, reference, before-after, detour, words, none), and readers never see it | Schema; validator |
| "4 fixes after launch" | Name each thing; never counts or vague summaries | Prompt; validator rejects aggregate text |
| "Change log · sketch → shipped" labels | Labels name content, never the format: no layout names, layout arrows or meta words | Prompt; validator rejects format words |
| Too many words | Titles 2–7 words, step text about 15–45 words, map summaries one line, details a few words | Prompt; validator word limits |
| Tone should be mine | Write in the human's voice, vocabulary and casing, in both views | Prompt |
| "too fancy" landed on the wrong reference | Every claim must be backed by evidence about the same subject; each step quotes the conversation itself | Prompt; validator requires conversation evidence |
| Peer review was not that important | Other people's suggestions count only if the human adopted them and they changed the direction; routine review is not a step | Prompt |
| Map repeated the Story | The two views do different jobs; the map keeps reusable things, not events | Prompt; validator rejects map text that repeats a step |
| Three windows at a glance | Each node is a different subject; merge duplicates into one node and its details | Prompt |
| The font node showed a window | A picture shows only its own subject and is used once | Prompt; validator rejects a reused picture |
| Every node looked equally important | Nodes carry a weight; at most two are major; the renderer sizes by weight | Prompt; validator caps major nodes; renderer |
| Sub-nodes were text only | Details carry their own picture when one shows exactly them | Prompt; schema; renderer |
| Draft and final apart | Versions of one thing sit together (a node and its details) | Prompt |
| References should open | References carry their URL from the input; clicking opens the site | Prompt; validator checks URLs; renderer |
| Objects were cropped | Pages may be cropped; objects never are | Renderer |
| Boxes within boxes | One sheet, no cards inside it; ink blends into it | Renderer |
| "minim / al" | Wrap only at spaces and after `/ - _` | Renderer |
| Overlaps on zoom | Measure at rendered size; collision pass; no overlap at any zoom | Renderer |
| Dot grid moved while dragging | The dot field is fixed to the stage; only zoom changes it | Renderer |
| Steps that only report progress | Routine work never counts | Prompt |
| Sketches first | The human's own material outranks captures | Prompt |
| Deploying became a step (Codex test) | Publishing, deploying or pushing the result is never a step; the center shows the result | Prompt |
| The live site was both center and node | No node repeats the center | Prompt; validator |
| Canvas quotes ran 27–33 words | A line on the canvas is at most 20 words | Prompt; validator |
| A reference without a link was missed ("like X's left bar") | A reference can be named without a link | Prompt |
| The retry repeated the same mistake | The retry tells the model which rule the first answer broke | `lib/story-provider.mjs` |
| Codex wrappers hid the request | Strip app wrappers and keep the request inside | `cleanSessionText` in `lib/story.mjs` |
| Map and story showed the same line | The renderer swaps the tile's quote for its label; the model is only asked to prefer another line (a hard rule made runs fail) | Prompt; renderer |
| Detail lines stopped short at mid zoom | Lines end on the always-visible part of their target, measured live | Renderer |
| The text-only canvas was confusing; one line was too narrow | The canvas shows what happened in the shape that fits the step (flow, change, spec, line, number), readable without the paragraph | Schema; prompt; validator; renderer |
| A whole answer was discarded for one small slip | Code repairs what it can fix without guessing (a reused picture, extra major nodes, a node repeating the center); only invented items, links or quotes are rejected | Validator |
| Artifacts showed Claude's logo, then only their title | An artifact's picture frames the part that shows the work; clicking it opens the artifact; Claude's own images are never references | `desktop/artifact-region.mjs`; `lib/source-policy.mjs`; renderer |
| Quotes failed on capitals and curly quotes | Quotes must have the same words in the same order; capitals and quote-mark style may differ | Validator |
