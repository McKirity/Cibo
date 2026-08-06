/**
 * The app-wide icon roster — the shell's lucide-path vocabulary for doors and
 * actions (which are never data, per Iconography; the DATA icons — habits —
 * live in shell/habitIcons.tsx). `Ico` is path-only, `.ico` class, stroke
 * styled by kit.css — the shape per-file glyph constants adopted without
 * markup change when THE MIGRATION WAVE RAN (2026-08-04, the third audit's
 * dedup pass: ~45 literal call sites became ICONS.* references; bits.tsx has
 * imported from here since the kit hoist). The deliberate divergences that
 * stay are annotated at their sites (TrackedPicker's search, CS's chevron).
 *
 * Path-only by contract: shapes drawn as <rect>/<circle> in the per-file
 * copies (pause · stop · clock) are expressed as equivalent paths here.
 */
export function Ico({
  d,
  size,
  className = "ico",
}: {
  d: string[];
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      style={size != null ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

/** The recurring glyphs, by plain name (bits' ICON-map style). */
export const ICONS = {
  plus: ["M5 12h14", "M12 5v14"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  /** The disclosure caret (points down). */
  chevron: ["m6 9 6 6 6-6"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  back: ["m12 19-7-7 7-7", "M19 12H5"],
  forward: ["M5 12h14", "m12 5 7 7-7 7"],
  check: ["M20 6 9 17l-5-5"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
  calendar: [
    "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M16 2v4",
    "M8 2v4",
    "M3 10h18",
  ],
  trash: [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  warning: [
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
    "M12 9v4",
    "M12 17h.01",
  ],
  retry: ["M23 4v6h-6", "M20.49 15a9 9 0 1 1-2.12-9.36L23 10"],
  play: ["M7 4l13 8-13 8z"],
  pause: ["M6 4h4v16H6z", "M14 4h4v16H14z"],
  stop: ["M5 5h14v14H5z"],
  timer: ["M10 2h4", "M12 14l3-3", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 8v4l3 2"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
};
