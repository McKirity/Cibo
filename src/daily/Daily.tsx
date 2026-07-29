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
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { DateOnly } from "../db/schema";
import { Spine } from "./Spine";
import { CoverWall } from "./CoverWall";
import { DevWhimsyPanel } from "./DevWhimsyPanel";
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
import { loadWhimsyConfig, saveWhimsyConfig, type WhimsyConfig } from "./whimsyConfig";
import { parseFeedSnapshot } from "./feedData";
import { ensureTodayFeeds } from "./feeds";
import "./daily.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
 * The catch-up queue's SECOND door — the conditional card on Daily's
 * unfinalized state ("Monday is still open — finish it"), for the
 * log-a-day-late habit. Functional, not whimsy: it never folds into the wall
 * and it is exempt from whimsy-fails-silent.
 *
 * The queue's membership is exactly the `days` rows whose `finalized` is
 * false — the ledger is SPARSE, so a day never touched has no row and never
 * enters the queue; it stays a door on the nav calendar. The first door, the
 * rail's catch-up FLAG and its popover, belongs to step 9's nav calendar and is
 * deliberately not built here.
 */
const unfinalizedQuery = evolu.createQuery((db) =>
  db
    .selectFrom("days")
    .select(["date"])
    .where("isDeleted", "is not", 1)
    .where("finalized", "=", 0)
    .orderBy("date", "desc"),
);

export function Daily({
  dayKey = todayLocal(),
  onOpenDay,
  onOpenEntry,
}: {
  dayKey?: string;
  onOpenDay?: (day: string) => void;
  onOpenEntry?: (entryId: string, habitKey: string | null) => void;
}) {
  const [config, setConfig] = useState<WhimsyConfig>(loadWhimsyConfig);
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

  // The day's ephemeral content — whatever was snapshotted at its own fetch
  // moment. A live read: today's capture lands seconds after mount and the
  // three cards fill in as it does.
  const snapshot = useMemo(
    () =>
      parseFeedSnapshot(
        dayState[0]?.feed_snapshot != null ? String(dayState[0].feed_snapshot) : null,
      ),
    [dayState],
  );

  const isToday = dayKey === todayLocal();

  // THE CAPTURE MOMENT — fetch-on-open, for the current day only ("Calendar &
  // Whimsy" § network behaviour). Past days never fetch: their snapshot is
  // whatever was captured then, and absence is honest and permanent. Re-runs
  // when the config changes (the dev panel / future Settings); feeds.ts
  // throttles retries internally, so this can never poll.
  useEffect(() => {
    if (isToday) void ensureTodayFeeds(config);
  }, [isToday, config]);
  // A ticking clock: the sun's position, the sky gradient and the day meter are
  // all live values. A minute is plenty — nothing here moves faster.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const updateConfig = (next: WhimsyConfig) => {
    setConfig(next);
    saveWhimsyConfig(next);
  };

  const dayRows = useQuery(loggedDaysQuery);
  const pastDays = useMemo(
    () => dayRows.map((r) => String(r.date)).filter((d) => d < dayKey),
    [dayRows, dayKey],
  );

  // Recomputed when the config or the minute changes — every card in this tier
  // is a pure function of (dayKey, config, now).
  const { sun, moon } = useMemo(() => skyInputs(dayKey, config, now), [dayKey, config, now]);

  // The on-this-day timeline's personal row, derived from the store.
  const firstSessions = useQuery(firstSessionsQuery);
  const habitRows = useQuery(habitNamesQuery);
  const { anniversaries, trackingYears } = useMemo(() => {
    const names = new Map(habitRows.map((h) => [String(h.id), String(h.name)]));
    const firsts = firstSessions
      .filter((r) => r.first_day != null)
      .map((r) => ({ name: names.get(String(r.habit_fk)) ?? "", day: String(r.first_day) }))
      .filter((f) => f.name !== "");
    const earliest = firsts.reduce<string | null>(
      (min, f) => (min === null || f.day < min ? f.day : min),
      null,
    );
    return {
      anniversaries: anniversariesFor(firsts, dayKey),
      trackingYears: trackingAnniversary(earliest, dayKey),
    };
  }, [firstSessions, habitRows, dayKey]);

  const sessionCount = Number(useQuery(sessionCountQuery)[0]?.n ?? 0);
  const entryCount = Number(useQuery(entryCountQuery)[0]?.n ?? 0);

  // The app's own start date — a plain `app_meta` read, not a live query: it is
  // written once at launch and never changes while the app runs.
  const [appStart, setAppStart] = useState<string | null>(null);
  useEffect(() => {
    void ensureAppStartDate(evolu).then(setAppStart);
  }, []);
  const appYears = useMemo(() => appAnniversary(appStart, dayKey), [appStart, dayKey]);

  // Recent unfinalized days, today excluded — today is not "behind".
  const unfinalizedRows = useQuery(unfinalizedQuery);
  const catchUp = useMemo(
    () => unfinalizedRows.map((r) => String(r.date)).filter((d) => d < dayKey).slice(0, 4),
    [unfinalizedRows, dayKey],
  );

  if (finalized && !editing)
    return (
      <CoverWall
        dayKey={dayKey}
        onEditDay={() => setEditing(true)}
        onOpenEntry={onOpenEntry}
      />
    );

  return (
    <div className="daily">
      <div className="triptych">
        {/* The sky column: stable geometry, the same cards every day. Its inner
            .sky-stack is what the FINAL flexes the cards inside. */}
        <div className="col sky">
          <div className="sky-stack">
            <SunCard sun={sun} lon={config.lon} now={now} />
            <WeatherCard
              snap={snapshot.weather ?? null}
              unit={config.tempUnit}
              isToday={isToday}
              now={now}
            />
            <SeasonCard dayKey={dayKey} lat={config.lat} />
            <MoonCard moon={moon} />
            <TonightSkyCard dayKey={dayKey} lat={config.lat} />
          </div>
        </div>

        <div className="col spine">
          <Spine dayKey={dayKey} onFinalized={() => setEditing(false)} />
        </div>

        <div className="col almanac">
          {catchUp.length > 0 && <CatchUpCard days={catchUp} onOpenDay={onOpenDay} />}
          <QuoteCard dayKey={dayKey} />
          <WordCard dayKey={dayKey} />
          <FactCard dayKey={dayKey} />
          <OnThisDayCard
            dayKey={dayKey}
            anniversaries={anniversaries}
            trackingYears={trackingYears}
            appYears={appYears}
          />
          <HolidayCard dayKey={dayKey} />
          <TimeProgressCard dayKey={dayKey} now={now} />
        </div>
      </div>

      <div className="shelf">
        <HoroscopeCard config={config} reading={snapshot.horoscope ?? null} isToday={isToday} />
        <TarotCard draw={snapshot.tarot ?? null} isToday={isToday} />
        {/* "Upgraded in the new model: a DOOR to that day's cover wall" — live
            since the wall exists. */}
        <RediscoverCard dayKey={dayKey} pastDays={pastDays} onOpenDay={onOpenDay} />
        <CountdownsCard config={config} dayKey={dayKey} />
        <LifetimeCard daysTracked={dayRows.length} sessions={sessionCount} entries={entryCount} />
      </div>

      {import.meta.env.DEV && <DevWhimsyPanel config={config} onChange={updateConfig} />}
    </div>
  );
}

const CATCH_WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });

/**
 * The catch-up card. Drawn-vs-described: the frozen state-1 file STYLES `.catch`
 * and never renders it — the writing-rail-banner situation exactly, and it is
 * built for the same reason (described, styled, and the only thing missing was
 * the markup).
 *
 * Each listed day is a door. "Open the catch-up queue" — the popover the ruling
 * gives the rail's flag — waits for step 9's nav calendar; until then this card
 * IS the queue, which is what the ruling calls a second door to the same
 * machinery rather than a different feature.
 */
function CatchUpCard({
  days,
  onOpenDay,
}: {
  days: string[];
  onOpenDay?: (day: string) => void;
}) {
  const first = days[0];
  const label = CATCH_WEEKDAY.format(new Date(`${first}T12:00:00`));
  return (
    <div className="card catch">
      <div className="ttl">
        <span className="dot" />
        <span className="lbl">
          {days.length === 1 ? `${label} is still open` : `${days.length} days to finalize`}
        </span>
      </div>
      <p>
        {days.length === 1
          ? "Finish it and it becomes a keepsake."
          : "Late days stay unfinalized until you close them — nothing is counted as missed in the meantime."}
      </p>
      <div className="acts">
        {days.map((d) => (
          <span
            key={d}
            className="door"
            role="button"
            tabIndex={0}
            onClick={onOpenDay ? () => onOpenDay(d) : undefined}
            onKeyDown={(e) => {
              if (onOpenDay && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onOpenDay(d);
              }
            }}
          >
            {CATCH_WEEKDAY.format(new Date(`${d}T12:00:00`))}
          </span>
        ))}
      </div>
    </div>
  );
}
