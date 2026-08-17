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

## Trying it

Installers land on the [Releases](../../releases) page. A few things to know if you run it:

- First launch walks you through a short setup and starts you with a set of habits that fit
  *my* life — you can make your own.
- Some importers (TMDB, YouTube) need your own free API keys; the rest work as-is.
- Sync expects a self-hosted relay. Without one, the app simply stays local — which is fine.
- Backups and images want a folder (I use a cloud-synced one); the app will ask.

## Development

Prerequisites: Node ≥ 22, Rust (stable, via rustup), and on Windows the MSVC C++ Build Tools.

```
npm install
npm run tauri dev
```

The first run compiles the Rust shell and takes a few minutes; later runs are fast.
