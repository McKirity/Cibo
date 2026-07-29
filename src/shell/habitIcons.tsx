/**
 * The habit-icon registry — ICONS AS DATA ([[Iconography]]: a habit's icon is
 * a stored lucide NAME in `habits.icon`; lettermark = the ruled fallback).
 *
 * Until 2026-07-27 this data existed nowhere: the assignments lived only as
 * hand-placed SVGs in the mockups' DOM (which dies by law), the seed's source
 * registry carried no icon column, and the lettermark fallback made the empty
 * column look finished. Seed batch 7 plants the seven names the frozen frame
 * draws; this file is their renderer. The archived four (embroidery · drawing
 * · coding · gamedev) have NO drawn assignment and stay lettermarks until the
 * user picks in the step-10 creator — whose kit-picker-icon inherits this
 * roster as its starting inventory.
 *
 * Path data is the frozen frame's, verbatim (lines/rects hand-converted to
 * path commands — one shape vocabulary). Keyed by lucide name, never by habit:
 * the column stores the name, so a user-picked icon renders through the same
 * door.
 */

/** lucide name → stroke path list (24×24 viewBox, the `.ico` contract). */
export const ICON_PATHS: Record<string, string[]> = {
  // Writing
  pencil: ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"],
  // Gaming
  "gamepad-2": [
    "M6 11h4",
    "M8 9v4",
    "M15 12h.01",
    "M18 10h.01",
    "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",
  ],
  // Reading
  "book-open": [
    "M12 7v14",
    "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
  ],
  // Media
  clapperboard: [
    "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z",
    "m6.2 5.3 3.1 3.9",
    "m12.4 3.4 3.1 4",
    "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  ],
  // Keyboard
  keyboard: [
    "M10 8h.01",
    "M12 12h.01",
    "M14 8h.01",
    "M16 12h.01",
    "M18 8h.01",
    "M6 8h.01",
    "M7 16h10",
    "M8 12h.01",
    "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
  ],
  // Sleep
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  // Walking
  footprints: [
    "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",
    "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",
    "M16 17h4",
    "M4 13h4",
  ],

  // — The archived four (seed batch 9, 2026-07-27): the OLD PLUGIN's own
  //   assignments (Reference/Old Source Homepage.tsx HABIT_ICON_BY_KEY),
  //   except Drawing — the old "pencil" is Writing's under the new frame's
  //   frozen face, so Drawing wears the brush. Circles hand-converted to
  //   arc paths (the one-shape-vocabulary rule).

  // Embroidery
  scissors: [
    "M6 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
    "M6 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
    "M8.12 8.12 12 12",
    "M20 4 8.12 15.88",
    "M14.8 14.8 20 20",
  ],
  // Drawing
  brush: [
    "m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08",
    "M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z",
  ],
  // Coding
  code: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  // Gamedev
  joystick: [
    "M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z",
    "M6 15v-2",
    "M12 15V9",
    "M12 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
  ],
};

/**
 * The stored icon, or null when the name is absent/unknown — the caller
 * renders its own lettermark fallback (the fallback's SHAPE is per-surface:
 * a letter in the rail swatch, a colour dot in a comparison tile).
 */
export function HabitIcon({
  icon,
  className = "ico",
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const paths = icon != null ? ICON_PATHS[icon] : undefined;
  if (paths == null) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export const hasIcon = (icon: string | null | undefined): boolean =>
  icon != null && ICON_PATHS[icon] != null;
