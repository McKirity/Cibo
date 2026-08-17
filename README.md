# Cibo

A personal cross-platform habit tracker (Windows + macOS desktop), built with
[Tauri](https://tauri.app) (Rust shell), [React](https://react.dev) + TypeScript (UI),
and [Evolu](https://evolu.dev) (local-first SQLite with sync).

Sessions of activity are logged against habits — projects (games, books, media, writing),
simple daily habits, and time ranges — with derived statistics, dashboards, and a
drop-in theme system.

## ⚠️ Read this before anything else

**This entire app was written by Claude (Anthropic's AI), directed by someone with little
to no coding background.** It exists because I wanted a habit tracker that works exactly
the way I want, for me, on my two machines. It is not a product.

What that means for you, curious visitor:

- **You're welcome to download it and play around with it.** Genuinely — have fun.
- **The code is most likely a mess.** I can't personally vouch for any line of it.
- **I won't be taking feature requests.** The app does what I need; that's the whole roadmap.
- **If something goes wrong, I most likely can't help you.** I'm not able to debug your
  setup, and issues may go unanswered. Whatever you do with this app, you do at your own
  risk — back up anything you care about.

## Installing (one device)

1. Grab the installer for your platform from the [Releases](../../releases) page —
   `Cibo_x.x.x_x64-setup.exe` on Windows, the `.dmg` on macOS.
2. Run it. On Windows, SmartScreen may warn about an unrecognized app (it's unsigned) —
   "More info → Run anyway". On macOS the download gets quarantined and the app is reported
   as **"damaged"** (it isn't — it's unsigned): drag Cibo to Applications, then run
   `xattr -cr /Applications/Cibo.app` once in Terminal and open it normally.
3. Cibo opens to a short first-run setup (a few dates, your location for the daily sun/weather
   cards, and which starting habits you want active). Finish, and you're in.
4. Optional, in Settings afterwards:
   - **Storage** — pick a folder for backups, images, and drop-in themes. I use a
     cloud-synced folder; any folder works.
   - **Importers** — the TMDB and YouTube importers need your own free API keys; Steam,
     AniList, AO3, and Calibre work as-is.

Good to know: sync expects a self-hosted relay — without one the app simply stays local,
which is fine for one device. And the starting habits are the set that fits *my* life;
make your own.

## Development

Prerequisites: Node ≥ 22, Rust (stable, via rustup), and on Windows the MSVC C++ Build Tools.

```
npm install
npm run tauri dev
```

The first run compiles the Rust shell and takes a few minutes; later runs are fast.
