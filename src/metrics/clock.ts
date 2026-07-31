/**
 * Clock-READING siblings of the deliberately clock-free metrics/dates.ts —
 * dates.ts stays pure ("today" is always passed in, never read) so metrics
 * memoize and test deterministically; the surfaces that must actually read the
 * wall clock read it here, once, in the schema's local string forms.
 */

/** 2-digit zero pad: 7 → "07". */
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Local wall-clock "YYYY-MM-DD" — the schema's day label (Day Boundary & Logging Cutoff). */
export const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Local "YYYY-MM-DDTHH:MM" — the stored datetime form (finalized_at, session bounds). */
export const nowLocalDateTime = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
