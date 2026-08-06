/**
 * DEEP-ACTION REQUESTS (2026-08-04, the completeness audit's re-wire batch) —
 * the bridge for components too deep to thread a Shell callback through
 * (the preset menus · dashboard empty-state doors · Daily's zero-active box ·
 * the palette's Health verbs).
 *
 * Two shapes, both tiny:
 *  · NAVIGATION — a window event the Shell listens for (it owns the View
 *    state). Stateless: navigation is idempotent.
 *  · ONE-SHOT FLAGS — the manual deep-link's creator-pending pattern: park a
 *    request, navigate, and the destination consumes it on mount (an event
 *    fired before the destination mounts would be lost); an already-mounted
 *    destination hears the paired event instead.
 */
import type { SettingsSection } from "./views";

// ── navigation ───────────────────────────────────────────────────────────────

export const NAV_SETTINGS_EVENT = "cibo:nav-settings";
export const NAV_CREATOR_EVENT = "cibo:nav-habit-creator";

/** Land on a Settings section (the Shell's settings/<section> route). */
export const requestSettingsNav = (section: SettingsSection): void => {
  window.dispatchEvent(new CustomEvent(NAV_SETTINGS_EVENT, { detail: { section } }));
};

/** Settings → Habits with the creator OPEN (the creator-pending pattern). */
export const requestHabitCreator = (): void => {
  window.dispatchEvent(new Event(NAV_CREATOR_EVENT));
};

// ── one-shots ────────────────────────────────────────────────────────────────

/** "Test connection" (palette verb): every importer row runs its probe. */
export const PROBE_ALL_EVENT = "cibo:probe-all";
let probeAllPending = false;
export const requestProbeAll = (): void => {
  probeAllPending = true;
  window.dispatchEvent(new Event(PROBE_ALL_EVENT));
};
export const consumeProbeAll = (): boolean => {
  const p = probeAllPending;
  probeAllPending = false;
  return p;
};

/** A library that mounts finding this set opens its import modal. */
let importOpenPending = false;
export const requestLibraryImport = (): void => {
  importOpenPending = true;
};
export const consumeLibraryImport = (): boolean => {
  const p = importOpenPending;
  importOpenPending = false;
  return p;
};
