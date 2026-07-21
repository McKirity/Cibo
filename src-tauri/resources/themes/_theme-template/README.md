# Theme folder — the starter template

**Duplicate this folder, rename it, fill in the files.** The **folder name is the theme name**
shown in Settings. Folders whose name starts with `_` are skipped by the loader, so this
template never lists.

Drop your folder in `<cloud root>/themes/`. That is the whole install step — the loader reads it
at launch. The folder rides your cloud drive, so it appears on both devices automatically.

## What goes in it

| File / folder                    | What it is                                          | Dimensions | Required? |
| -------------------------------- | --------------------------------------------------- | ---------- | --------- |
| `theme.css`                      | The `:root` values — 233 dials                      | —          | **Yes**   |
| `backdrop.<ext>`                 | Still — the main backdrop, painting the whole window | 2560×1440  | No        |
| `backdrop_loop.mp4`              | Motion — the whole scene as a seamless opaque loop   | 2560×1440  | No        |
| `backdrop_loop/`                 | Motion — patch loops (animated crops of the still)   | per patch  | No        |
| `timer.<ext>`                    | Still — the Timers-screen backdrop                   | 2560×1440  | No        |
| `timer_loop.mp4` · `timer_loop/` | Timer motion — the same two types                    | —          | No        |
| `vignette/`                      | The rail's small ambient loop                        | 340×170    | No        |
| `decoration/`                    | Per-slot ornament art                                | per slot   | No        |

**The only required file is `theme.css`.** A theme with no art is simply a recolour — nothing
breaks, silence is always valid. A theme with no `backdrop` has no backdrop; the window shows the
theme's flat `--window-background`.

## The three ambience surfaces

- **`backdrop`** — the lowest layer, painting the **whole window**; panels, tiles, and the
  attached rail all sit on top. On resize it **cover-scales** (never stretches, never letterboxes)
  toward the theme's focal anchor — default **(1470, 740)**, the pane's optical centre.
- **`timer`** — **replaces** `backdrop` on the Timers screen, so only one full-scene loop is ever
  visible at a time. Absent → falls back to `backdrop`. Default anchor **(1280, 740)**, the window
  centre (the Timers screen runs rail-minimized by design).
- **`vignette`** — a fixed **340×170** box, centred in the rail's flex band and positioned by
  code. Space-conditional: if the band can't clear it, it drops cleanly.

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

## The vignette — the same vocabulary at 340×170

- **PNG frames** (the default): zero-padded frames + a manifest holding only `{ "fps": N }` — no
  coordinates, code anchors the box. This is the **only** form that may use transparency (a sprite
  sitting directly on the rail surface). `001.png` doubles as the poster.
- **`still.png` + `loop.mp4`**: for a long opaque mini-scene filling the box.
- Idle behavior ("mostly still, occasionally stirs") is **baked into the frame sequence**, never
  coded. Mostly-identical frames are near-free.
- **A `vignette/` folder wins over a theme's code-drawn vignette**, if it has one.

## File formats

- **Stills** — `.png` preferred (lossless, alpha). `.jpg`/`.jpeg` fine for opaque scenes;
  `.webp`, `.avif`, `.svg` also render. One file per base name; PNG wins ties.
- **Patch + vignette frames** — **PNG only**.
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
