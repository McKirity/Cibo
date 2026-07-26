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
 * State 2 (the cover wall at finalize) and the catch-up queue are the next
 * slice; the finalize control here is present but inert until then.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@evolu/react";
import { evolu } from "../db/evolu";
import { LogForm } from "../log/LogForm";
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
import { loadWhimsyConfig, saveWhimsyConfig, type WhimsyConfig } from "./whimsyConfig";
import "./daily.css";

const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The FINAL splits the date: a muted weekday, then the date proper. */
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Days that already carry bookkeeping — the pool Rediscover draws from. */
const loggedDaysQuery = evolu.createQuery((db) =>
  db.selectFrom("days").select(["date"]).where("isDeleted", "is not", 1).orderBy("date", "desc"),
);

export function Daily({ dayKey = todayLocal() }: { dayKey?: string }) {
  const [config, setConfig] = useState<WhimsyConfig>(loadWhimsyConfig);
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

  const holiday = <HolidayCard dayKey={dayKey} />;

  return (
    <div className="daily">
      <div className="triptych">
        {/* The sky column: stable geometry, the same cards every day. Its inner
            .sky-stack is what the FINAL flexes the cards inside. */}
        <div className="col sky">
          <div className="sky-stack">
            <SunCard sun={sun} lon={config.lon} now={now} />
            <WeatherCard />
            <SeasonCard dayKey={dayKey} lat={config.lat} />
            <MoonCard moon={moon} />
            <TonightSkyCard dayKey={dayKey} lat={config.lat} />
          </div>
        </div>

        <div className="col spine">
          {/* The day header belongs to the spine in the frozen layout, not to a
              page-level bar above the triptych. */}
          <div className="dayhdr">
            <div className="date">
              <span className="dow">{WEEKDAY.format(new Date(`${dayKey}T12:00:00`))} —</span>{" "}
              {DAY_MONTH_YEAR.format(new Date(`${dayKey}T12:00:00`))}
            </div>
            <span className="badge">
              <span className="ring" />
              Unfinalized
            </span>
          </div>
          <LogForm />
        </div>

        <div className="col almanac">
          <QuoteCard dayKey={dayKey} />
          <WordCard dayKey={dayKey} />
          <FactCard dayKey={dayKey} />
          <OnThisDayCard dayKey={dayKey} />
          {holiday}
          <TimeProgressCard dayKey={dayKey} now={now} />
        </div>
      </div>

      <div className="shelf">
        <HoroscopeCard />
        <TarotCard />
        <RediscoverCard dayKey={dayKey} pastDays={pastDays} />
        <CountdownsCard config={config} dayKey={dayKey} />
        <LifetimeCard config={config} dayKey={dayKey} />
      </div>

      {import.meta.env.DEV && <DevWhimsyPanel config={config} onChange={updateConfig} />}
    </div>
  );
}
