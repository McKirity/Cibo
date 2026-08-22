# Cibo

A personal habit tracker for Windows and macOS. Not a habit *builder* — a tracker: you log
what you did, and Cibo turns it into statistics, dashboards, and a daily record. Built with
[Tauri](https://tauri.app) (Rust shell), [React](https://react.dev) + TypeScript (UI), and
[Evolu](https://evolu.dev) (local-first SQLite with end-to-end-encrypted sync).

## ⚠️ Read this before anything else

**This entire app was written by Claude (Anthropic's AI), directed by someone with no coding
background.** It exists because I wanted a habit tracker that works exactly the way I want, for
me, on my two machines. It is not a product, and it was never meant to be one.

What that means for you, curious visitor:

- **You're welcome to download it and play around with it.** Genuinely — have fun. It's MIT
  licensed (see [LICENSE](LICENSE)), so do whatever you like with it.
- **The code is most likely a mess.** I can't personally vouch for any line of it. I directed;
  Claude wrote.
- **The quality is questionable.** It works for me, on my data, on my two machines. Anything
  beyond that is untested.
- **I won't be taking feature requests.** The app does what I need; that's the whole roadmap.
- **If something goes wrong, I can't help you.** I have no coding background, so I'm not able to
  debug your setup, and issues may go unanswered. Whatever you do with this app, you do at your
  own risk — back up anything you care about.
- **It will never be monetized.** If you paid for this, you were scammed.

## What it is

Most habit apps ask "did you do it?" and draw a pie chart. Cibo asks **what you did, for how
long, how much, and which thing** — an hour of *this* game, forty minutes of *that* book, 800
words on *this* story, a night's sleep from 23:40 to 07:45 — and works everything else out from
there. Totals, streaks, bests, heatmaps, trends, waves of engagement with a title: all derived
from the sessions you log, never stored, so nothing can drift out of sync with itself.

There are no goals, no targets, no reminders, and no nagging. It is a record of what happened.

## What it does

**Habits in three kinds.** *Project* habits track individual things — games, books, films,
stories — each of which is an entry with a cover, a status, a rating. *Simple* habits track
whether (and how much) you did something — walking, drawing, keyboard practice. *Range* habits
are logged as a span between two times — sleep. A habit declares what it measures (time, a
count you name, or nothing) and how it's sliced (stages, types, boards), and **its dashboard
builds itself** from that description. There's no layout to arrange; every measure adds a stat,
every category adds a breakdown.

**Daily logging and finalizing.** The app opens to today. You log sessions into a form; when the
day is done you *finalize* it, which is how Cibo tells "nothing happened" from "not logged yet"
(an unfinalized empty day is unknown and passes a streak through; a finalized empty day is a
miss). Finalizing turns the day into a **cover wall** — the art of everything you touched, laid
out as a keepsake, with milestones stamped on it. Back-dating is normal; a catch-up list tracks
the days still waiting.

**Four kinds of dashboard.** Daily (the form, then the wall) · cadence (day, week, month,
quarter, year — verdicts, heatmaps, trends, comparisons against the year before) · habit (one
habit across its whole life) · entry (one title — every session it ever had, and its waves).
The rail's month calendar is the navigation: every day, week, month and year label is a door.

**Timers.** A board of independent clocks — stopwatch, countdown (records what actually
elapsed), and a real pomodoro with a set number of intervals and chimes between them. Stopping a
clock hands the elapsed time straight into the day's form. A shortcut, not a second logging path.

**Importers.** Entries come from outside sources so you're not typing covers and titles by hand:

| Source | Brings in | Needs |
|---|---|---|
| Steam | Games | nothing |
| TMDB | Movies and TV | a free API key |
| YouTube | Channels | a free API key |
| AniList | Anime and manga | nothing |
| Calibre | Books, from your local library | the path to your Calibre folder |
| AO3 | Fanfiction | nothing |

Importers run only when you ask, never overwrite what you've written, and download covers once
into your own images folder.

**A library and a bulk editor** per project habit — every entry as a cover grid, sortable and
filterable, with a selection-inside bulk editor for marking a stack of things finished or fixing
a category across a dozen entries at once.

**Comparing Statistics and Advanced Search.** A query workspace for "how much?" — two habits
against each other, this year against last, drawn as stacked areas, ranked bars, or a donut —
and its mirror, Advanced Search, for "which ones?". Both save presets. A `Ctrl K` palette
teleports anywhere and runs a short, fixed list of actions.

**Themes as drop-in folders.** A theme is one folder: a `theme.css` of ~255 design dials (the
only required file), optional backdrops — a single still, a **slideshow folder** that shuffles
through with a crossfade, or a motion loop — a separate Timers backdrop, the theme's own fonts
(nothing installs OS-side), and optional per-slot ornament art. Drop the folder in, and it's
installed on both machines. Two ship built in: a light neutral and a dark one.

**Whimsy.** The Daily screen is framed in small cards — sunrise and sunset, weather, moon,
season, what's visible tonight, an almanac (a quote, a word, on-this-day history alongside your
own tracking anniversaries), a tarot draw, a horoscope, your countdowns, a door to a random past
day. Every card can be switched off.

**Your data stays yours.** Everything is local. Sync between two machines runs through a relay
you host yourself (the data is end-to-end encrypted; the relay only ever sees ciphertext), and
works offline with no conflict screens — ever. Automatic backups on every clean close, tiered
and compressed, each carrying a plain JSON + CSV export so nothing is ever trapped in the app. A
**Data Doctor** runs ten semantic checks and waits for your click. Updates are silent: checked
at launch, installed on quit.

## Installing (one device)

1. Grab the installer for your platform from the [Releases](../../releases) page —
   `Cibo_x.x.x_x64-setup.exe` on Windows, the `.dmg` on macOS.
2. Run it. On Windows, SmartScreen may warn about an unrecognized app (it's unsigned) —
   "More info → Run anyway". On macOS the download gets quarantined and the app is reported
   as **"damaged"** (it isn't — it's unsigned): drag Cibo to Applications, then run
   `xattr -cr /Applications/Cibo.app` once in Terminal and open it normally.
3. Cibo opens to a short first-run setup: a few dates, **your location** (required — it drives
   the sun, moon and weather cards; stored as plain coordinates, never looked up), and which
   starting habits you want active. Finish, and you're in.
4. Optional, in Settings afterwards:
   - **Storage** — pick a folder for backups, images, and drop-in themes. I use a
     cloud-synced folder; any folder works.
   - **Importers** — the TMDB and YouTube importers need your own free API keys; Steam,
     AniList, AO3, and Calibre work as-is.
   - **Appearance** — on a MacBook the UI scale defaults to 85%; adjust to taste.

Good to know: sync expects a self-hosted relay — without one the app simply stays local, which
is fine for one device (see [docs/sync-relay.md](docs/sync-relay.md) if you want two). And the
starting habits are the set that fits *my* life; make your own.

The in-app manual (Settings → Help) explains every feature in plain words.

## Development

Prerequisites: Node ≥ 22, Rust (stable, via rustup), and on Windows the MSVC C++ Build Tools.

```
npm install
npm run tauri dev    # runs as "Cibo Dev" — its own data store, can't touch an installed copy
npm test             # vitest — the pure cores (metrics, seed, doctor, timers, …)
```

The first run compiles the Rust shell and takes a few minutes; later runs are fast. Releases
are cut by pushing a `v*` tag; CI builds both platforms into a draft release. The developer
manual lives in [docs/](docs/README.md) — architecture, the dev split, the release process,
the relay, theme authoring, and the keepsake tile format.

## License

[MIT](LICENSE). The license is there so that "as-is, at your own risk" means something — not
as an invitation to file bugs or feature requests, which I'm not able to act on.
