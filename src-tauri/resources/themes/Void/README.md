# Void — bundled

The dark half of the bundled pair. Ships inside the app; the Default (neutral light) remains the
ultimate fallback.

**Register:** dark · neutral — a hard inversion of the Default's light-neutral ground, with a hot
magenta accent (`#ff2d78`) and a bright, legibility-lifted meaning palette. Hue identities and the
seasonal month anchoring are preserved: a habit keeps its recognizable colour family.

**Ambience:** backdrop and timer backdrop are **silent**. The vignette **inherits the Default's
code-drawn tick-face clock**, drawn in Void's chrome ramp — no art files.

## Origin

These values were authored as the stage-5b anti-theme **Void**, a disposable regression fixture
torturing the colour-distance axis. It passed the full 37-snapshot corpus clean and was ruled to
ship as-is. The fixture at `3. UI Design/Stress/Void/` survives unchanged as living regression
coverage — **this is a fork, not a move.** The two are free to diverge; a change to one is not a
change to the other.

## Known: the ramp transcriptions

Void deliberately shifted `--heatmap-ramp` and `--cat-ramp` away from the Default's stops. The
mockup corpus transcribes those stops inline (CSS cannot `var()` one stop of a multi-stop value),
and every transcription is written to the Default's numbers — so under Void the heatmap and
categorical intensities render slightly stale. **Cosmetic only; nothing structural rides them.**
Ruled to ride as-is and be fixed at Build step 6a, where components compute the stops from the
ramp dial and the transcription problem stops existing.

## Adding art

Same as any theme — drop `backdrop.png` (2560×1440) in and it paints the whole window. Full rules
→ `_theme-template/README.md`. A `vignette/` folder here would override the inherited clock.
