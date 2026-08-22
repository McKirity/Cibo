# Theme folder — the starter template

**Duplicate this folder, rename it, fill in the files.** The **folder name is the theme name**
shown in Settings. Folders whose name starts with `_` are skipped by the loader, so this
template never lists.

Drop your folder in `<cloud root>/themes/`. That is the whole install step — the loader reads it
at launch. The folder rides your cloud drive, so it appears on both devices automatically.

## What goes in it

| File / folder                    | What it is                                          | Dimensions | Required? |
| -------------------------------- | --------------------------------------------------- | ---------- | --------- |
| `theme.css`                      | The `:root` values — 255 dials                      | —          | **Yes**   |
| `backdrop.<ext>`                 | Still — the main backdrop, painting the whole window | 2560×1440  | No        |
| `backdrop_loop.mp4`              | Motion — the whole scene as a seamless opaque loop   | 2560×1440  | No        |
| `backdrop_loop/`                 | Motion — patch loops (animated crops of the still)   | per patch  | No        |
| `timer.<ext>`                    | Still — the Timers-screen backdrop                   | 2560×1440  | No        |
| `timer_loop.mp4` · `timer_loop/` | Timer motion — the same two types                    | —          | No        |
| `backdrops/` · `timers/`         | A SET of stills — the slideshow (see below)          | any        | No        |
| `fonts/`                         | Font files this theme's type dials name              | —          | No        |
| `decoration/`                    | Per-slot ornament art + its manifest                 | per slot   | No        |

**The only required file is `theme.css`.** A theme with no art is simply a recolour — nothing
breaks, silence is always valid. A theme with no `backdrop` has no backdrop; the window shows the
theme's flat `--window-background`.

## The two ambience surfaces

- **`backdrop`** — the lowest layer, painting the **whole window**; panels, tiles, and the
  attached rail all sit on top. On resize it **cover-scales** (never stretches, never letterboxes)
  **with the image's right top and bottom corners anchored to the window's right corners** —
  the right edge always rides the window's right edge, and a wider window reveals more of the
  left *(re-ruled 2026-07-31)*. Compose accordingly: the important subjects sit toward the
  **right** (the content pane's side); the left quarter is the under-rail falloff zone and the
  first region cropped.
- **`timer`** — **replaces** `backdrop` on the Timers screen, so only one full-scene loop is ever
  visible at a time. Absent → falls back to `backdrop`. Crop: **dead center to dead center** —
  compose the important parts around the image's centre (the Timers screen runs rail-minimized
  by design).

## Several backdrops — the slideshow *(2026-08-20)*

Instead of one `backdrop.<ext>`, a theme may carry a **`backdrops/`** folder holding **any number
of stills**; the app **shuffles through them on a timer with a crossfade**. The same goes for
**`timers/`** on the Timers screen.

```
My Theme/
├── theme.css
└── backdrops/
    ├── 01-dawn.jpg
    ├── 02-noon.jpg
    └── 03-dusk.jpg
```

- **Filename order is the only ordering** — number the files. The deck is shuffled on top of it,
  and when the slideshow is set to *Off* the **first file by name** is the one shown.
- **Mixed sizes are fine** — each picture is cropped by its own dimensions under the same
  right-corners / dead-centre law.
- **Stills only.** No `_loop` motion inside a set; motion stays with the single-file form.
- **If both `backdrop.<ext>` and `backdrops/` exist, the folder wins** and the loose file is
  reported as a packaging slip in the console.
- **2560×1440 is plenty.** Only two pictures are ever in memory at once, however many you drop
  in — but each one costs roughly width × height × 4 bytes once decoded, so a 4K source buys
  nothing but memory.

How often it changes, how long the fade takes, and whether Timers keeps its own folder or
simply continues the backdrop are all set **per device** in Settings → Appearance → Ambience.

## Motion — exactly two types, never both on one surface

**Patch loop** — animate a box of your still. One folder per patch under
`<surface>_loop/<name>/`, holding zero-padded PNG frames + a three-number manifest:

```json
{ "x": 1180, "y": 620, "fps": 12 }
```

`x, y` = the crop's **top-left corner in 2560×1440 master coordinates**, read straight off the
master painting. Width and height come from the frames; frame order is filename sort; the loop is
implicit (last frame wraps to first); **fps ≤ 24** (the loader clamps). Patches render inside the
still's cover-scaled container, so authored coordinates hold at every window size.

**Full-scene loop** — `<surface>_loop.mp4`, the entire scene as a seamlessly looping video,
~10 s, **opaque H.264, no audio**. For scenes whose motion is genuinely full-frame.

**The rules:**

- **Mutually exclusive per surface.** If `<surface>_loop.mp4` is present, `<surface>_loop/` is
  ignored and flagged as a packaging error.
- **The still stays required whenever motion is present** — it is the poster frame, the
  reduce-effects fallback, and what shows until the video starts.
- **Soft-fail.** A malformed patch (bad manifest, missing frames) is skipped; a broken video falls
  back to the still. The still underneath is always complete.
- **Reduce-effects hides all motion** and leaves the stills; motion pauses when the window is
  hidden or minimized.

## Fonts — drop them in, nothing installs

A theme can carry its own fonts in a **`fonts/`** folder. **The filename is the family name**:
`Anton.ttf` becomes the family `Anton`, and `theme.css` just names it —

```css
--font-heading: "Anton", Impact, sans-serif;
```

The app registers them itself when the theme applies. **Nothing is installed on your system** —
no admin rights, nothing in Windows' font settings, nothing left behind when you switch themes.
The folder rides your cloud drive with the rest of the theme, so both devices get the same type
with no second install.

**Multiple weights?** Add a weight to the end of the filename and they join the same family:

```
fonts/
├── Anton.woff2                 → family "Anton" (one weight — no suffix needed)
├── IBMPlexMono-400.woff2       → family "IBMPlexMono", weight 400
├── IBMPlexMono-500.woff2       → family "IBMPlexMono", weight 500
└── IBMPlexSans-100-700.woff2   → family "IBMPlexSans", a VARIABLE font covering 100–700
```

A **variable font needs its range in the name** (`-100-700`), or it will only ever draw at one
weight. A hyphen followed by anything that isn't a number stays part of the family name.

- **Formats:** `.woff2` (preferred) · `.woff` · `.ttf` · `.otf`.
- **Soft-fail:** an unreadable font is skipped and the fallback stack in `theme.css` stands.
  Always keep a sane fallback in the stack.
- Keep `@font-face` out of `theme.css` — a relative URL inside the injected sheet can't resolve
  to this folder; the `fonts/` folder is the channel.

## File formats

- **Stills** — `.png` preferred (lossless, alpha). `.jpg`/`.jpeg` fine for opaque scenes;
  `.webp`, `.avif`, `.svg` also render. One file per base name; PNG wins ties.
- **Patch frames** — **PNG only**.
- **Full-scene loops** — **H.264 in `.mp4`, no audio**. Never GIF.

## `theme.css`

The skeleton in this folder lists **every dial with the Default's values**, grouped by token
group. Change what you want; leave the rest. Notes:

- **Raw values are legal in this file and nowhere else** — every theme replaces the whole file.
- The **structural** groups (frame dims, frame clearances, dashboard/cadence/library/modal/entry/
  timers/settings sizes) are **theme-invariant** — one canvas. Move them only with reason.
- **Type is a bounded lever** — roughly ±12% per step, and comparable-width families. Past that,
  layouts need structural re-accommodation.
- The **rail chrome** block is where a theme gets its own register (the split-register device), or
  sets the rail equal to the window/panel values for a single-register read.

## Rules — optional, after the dial block *(2026-08-02)*

`theme.css` may carry **rules after the `:root` block** — selectors that paint what dials can't
say: textures, ornament marks (pseudo-elements), restyled states, per-surface exceptions, type
detail like casing and tracking. Only the active theme's sheet is ever loaded, so your rules can
never touch another theme.

- **Dials first, always.** If the app already paints the surface and you just want a different
  value, use the dial. Rules are for what dials cannot express.
- **Keep the `:root` block on top** — a syntax error in a rule below can't hurt the dials above.
- **Never move or resize anything in the app's layout.** Paint freely — backgrounds, borders,
  shadows, ink, opacity, text treatment. You *may* add a floating mark with a pseudo-element
  (position/size it however you like — it pushes nothing) and you *may* nudge something 1px on
  press. You may **not** change an in-flow box's padding, margin, width, height or display —
  and never a size that carries data (a chart bar's minimum width changes what the chart says).
- **Own your reduce-effects fallbacks**: pure decoration disappears under `.reduce-effects`;
  anything carrying meaning flattens to a solid instead.
- Rules target the app's class names, and those can change between app versions — if a mark
  quietly stops painting after an update, check the app's stylesheets (the repo's `docs/theme-authoring.md` says where to look) and re-point it.

## `decoration/` — ornament, and overriding it

A theme's ornament lives in **`decoration/`**: the assets, plus a **`manifest.json`** saying which
of the 25 catalog slots they fill. A slot entry can carry an `asset`, a `tint` (a dial the app
pours through a tintable stamp), `off: true` to leave the slot bare, and — for the ten **frame**
roles — a `slice` saying which part of the image is the border.

**You never state a frame's thickness.** It comes from that role's own `--frame-clear-*` dial, the
clearance the app's layouts already reserve for exactly this, so the same art lands at 8px on a
rail card and 28px on a modal and always fills its designed room. Author at whatever resolution
suits you. *(This is why there is no `scale` key — it was retired 2026-08-08 when thickness stopped
deriving from the slice.)*

### The override *(2026-08-08)*

A theme ships a **default** ornament set. `decoration/override.json` can replace it wholesale:

```json
// decoration/manifest.json
{ "override": true, "slots": { ...the theme's own set... } }

// decoration/override.json
{ "slots": { "frame-modal": { "asset": "frame.svg", "slice": 20 } } }
```

- **The manifest is the switch.** `override.json` sitting in the folder does nothing on its own —
  `"override": true` turns it on. A theme can ship an override and leave it dormant.
- **It replaces, it does not merge.** The override's slots become the *whole* set, so **any slot it
  does not name goes bare.** That is deliberate: it is the only way to suppress a slot the theme
  ships. The cost is that changing one slot means restating the ones you want to keep.
- **A broken override is not a broken theme.** If `override.json` is missing or won't parse, the
  theme's own set stands and a warning names the file. Only a *deliberately* empty
  `{"slots": {}}` means "no decoration".
- ⚠ **It lives in the theme folder, so a theme update overwrites it.** Keep a copy elsewhere if you
  have tuned one you care about.
