# Default (neutral light) — bundled

The guaranteed theme and the **ultimate fallback**: it ships inside the app, can never go
missing, and never retires. A picked theme that no longer exists falls back here.

**Register:** light · neutral (humanist-soft). Quiet, precise, macOS-adjacent minimalism — the app
recedes and the data (covers, habit colours, keepsake art) provides all the colour.

**Ambience:** backdrop and timer backdrop are **silent**. The vignette is the **code-drawn
tick-face clock** — a live functional display, not personality motion, drawn from `--clock-max`
and the chrome ramp with no art files.

## Adding art

The folder is real, so you can dress it: drop `backdrop.png` (2560×1440) in and it paints the
whole window. `backdrop_loop/` is stubbed for patch loops; `decoration/` for per-slot ornament
once the Phase-2 capture defines the schema. Full rules → `_theme-template/README.md`.

A `vignette/` folder here would **override the code-drawn clock** — leave it absent to keep the
clock.
