/**
 * THE PLATFORM ROOT CLASS — `.mac` (born 2026-08-18, the Mac visual pass).
 *
 * USER-RULED, the sitting this file was written in: *"It looks fine on PC,
 * don't do anything that will mess with it. Change whatever you need on mac."*
 * So macOS-only compensation needs a macOS-only hook, and the app had none —
 * only `:root.compact`, which keys off the small CANVAS and is therefore
 * entered by the PC's own MacBook preview. A fix parked there would have
 * reached the PC, which is precisely what the ruling forbids.
 *
 * Mechanism is the corpus-wide root-class doctrine, unchanged: one class on the
 * root element, mirroring `.compact` / `.reduce-effects` / `.force-opaque`.
 * `src/mac.css` is its only consumer; no screen tests the class directly.
 *
 * ⚠ IT IS DELIBERATELY NOT DERIVED FROM THE CANVAS. `.compact` describes how
 * much room there is; this describes which ENGINE and TYPEFACE are drawing —
 * WebKit + SF Pro against WebView2 + Segoe UI. The two questions have different
 * answers on the same machine (a PC in MacBook preview is compact and NOT mac),
 * which is the whole reason this exists.
 *
 * ⚠ TWO OTHER UA TESTS ALREADY EXIST and are deliberately left alone:
 * `backup/backup.ts`'s `backupsRunHere()` (the PC-is-sole-backup-point ruling)
 * and `firstrun/firstRun.ts`'s first-run UI-scale default. Both ask a different
 * question of the same fact and both are settled; re-pointing them at this
 * module is churn, not progress. This is the one owner for the CSS question.
 */

/** True on macOS. The UA test is the app's established shape for this fact. */
export const isMacOS = (): boolean => /Mac/i.test(navigator.userAgent);

/** bootstrap.tsx, beside initCompact — set once, never changes within a run. */
export function initPlatform(): void {
  document.documentElement.classList.toggle("mac", isMacOS());
}
