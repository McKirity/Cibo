/**
 * Daily — the app's front door. "Launch opens to Daily; there is NO homepage."
 *
 * State 1, the working day: two stacked regions inside the content canvas —
 * the TRIPTYCH (sky | form spine | almanac) over the MYSTICAL SHELF.
 *
 * The layout ruling this screen exists to honour: the triptych is
 * **content-sized to the almanac's population** and floored by `--triptych-min`
 * (the sky column's comfortable minimum — "sky sets the minimum, almanac sets
 * the maximum"); the shelf takes the remainder. Columns NEVER scroll
 * internally — past the fold, the PANE scrolls. Only the form spine is
 * height-neutralized, because its internal scroll is the logging form's own
 * designed behaviour, not a whimsy column's.
 *
 * STATE 2 — the cover wall — landed 2026-07-27. Which state this screen shows
 * is one question: does the day's `days` row carry `finalized`? The flag is the
 * sole finalize truth, and finalize is the GENERATIVE condition, not a view
 * flip: "a day's cover wall can only populate once the day is finalized."
 *
 * EDIT DAY is the one exception, and it does NOT move the flag. A finalized day
 * stays editable behind the light affordance and "remains finalized through the
 * edit — no unlock → edit → re-finalize dance" ([[Day Finalize & Catch-Up]]),
 * so `editing` is view state and nothing else.
 *
 * STATE 1 IS A CHILD COMPONENT (2026-07-30 dedup/efficiency pass): the wall
 * used to render below the working day's hooks, which kept the whole form tier,
 * the 60 s minute tick and the almanac queries mounted behind every finalized
 * day. `Daily` itself now holds only what BOTH states need — the finalize
 * question, the whimsy config, and today's feed capture (the capture must fire
 * on a finalized today too: the wall's ephemeral tiles read the snapshot).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { DateOnly } from "../db/schema";
import { todayLocal } from "../metrics/clock";
import { Spine } from "./Spine";
import { CoverWall } from "./CoverWall";
import {
  CountdownsCard,
  FactCard,
  HolidayCard,
  HoroscopeCard,
  LifetimeCard,
  MoonCard,
  OnThisDayCard,
  QuoteCard,
  RediscoverCard,
  SeasonCard,
  SunCard,
  TarotCard,
  TimeProgressCard,
  TonightSkyCard,
  WeatherCard,
  WordCard,
  skyInputs,
} from "./cards";
import { anniversariesFor, trackingAnniversary } from "./almanac";
import { appAnniversary, ensureAppStartDate } from "../db/appStart";
import { cardOn, loadWhimsyConfig, type WhimsyConfig } from "./whimsyConfig";
import { parseFeedSnapshot } from "./feedData";
import { catchUpDays, unfinalizedQuery } from "./catchUp";
import { ensureTodayFeeds } from "./feeds";
import "./daily.css";

/** Days that already carry bookkeeping — the pool Rediscover draws from. */
const loggedDaysQuery = evolu.createQuery((db) =>
  db.selectFrom("days").select(["date"]).where("isDeleted", "is not", 1).orderBy("date", "desc"),
);

/**
 * The first session per habit — the on-this-day timeline's personal row is built
 * from these ("3 years since your first Reading session"). Grouped in SQL rather
 * than pulled whole: the seeded store holds thousands of sessions and this only
 * ever needs one row per habit.
 */
const firstSessionsQuery = evolu.createQuery((db) =>
  db
    .selectFrom("sessions")
    .select((eb) => ["habit_fk", eb.fn.min("day").as("first_day")])
    .where("isDeleted", "is not", 1)
    .groupBy("habit_fk"),
);

const habitNamesQuery = evolu.createQuery((db) =>
  db.selectFrom("habits").select(["id", "name"]).where("isDeleted", "is not", 1),
);

/** Store-wide totals for the Lifetime card — the lifetime of the TRACKING. */
const sessionCountQuery = evolu.createQuery((db) =>
  db.selectFrom("sessions").select((eb) => eb.fn.countAll<number>().as("n")).where("isDeleted", "is not", 1),
);
const entryCountQuery = evolu.createQuery((db) =>
  db.selectFrom("entries").select((eb) => eb.fn.countAll<number>().as("n")).where("isDeleted", "is not", 1),
);

/**
 * The app's own start date — written once at launch (bootstrap.tsx) and never
 * changed while the app runs, so ONE module-level read serves every Daily
 * mount instead of re-running the ensure round-trip per navigation
 * (2026-07-30 dedup).
 */
let appStartOnce: Promise<string | null> | null = null;
const loadAppStart = (): Promise<string | null> =>
  (appStartOnce ??= ensureAppStartDate(evolu));

export function Daily({
  dayKey = todayLocal(),
  onOpenDay,
  onOpenEntry,
}: {
  dayKey?: string;
  onOpenDay?: (day: string) => void;
  onOpenEntry?: (entryId: string, habitKey: string | null) => void;
}) {
  // Read once per mount — Settings → Whimsy is the only writer now (the dev
  // whimsy panel died with the dev surface, 2026-08-04), and navigating to
  // Settings and back re-mounts this screen, so the read stays fresh.
  const [config] = useState<WhimsyConfig>(loadWhimsyConfig);
  // View state ONLY — Edit day never touches the finalize flag.
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [dayKey]);

  const dayStateQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("days")
          .select(["id", "finalized", "feed_snapshot"])
          .where("isDeleted", "is not", 1)
          .where("date", "=", DateOnly.orThrow(dayKey)),
      ),
    [dayKey],
  );
  const dayState = useQuery(dayStateQuery);
  const finalized = dayState[0]?.finalized === 1;

  const isToday = dayKey === todayLocal();

  // THE CAPTURE MOMENT — fetch-on-open, for the current day only ("Calendar &
  // Whimsy" § network behaviour). Past days never fetch: their snapshot is
  // whatever was captured then, and absence is honest and permanent. Re-runs
  // when the config changes (the dev panel / future Settings); feeds.ts
  // throttles retries internally, so this can never poll. Lives HERE, not in
  // the working-day child: a finalized today still captures for its wall.
  useEffect(() => {
    if (isToday) void ensureTodayFeeds(config);
  }, [isToday, config]);

  if (finalized && !editing)
    return (
      <CoverWall
        dayKey={dayKey}
        onEditDay={() => setEditing(true)}
        onOpenEntry={onOpenEntry}
      />
    );

  return (
    <WorkingDay
      dayKey={dayKey}
      isToday={isToday}
      config={config}
      feedSnapshotRaw={dayState[0]?.feed_snapshot != null ? String(dayState[0].feed_snapshot) : null}
      onOpenDay={onOpenDay}
      onFinalized={() => setEditing(false)}
    />
  );
}

/**
 * The Lifetime/OnThisDay cards' store-wide figures, as a DEBOUNCED SNAPSHOT
 * rather than three live whole-`sessions` subscriptions (`useMilestoneDay`'s
 * pattern and rationale — Daily is where you type, and a live whole-store
 * query on the front door re-runs on every mutation). `revision` is any cheap
 * string that changes when the day's rows change; a change schedules a re-read,
 * the first read runs immediately.
 */
interface LifetimeSnapshot {
  firstSessions: Array<{ habitId: string; firstDay: string }>;
  sessionCount: number;
  entryCount: number;
}

function useLifetimeSnapshot(dayKey: string, revision: string): LifetimeSnapshot | null {
  const [snap, setSnap] = useState<LifetimeSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const [firsts, sess, ents] = await Promise.all([
        evolu.loadQuery(firstSessionsQuery),
        evolu.loadQuery(sessionCountQuery),
        evolu.loadQuery(entryCountQuery),
      ]);
      if (cancelled) return;
      setSnap({
        firstSessions: firsts
          .filter((r) => r.first_day != null && r.habit_fk != null)
          .map((r) => ({ habitId: String(r.habit_fk), firstDay: String(r.first_day) })),
        sessionCount: Number(sess[0]?.n ?? 0),
        entryCount: Number(ents[0]?.n ?? 0),
      });
    };
    // First read is immediate; a change to the day's rows schedules the next
    // one far enough out that a burst of field commits reads the store once.
    const delay = snap == null ? 0 : 600;
    const t = setTimeout(() => void run(), delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, revision]);

  return snap;
}

/** STATE 1 — the working day. Mounted only while the day is open (or edited). */
function WorkingDay({
  dayKey,
  isToday,
  config,
  feedSnapshotRaw,
  onOpenDay,
  onFinalized,
}: {
  dayKey: string;
  isToday: boolean;
  config: WhimsyConfig;
  feedSnapshotRaw: string | null;
  onOpenDay?: (day: string) => void;
  onFinalized: () => void;
}) {
  // The day's ephemeral content — whatever was snapshotted at its own fetch
  // moment. A live read: today's capture lands seconds after mount and the
  // three cards fill in as it does.
  const snapshot = useMemo(() => parseFeedSnapshot(feedSnapshotRaw), [feedSnapshotRaw]);

  // A ticking clock: the sun's position and the day meter are live values. A
  // minute is plenty — nothing here moves faster.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dayRows = useQuery(loggedDaysQuery);
  const pastDays = useMemo(
    () => dayRows.map((r) => String(r.date)).filter((d) => d < dayKey),
    [dayRows, dayKey],
  );

  // Pure functions of (dayKey, config) — the ticking disc reads `now` at render.
  const { sun, moon } = useMemo(() => skyInputs(dayKey, config), [dayKey, config]);

  // The snapshot's revision source: a day-scoped live query is cheap (the
  // useMilestoneDay pattern — day-scoped signal, debounced whole-store read).
  const dayRevQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("sessions")
          .select(["id", "updatedAt"])
          .where("isDeleted", "is not", 1)
          .where("day", "=", DateOnly.orThrow(dayKey)),
      ),
    [dayKey],
  );
  const dayRevRows = useQuery(dayRevQuery);
  const revision = useMemo(
    () => dayRevRows.map((r) => `${r.id}:${String(r.updatedAt)}`).join("|"),
    [dayRevRows],
  );
  const lifetime = useLifetimeSnapshot(dayKey, revision);

  // The on-this-day timeline's personal row, derived from the store.
  const habitRows = useQuery(habitNamesQuery);
  const { anniversaries, trackingYears } = useMemo(() => {
    const names = new Map(habitRows.map((h) => [String(h.id), String(h.name)]));
    const firsts = (lifetime?.firstSessions ?? [])
      .map((r) => ({ name: names.get(r.habitId) ?? "", day: r.firstDay }))
      .filter((f) => f.name !== "");
    const earliest = firsts.reduce<string | null>(
      (min, f) => (min === null || f.day < min ? f.day : min),
      null,
    );
    return {
      anniversaries: anniversariesFor(firsts, dayKey),
      trackingYears: trackingAnniversary(earliest, dayKey),
    };
  }, [lifetime, habitRows, dayKey]);

  // The app's own start date — a plain `app_meta` read (module-cached), not a
  // live query: it is written once at launch and never changes while the app runs.
  const [appStart, setAppStart] = useState<string | null>(null);
  useEffect(() => {
    void loadAppStart().then(setAppStart);
  }, []);
  const appYears = useMemo(() => appAnniversary(appStart, dayKey), [appStart, dayKey]);

  // Unfinalized days before the viewed one — today is not "behind". No cap:
  // the card's whole job is naming WHICH days (re-ruled 2026-07-31; the old
  // slice(0,4) silently dropped the tail), and the chips wrap.
  const unfinalizedRows = useQuery(unfinalizedQuery);
  const catchUp = useMemo(() => catchUpDays(unfinalizedRows, dayKey), [unfinalizedRows, dayKey]);

  // Per-card toggles (Settings → Whimsy). `sky` governs the sky column's four
  // ambient cards, `moon` its own; `almanac` the fact/holiday/progress trio.
  // A column whose every card is off is not rendered at all — an empty stack
  // would read as broken, and the flex row redistributes the room.
  const skyOn = cardOn(config, "sky");
  const moonOn = cardOn(config, "moon");
  const almOn = cardOn(config, "almanac");
  const otdOn = cardOn(config, "otd");
  const horoOn = cardOn(config, "horoscope");
  const tarotOn = cardOn(config, "tarot");
  const redOn = cardOn(config, "rediscover");
  const cdOn = cardOn(config, "countdowns");
  const lifeOn = cardOn(config, "lifetime");
  const quoteOn = cardOn(config, "quote");
  const wordOn = cardOn(config, "word");
  const showSkyCol = skyOn || moonOn;
  /* ⚠ `catchUp.length > 0` LEFT THIS TEST 2026-08-11. The catch-up card used to
     live in the almanac column, so a single unfinalized day held a 330px column
     open beside the habits even with every whimsy card switched off — the floor
     the user asked to remove. It is a banner over the spine now, and the almanac
     column exists only for almanac CARDS. */
  const showAlmanacCol = quoteOn || wordOn || almOn || otdOn;
  /* THE SHELF IS NOT DRAWN WHEN IT IS EMPTY (2026-08-11). It carries
     `min-height: var(--shelf-height)` and `flex: 1 0 auto` — right while it holds
     cards, and a band of reserved emptiness once every card is switched off. */
  const showShelf = horoOn || tarotOn || redOn || cdOn || lifeOn;
  /* The triptych declares THREE fixed tracks, so hiding an outer column used to
     leave the spine auto-placed into the track beside it — with both off, the
     habits sat in the 380px sky track and two empty tracks followed them. The
     modifier tells the sheet how many tracks to declare; the sheet keeps the
     geometry (small.css re-values the dials, and a theme may not touch either). */
  const triptychCls = [
    "triptych",
    showSkyCol ? "" : "no-sky",
    showAlmanacCol ? "" : "no-almanac",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={showSkyCol || showAlmanacCol ? "daily" : "daily spine-only"}>
      <div className={triptychCls}>
        {/* The sky column: stable geometry, the same cards every day. Its inner
            .sky-stack is what the FINAL flexes the cards inside. */}
        {showSkyCol && (
          <div className="col sky">
            <div className="sky-stack">
              {skyOn && <SunCard sun={sun} lat={config.lat} lon={config.lon} dayKey={dayKey} now={now} />}
              {skyOn && (
                <WeatherCard
                  snap={snapshot.weather ?? null}
                  unit={config.tempUnit}
                  isToday={isToday}
                  now={now}
                />
              )}
              {skyOn && <SeasonCard dayKey={dayKey} lat={config.lat} />}
              {moonOn && <MoonCard moon={moon} />}
              {skyOn && <TonightSkyCard dayKey={dayKey} lat={config.lat} />}
            </div>
          </div>
        )}

        <div className="col spine">
          <Spine
            dayKey={dayKey}
            onFinalized={onFinalized}
            banner={
              catchUp.length > 0 ? <CatchUpCard days={catchUp} onOpenDay={onOpenDay} /> : undefined
            }
          />
        </div>

        {showAlmanacCol && (
          <div className="col almanac">
            {quoteOn && <QuoteCard dayKey={dayKey} />}
            {wordOn && <WordCard dayKey={dayKey} />}
            {almOn && <FactCard dayKey={dayKey} />}
            {otdOn && (
              <OnThisDayCard
                dayKey={dayKey}
                anniversaries={anniversaries}
                trackingYears={trackingYears}
                appYears={appYears}
              />
            )}
            {almOn && <HolidayCard dayKey={dayKey} />}
            {almOn && <TimeProgressCard dayKey={dayKey} now={now} />}
          </div>
        )}
      </div>

      {showShelf && (
      <div className="shelf">
        {horoOn && (
          <HoroscopeCard config={config} reading={snapshot.horoscope ?? null} isToday={isToday} />
        )}
        {tarotOn && <TarotCard draw={snapshot.tarot ?? null} isToday={isToday} />}
        {/* "Upgraded in the new model: a DOOR to that day's cover wall" — live
            since the wall exists. */}
        {redOn && <RediscoverCard dayKey={dayKey} pastDays={pastDays} onOpenDay={onOpenDay} />}
        {cdOn && <CountdownsCard config={config} dayKey={dayKey} />}
        {lifeOn && (
          <LifetimeCard
            daysTracked={dayRows.length}
            sessions={lifetime?.sessionCount ?? 0}
            entries={lifetime?.entryCount ?? 0}
          />
        )}
      </div>
      )}

    </div>
  );
}

const CATCH_WD = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const CATCH_MD = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/**
 * The catch-up card. Drawn-vs-described: the frozen state-1 file STYLES `.catch`
 * and never renders it — the writing-rail-banner situation exactly, and it is
 * built for the same reason (described, styled, and the only thing missing was
 * the markup).
 *
 * RE-SHAPED 2026-07-31 (user-ruled): presence IS the signal, so the card is one
 * wrapping line — dot + "Still open" + date-bearing day chips — no prose, no
 * count. Weekday alone was ambiguous past a week (two Mondays, nothing to tell
 * them apart), so every chip carries its date; yesterday reads as "Yesterday"
 * relative to the REAL today, never the viewed day.
 *
 * Each chip is a door. This is the queue's SECOND door — the rail's catch-up
 * flag + popover (step 9, landed 2026-08-01) is the first, and the query they
 * share lives in `catchUp.ts`: one queue, seen twice. Functional, not whimsy —
 * the card never folds into the wall and is exempt from whimsy-fails-silent;
 * membership is exactly the sparse ledger's unfinalized rows, so an untouched
 * day never enters the queue (it stays a door on the nav calendar).
 */
function CatchUpCard({
  days,
  onOpenDay,
}: {
  days: string[];
  onOpenDay?: (day: string) => void;
}) {
  const y = new Date(`${todayLocal()}T12:00:00`);
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  return (
    <div className="card catch">
      <span className="dot" />
      <span className="lbl">Still open</span>
      {days.map((d) => {
        const noon = new Date(`${d}T12:00:00`);
        return (
          <button key={d} className="day" onClick={onOpenDay ? () => onOpenDay(d) : undefined}>
            {d === yesterday ? (
              <b>Yesterday</b>
            ) : (
              <>
                <b>{CATCH_WD.format(noon)}</b>
                <span>{CATCH_MD.format(noon)}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
