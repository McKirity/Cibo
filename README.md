# Cibo

A personal cross-platform habit tracker (Windows + macOS desktop), built with
[Tauri](https://tauri.app) (Rust shell), [React](https://react.dev) + TypeScript (UI),
and [Evolu](https://evolu.dev) (local-first SQLite with sync).

Sessions of activity are logged against habits — projects (games, books, media, writing),
simple daily habits, and time ranges — with derived statistics, dashboards, and a
drop-in theme system.

## Development

Prerequisites: Node ≥ 22, Rust (stable, via rustup), and on Windows the MSVC C++ Build Tools.

```
npm install
npm run tauri dev
```

The first run compiles the Rust shell and takes a few minutes; later runs are fast.
