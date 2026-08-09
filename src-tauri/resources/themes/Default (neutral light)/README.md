# Default (neutral light) — bundled

The guaranteed theme and the **ultimate fallback**: it ships inside the app, can never go
missing, and never retires. A picked theme that no longer exists falls back here.

**Register:** light · neutral (humanist-soft). Quiet, precise, macOS-adjacent minimalism — the app
recedes and the data (covers, habit colours, keepsake art) provides all the colour.

**Ambience:** backdrop and timer backdrop are **silent** — and those two are the *only* ambience
surfaces. The vignette was abandoned 2026-07-26, and the code-drawn tick-face clock that was its
last tenant was retired 2026-08-01 along with `--clock-max`.

## Adding art

The folder is real, so you can dress it: drop `backdrop.png` (2560×1440) in and it paints the
whole window. `backdrop_loop/` is stubbed for patch loops; `decoration/` holds per-slot ornament
(the manifest schema landed at Build step 6a — `src/theme/decoration.ts`). Full rules →
`_theme-template/README.md`.

A `vignette/` folder is read by nothing: that surface no longer exists.
