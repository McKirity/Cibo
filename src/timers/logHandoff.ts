/**
 * Build step 7 — the FORM-FIRST hand-off mailbox.
 *
 * "Stopping hands accumulated durations to the log form, which writes the
 * sessions — the timer never writes a session directly." The log form is
 * Daily's spine, so the manage window stages items here and the spine's
 * strips consume them into PREFILLED DRAFTS (one summed session per tracked
 * item, `source: "timer"`). Everything after that is the spine's own ruled
 * machinery — buffered unofficial saves, the autosave flush, Finalize.
 *
 * In-memory by design: the accumulators the mailbox holds were already
 * persisted by the timer store until the moment they were staged, and a
 * staged item reaches the form on the next Daily paint.
 */

export interface HandoffItem {
  habitId: string;
  entryId: string | null;
  minutes: number;
}

let box: HandoffItem[] = [];
let version = 0;
const listeners = new Set<() => void>();

export const stageHandoff = (items: HandoffItem[]): void => {
  if (items.length === 0) return;
  box = [...box, ...items];
  version++;
  for (const l of listeners) l();
};

/** Pull (and consume) the staged items for one habit. */
export const takeHandoffFor = (habitId: string): HandoffItem[] => {
  const mine = box.filter((i) => i.habitId === habitId);
  if (mine.length > 0) box = box.filter((i) => i.habitId !== habitId);
  return mine;
};

export const handoffVersion = (): number => version;

export const subscribeHandoff = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** How many items sit staged (the manage window's "waiting for the form" note). */
export const stagedCount = (): number => box.length;
