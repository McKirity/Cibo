# Keepsake tile format

*The spec for writing a cover-wall keepsake tile by hand. Written to be handed over whole —
paste this article into any chat and it is enough to author a working tile.*

## What a keepsake tile is

On a finalized day's **cover wall**, every habit gets a tile. Project habits (gaming, reading,
media, writing, gamedev) use their entry art — covers and banners. **Simple and range habits
have no entry art, so they get a keepsake tile instead**: a small hand-authored piece of art
with that day's measure living *inside* it. Not a picture with a caption — the minutes are
stitched into the embroidery, the sleep span is drawn across the night.

A tile is stored as a **snippet**: one fragment of HTML with its own CSS. You paste it into the
app; the app fills in the day's numbers and draws it.

## Where it goes

Two doors, both reaching the same stored value:

- **Habit creator** → the cosmetics row (last step) → the keepsake snippet slot
- **Settings → Habits** → that habit's Manage row → the same slot

The snippet is synced data, so it renders identically on every device.

## The six rules

1. **One root element**, with a class name of your choosing. Everything lives inside it.
2. **Its `<style>` block goes inside that root element**, and every selector starts with the
   root class. (The app seals the fragment in a shadow root, so leakage is prevented either
   way — but the prefix keeps the snippet readable and portable.)
3. **The root fills its box**: `position: absolute; inset: 0;`. **No fixed outer width or
   height.** The wall reflows and the tile must flex with it.
4. **Do not draw the tile shell.** The corner radius, shadow and background of the tile itself
   belong to the app. Your art fills that shell.
5. **At least one data placeholder is required.** This is a rule, not a style preference — a
   keepsake with no data in it is a picture, and the app rejects it. The single exception is a
   **measureless** habit (one that records only *that* it happened, like Walking), where
   `{{habit-name}}` satisfies the requirement.
6. **Colours may be theme dials or your own.** Writing `var(--habit-8)` makes the tile follow
   the active theme; a literal hex is legal too, because keepsake art counts as content rather
   than interface. Dials are preferred where the tile should re-skin.

## Placeholders

The app substitutes these as **plain text**, before drawing. There is no template language —
no loops, no conditionals, no expressions.

| Placeholder | Substitutes to | Example |
|---|---|---|
| `{{habit-name}}` | the habit's display name | `Embroidery` |
| `{{habit-color}}` | the habit's slot colour | `#C2569E` |
| `{{date}}` | the day being drawn | `2026-07-26` |
| `{{value}}` | the day's measure total, raw | `45` |
| `{{unit}}` | that measure's unit label | `min`, `words` |
| `{{duration}}` | the time total, formatted | `1h 35m` |
| `{{count}}` | the count total, when a habit declares both measures | `1,400` |
| `{{sessions}}` | how many bouts were logged | `3` |
| `{{cat:<key>}}` | a session categorical's value | `{{cat:keyboard_board}}` → `QK65 Classic` |
| `{{flags}}` | active flags, space-separated | `8h noon` |
| `{{range-start}}` / `{{range-end}}` | a range habit's two ends | `23:40` / `07:45` |
| `{{range-start-pct}}` / `{{range-end-pct}}` | those ends as 0–100 positions on the night axis, for drawing a span | `23.6` / `57.3` |

**Categorical keys** are the habit's own field keys — `keyboard_board`, `coding_language`,
`writing_stage`, `sleep_med`. The rule is `<habit-key>_<field>`: the habit's key (its name
lowercased, spaces to hyphens — `keyboard`, `my-habit`) joined to the field's label lowercased
with runs of non-alphanumerics collapsed to `_` (`Board` → `board`, `Wiki page` → `wiki_page`).
The seeded habits' keys are in `src/db/seed.ts`; a hand-made habit's follow the rule from the
names you gave in the creator.

## Conditionals are CSS, never logic

Because there is no template language, anything that varies is done by putting a value into an
**attribute** and selecting on it. Two patterns cover every case:

**A value that changes an appearance** — put it in an attribute, write one rule per value:

```html
<div class="ks-keyboard" data-board="{{cat:keyboard_board}}">
  <style>
    .ks-keyboard { --cap: #cccccc; }                          /* fallback */
    .ks-keyboard[data-board="Gingko65"]     { --cap: #d6ddd2; }
    .ks-keyboard[data-board="QK65 Classic"] { --cap: #d8d2c4; }
  </style>
  ...
</div>
```

**Something that only appears sometimes** — hide it by default, reveal it by flag:

```html
<div class="ks-sleep" data-flags="{{flags}}">
  <style>
    .ks-sleep .flag { display: none; }
    .ks-sleep[data-flags~="8h"] .flag-8h { display: inline-block; }
  </style>
  <span class="flag flag-8h">8h+</span>
</div>
```

`~=` matches one word in a space-separated list, which is exactly what `{{flags}}` produces.

## What is blocked

The app strips these before drawing. A snippet containing them is not an error — the offending
part is simply removed, or the tile falls back:

- `<script>` tags and any `on…` attribute (`onclick`, `onload`, …)
- `<iframe>`, `<object>`, `<embed>`, `<link>`, `<base>`, `<meta>` — and the interactive
  elements `<a>`, `<form>`, `<input>`, `<textarea>`, `<button>`, `<select>` (a tile is a
  picture, not a control)
- **anything fetched from the internet** — remote images, web fonts, external stylesheets

**Images from your own images folder are allowed.** A root-relative path into the app's
`images/` folder resolves normally; only paths that reach outside are blocked. So a tile may
legitimately be a picture you drew with the day's number over it:

```html
<div class="ks-drawing">
  <style>
    .ks-drawing { position: absolute; inset: 0; }
    .ks-drawing img { width: 100%; height: 100%; object-fit: cover; }
    .ks-drawing b  { position: absolute; left: 16px; bottom: 16px;
                     font-size: 48px; color: #fff; }
  </style>
  <img src="images/drawing/tile.png" alt="">
  <b>{{value}} {{unit}}</b>
</div>
```

Code-drawn is the default medium, not a prohibition on pictures.

## When a snippet fails

**While rendering:** the habit shows its plain lettermark tile instead. Silently — a finalized
day never shouts about a broken tile. This is why a habit without art is always safe: the
fallback is a legitimate permanent look, not an error state.

**While pasting:** the slot tells you what was wrong and previews the result before you save.
Authoring is the one place the app is talkative about this.

## A complete minimal tile

Everything above, in the smallest thing that works:

```html
<div class="ks-example">
  <style>
    .ks-example {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; justify-content: center;
      padding: 16px;
      background: linear-gradient(155deg,
                  color-mix(in oklch, var(--habit-8), var(--panel-background) 84%),
                  var(--panel-background) 76%);
      font-family: var(--font-ui);
    }
    .ks-example .cap {
      font-family: var(--font-mono); font-size: 14px;
      text-transform: uppercase; letter-spacing: .06em;
      color: var(--text-muted);
    }
    .ks-example .num {
      font-size: 58px; font-weight: 600; line-height: .9;
      color: var(--text-strong);
    }
    .ks-example .num span { font-size: 18px; color: var(--text-secondary); }
  </style>
  <span class="cap">{{habit-name}}</span>
  <div class="num">{{value}}<span> {{unit}}</span></div>
</div>
```

## Useful theme dials

The full roster is in each theme's `theme.css`. The ones a tile normally wants:

- **Ground and ink** — `--panel-background` · `--text-strong` · `--text-secondary` ·
  `--text-muted` · `--border`
- **The habit's own colour** — `--habit-1` … `--habit-12` (or `{{habit-color}}`)
- **Night and sky, for tiles that want their own world** — `--whimsy-night` ·
  `--whimsy-moon` · `--whimsy-star` · `--whimsy-ink` · `--whimsy-sun`. These stay
  night-coloured under *every* theme, which is why Sleep's tile can be dark on a light theme
  without fighting it.
- **Spacing and shape** — `--space-1` … `--space-8` · `--radius-small` · `--radius-full`
- **Type** — `--font-ui` · `--font-heading` · `--font-mono`

Deriving a colour with `color-mix(in oklch, var(--habit-8), var(--panel-background) 84%)` keeps
a tile in register with the theme — pale on a light theme, dusky on a dark one. Mixing toward
a literal `white` or `black` inverts under a dark theme and should be avoided.
