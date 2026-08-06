/**
 * THE PER-DEVICE SETTINGS FILE — the real store [[Sync & Per-Device Settings]]
 * designed, replacing the localStorage stand-in era (2026-08-04).
 *
 * TWO FILES in the app's local data dir (%LOCALAPPDATA%/io.github.mckirity.cibo/):
 *
 *   settings.json        — every per-device lever and machine fact, flat
 *                          string values keyed exactly as the localStorage era
 *                          keyed them (each module keeps its own serialization;
 *                          this store is a durable string map, nothing more).
 *   timer-heartbeat.json — the ruled SEPARATE ~15 s running-timer heartbeat:
 *                          timer state writes on every mutation + the beat, so
 *                          it gets its own file and never churns settings.json.
 *                          ABSENT file = clean quit (the crash-detection
 *                          invariant, exactly localStorage-removeItem's role).
 *
 * SYNCHRONOUS READS, DURABLE WRITES: main.tsx awaits initDeviceStore() BEFORE
 * importing the app (the bootstrap split), so every module-scope read — the
 * timer crash-detection IIFE above all — sees a primed in-memory cache. Writes
 * update the cache instantly and flush to disk immediately but COALESCED (one
 * write in flight; a write landing mid-flight marks dirty and re-flushes), so
 * a slider drag costs one file write, not fifty.
 *
 * MIGRATION: a launch that finds no settings.json copies every `cibo.*`
 * localStorage key into the file (the timer key to its own file) and then
 * clears them — one-way, one-time; the stand-in era ends at that launch.
 *
 * FAILURE IS NEVER A GATE: outside Tauri (plain `npm run dev` in a browser),
 * or if the file layer errors at init, the store falls back to localStorage
 * passthrough — behaviour-identical to the stand-in era.
 */

const SETTINGS_FILE = "settings.json";
const TIMER_FILE = "timer-heartbeat.json";
/** The stand-in era's timer key — migrated into TIMER_FILE, and still the
 * passthrough key outside Tauri. */
const LEGACY_TIMER_KEY = "cibo-timer-state-v1";

/**
 * Are we inside a Tauri webview? THE app-wide answer (exported 2026-08-04 —
 * eight modules had declared this byte-identically).
 *
 * It lives HERE rather than in `shell/safeWindow` — the natural-looking home —
 * because this module is deliberately dependency-free: `main.tsx` awaits it
 * before any app module evaluates, and safeWindow statically imports the Tauri
 * window API. A boot-path module cannot pull that in.
 */
export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type FsMod = typeof import("@tauri-apps/plugin-fs");

let fs: FsMod | null = null;
let baseDir: number | null = null;
/** True once init decided the file layer works; false = localStorage passthrough. */
let fileMode = false;

const cache = new Map<string, string>();
let timerRaw: string | null = null;

let warned = false;
const warnOnce = (e: unknown): void => {
  if (warned) return;
  warned = true;
  console.warn("deviceStore: file write failed — settings hold in memory this session:", e);
};

// ── coalesced flushing (one write in flight per file, dirty re-flushes) ──────

let settingsWriting = false;
let settingsDirty = false;
async function flushSettings(): Promise<void> {
  if (!fileMode || fs == null || baseDir == null) return;
  if (settingsWriting) {
    settingsDirty = true;
    return;
  }
  settingsWriting = true;
  try {
    do {
      settingsDirty = false;
      const body = JSON.stringify({ version: 1, values: Object.fromEntries(cache) }, null, 2);
      await fs.writeTextFile(SETTINGS_FILE, body, { baseDir });
    } while (settingsDirty);
  } catch (e) {
    warnOnce(e);
  } finally {
    settingsWriting = false;
  }
}

let timerWriting = false;
let timerDirty = false;
async function flushTimer(): Promise<void> {
  if (!fileMode || fs == null || baseDir == null) return;
  if (timerWriting) {
    timerDirty = true;
    return;
  }
  timerWriting = true;
  try {
    do {
      timerDirty = false;
      if (timerRaw == null) {
        // Absent file = clean state, the crash-detection invariant.
        if (await fs.exists(TIMER_FILE, { baseDir })) await fs.remove(TIMER_FILE, { baseDir });
      } else {
        await fs.writeTextFile(TIMER_FILE, timerRaw, { baseDir });
      }
    } while (timerDirty);
  } catch (e) {
    warnOnce(e);
  } finally {
    timerWriting = false;
  }
}

// ── the store API (localStorage-shaped on purpose) ───────────────────────────

export const deviceGet = (key: string): string | null => {
  if (!fileMode) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return cache.get(key) ?? null;
};

export const deviceSet = (key: string, value: string | null): void => {
  if (!fileMode) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* per-device sugar */
    }
    return;
  }
  if (value === null) cache.delete(key);
  else cache.set(key, value);
  void flushSettings();
};

/** The timer heartbeat file's raw payload (timerStore owns the shape). */
export const timerGet = (): string | null => {
  if (!fileMode) {
    try {
      return localStorage.getItem(LEGACY_TIMER_KEY);
    } catch {
      return null;
    }
  }
  return timerRaw;
};

export const timerSet = (raw: string | null): void => {
  if (!fileMode) {
    try {
      if (raw === null) localStorage.removeItem(LEGACY_TIMER_KEY);
      else localStorage.setItem(LEGACY_TIMER_KEY, raw);
    } catch {
      /* recovery just has nothing */
    }
    return;
  }
  timerRaw = raw;
  void flushTimer();
};

// ── launch ───────────────────────────────────────────────────────────────────

/**
 * Load (or migrate) the files into memory. main.tsx AWAITS this before the
 * app's modules load — the ordering is what makes every synchronous read safe.
 * Never rejects: any failure falls back to localStorage passthrough.
 */
export async function initDeviceStore(): Promise<void> {
  if (!inTauri()) return; // browser dev — passthrough stands
  try {
    fs = await import("@tauri-apps/plugin-fs");
    baseDir = fs.BaseDirectory.AppLocalData;
    if (await fs.exists(SETTINGS_FILE, { baseDir })) {
      const parsed = JSON.parse(await fs.readTextFile(SETTINGS_FILE, { baseDir })) as {
        values?: Record<string, unknown>;
      };
      for (const [k, v] of Object.entries(parsed.values ?? {}))
        if (typeof v === "string") cache.set(k, v);
      if (await fs.exists(TIMER_FILE, { baseDir })) timerRaw = await fs.readTextFile(TIMER_FILE, { baseDir });
      fileMode = true;
      return;
    }
    // First file-era launch: migrate the localStorage stand-ins, then clear
    // them so there is exactly one source of truth from here on.
    const migrated: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        if (k === LEGACY_TIMER_KEY) {
          timerRaw = localStorage.getItem(k);
          migrated.push(k);
        } else if (k.startsWith("cibo.")) {
          const v = localStorage.getItem(k);
          if (v != null) cache.set(k, v);
          migrated.push(k);
        }
      }
    } catch {
      /* unreadable localStorage — the file era starts empty, defaults stand */
    }
    fileMode = true;
    await flushSettings();
    await flushTimer();
    try {
      for (const k of migrated) localStorage.removeItem(k);
    } catch {
      /* leftovers are inert — nothing reads them any more */
    }
    if (migrated.length > 0)
      console.info(`deviceStore: migrated ${migrated.length} localStorage key(s) to ${SETTINGS_FILE}`);
  } catch (e) {
    // The file layer failed — the stand-in behaviour is still correct.
    fileMode = false;
    console.error("deviceStore: init failed — falling back to localStorage:", e);
  }
}
