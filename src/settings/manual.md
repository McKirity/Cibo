## What is Cibo?

### Why I made it

To make a long story short, there are no habit tracker apps in existence that actually track your habits. At best, they just offer to build your habits and then maybe give you a pie chart for $5 every month. No detailed analyses, you can only do boolean values, and if you try to track anything like specific games or books, lol. Lmao, even. I tried all kinds of things like bullet journaling, trying those apps, building excel sheets, and make a whole custom Obsidian app, but in the end, none of them ever went deep enough for me. And so: I made my own app. Or to be more accurate, Claude made it for me, with a ton of handholding and guiding. I'm able to track nearly all kinds of habits, including how long I did them for, what exactly I did, how much effort I put into them, and the app will do the hard work of crunching numbers and spitting them out into dashboards loaded with all sorts of graphs. I can track specific entries too, like games and books. I even loaded it up with timers, themes, and importers.

It is important to note that this is NOT a task manager or habit builder. This is purely for tracking your habits and visualizing them. If you want to make sure you're exercising regularly, this app is not that. It could guilt you into it via dashboards, but that is not the intended purpose and never will be. Don't ask to include any features like that, because the answer will be a flat no.

As for the name itself, I was on a bit of a Tsutomu Nihei kick when I started this. I needed a name and so: Cibo

**Important: I will never monetize this app.** This app is purely for personal use and maybe for sharing with friends. It was never made with the goal of monetization in mind, so if you are somehow paying for this, you got fucking scammed my guy.

### How it works

Cibo is a desktop app — a Rust shell (Tauri) around a React interface, with the data in a local
SQLite database managed by Evolu. Everything lives on your machine. Your data is never uploaded,
and there is no account. The few things the app ever asks the internet for — importer lookups,
the weather — are listed, each with its reason, in **Settings › Help › About**.

The part worth understanding is not the stack, it is **what gets stored and what gets worked
out**. Cibo stores as little as it can:

- **Sessions are the only record of doing something.** One session is one bout — a sitting, a
  walk, a night's sleep. It carries exactly one measurement, but keep in mind that a day can contain several sessions.
- **Completion is never stored.** Whether a day counts as done is worked out from the sessions
  in it, every time it is asked.
- **Neither are streaks, totals, bests, or engagement dates.** A book's "started" and "finished"
  are read off its sessions, not typed in anywhere.

That means nothing can drift out of sync with itself. There is no cached total to be stale and
no counter to be wrong — if the sessions are right, everything above them is right.

A few rules follow from this and are worth knowing:

- **Streaks are counted in days, always** — at every scale. A "monthly streak" is still a count
  of days.
- **A day with nothing logged and no verdict is `unknown`, not `missed`** — and unknown days
  pass a streak through rather than breaking it. You are not punished for not having gotten
  around to logging yet.
- **Repeat engagements are read as waves.** Play a game, stop for a few months, come back — Cibo
  sees two waves rather than one long blur or a restart. The gap that separates them is 30 days
  by default, adjustable per habit.

For how any of this is actually implemented, see the developer manual in the repository; this
page just summarizes briefly.

### General app layout

One window, one screen at a time.

**The rail** runs down the left and is always there. It holds four things, top to bottom: the
**month calendar** (every label is a door — click a day, a week, a month, a year and you land on
that dashboard), your **habits**, the **tools**, and **Settings** at the foot. The rail can be
collapsed entirely when you want the room; the content reflows to fill the space.

**The app opens on Daily.** There is no homepage — today is the front page. If days are waiting
to be finalized, Daily says so at the top.

**Three kinds of dashboard**, and everything you click leads to one of them: a **cadence**
dashboard for a stretch of time (day, week, month, quarter, year), a **habit** dashboard for one
habit across all time, and an **entry** dashboard for one specific game, book, or project.

Navigation behaves like a browser — back and forward work, including the mouse's side buttons
and `Alt` with the arrow keys. `Ctrl K` opens the command palette from anywhere, and `Ctrl H`
takes you back to today. Overlays and dialogs are never places you can navigate back to; they
just close.

**Identity is clickable, numbers are not.** If something names a thing — a habit, a title, a
date — it is a door. If it is a measurement, it is just telling you something.

### Data

Everything Cibo owns lives in **one folder you choose**, somewhere inside your cloud drive. You
pick it once, in **Settings › Storage**. Inside it Cibo keeps three subfolders:

- **`backups/`** — automatic backups. Cibo writes these; you never need to open the folder.
- **`images/`** — every cover and banner, filed by habit. Also Cibo's to manage, though the
  files are ordinary images and nothing stops you looking.
- **`themes/`** — **the one folder that is yours to write into.** Dropping a theme folder here
  installs it. See *Themes*.

Because the whole thing sits on a cloud drive, all of it — backups, art, themes — arrives on
your other machine on its own.

The database itself does **not** live here. It sits in the app's own storage, and the way to get
a copy of it is a backup.

**What travels between machines, and what doesn't.** The rule is that **preferences travel and
machine facts stay put**:

| Travels | Stays on this device |
|---|---|
| All your data — habits, entries, sessions, days | Theme choice |
| Day cutoff, week start, quarter definition | UI scale, compact mode, reduce effects |
| Saved presets, palette curation | Window size and position |
| Whimsy settings — dates, location, countdowns | The cloud-root path, the Calibre path |
| Importer API keys | Timer sound and default pomodoro lengths |
| Muted Data Doctor findings | How you left the Library — its sort and filters |

Appearance settings deliberately do **not** travel: a size that reads well on a large monitor is
wrong on a 14-inch laptop. Anywhere a setting stays put, the app marks it **This device** — if
there is no mark, it travels.

### Getting started

Cibo starts with a short setup screen — important dates, roughly where you are (used for sunrise,
moon phase, and the almanac), and which habits you want to begin with. Every field can be left
empty and everything can be changed later; the one door out is Finish, and it works no matter how
much you filled in.

Then it opens on today. **Log something.** Pick a habit, fill in the form, save. That is the
whole loop, and everything else in the app is downstream of it.

When you are finished with a day, **finalize** it. That tells Cibo the day is settled — and it
turns the day into its cover wall.

There is no goal to set, no target to hit, and nothing will ever remind you or nag you. Cibo is a
record of what happened, not a task manager.

---

## Habits

### What are Habits?

A **habit** is one thing you track. Cibo comes with several and you can make as many as you like.

Habits come in three **kinds**, and the kind decides what logging looks like:

- **Project habits** track individual *things*. Gaming has games, Reading has books, Writing has
  stories. Each of those things is an **entry**, and every session has to say which one it was.
- **Simple habits** have no entries to track against, just whether or not you did the habit that day. You can calculate measure units like how many steps or how long, but there are no mediums or entries to take into consideration (most of the time).
- **Range habits** are logged as a span between two times. Sleep is the example: a bedtime and a
  wake time, with the duration worked out from them.

Project habits are also either **consumption** or **creation** — things you take in versus things
you make. Consumption habits tend to have a lot of entries and can often be filled by an importer;
creation habits have a few, each of them rich. This is fixed when the habit is made.

**Entries and sessions are different things**
- An **entry** is *what a thing is* — a title, a cover, a status, a rating. It has no dates.
- A **session** is *when and how much* — a date, one or two measurements, and which entry it was.

So a book's entry says it is a book; its sessions say you read it across nine evenings in March.
Because of that split, you never type in "date started" — Cibo reads it from the sessions.

Some vocabulary you will meet:

- **Measure** — the thing a session counts. Time, or a count of something you name (words, steps,
  pages), or nothing at all.
- **Medium** — a way of slicing a habit into categories. Writing has stages, Reading has types,
  Keyboard has boards. Each one becomes a breakdown on the dashboard.
- **Status** — where an entry stands: Planned, Current, Finished, Hiatus, Dropped. One shared
  list across the whole app.

You can edit these lists yourself, and add to them straight from the log form when you are
recording something new. The one exception: the five statuses Cibo ships with are permanent —
parts of the app read them by name, so they can never be renamed or removed. Statuses you add
yourself are fully yours to rename or remove.

### How to log your habits

Open a day and fill in the form. That is the only way in — there is no quick-add, and nothing
logs itself.

**One session is one bout.** If you read for an hour after lunch and another hour at night, that
is two sessions, not one two-hour session. They add up on their own.

**A session carries exactly one measurement.** If a habit tracks both time and a count — Writing
tracks minutes and words — those are logged as separate sessions. This is deliberate: it keeps
"an hour of writing" and "eight hundred words" from being welded into a single claim about the
same stretch of time.

Some habits measure nothing at all. For those, the record is simply that it happened.

**Timers** are a shortcut, not a second path. Start a clock, and when you stop it, it fills in the
form for you with the elapsed time. Only habits that measure time can use one. Anything a timer
does you could have typed.

**Back-dating is normal.** Open any past day and log into it. Nothing is locked, nothing expires,
and there is no penalty for catching up a week late.

#### Finalizing a day

When a day is done, **finalize** it. This is the one bit of bookkeeping Cibo asks for, and it
exists to answer a question the app cannot answer for itself:

> An empty day — did nothing happen, or have you just not written it down yet?

- **Finalized and empty** means *nothing happened*. That day is a miss and it will break a streak.
- **Not finalized and empty** means *not logged yet*. That day is unknown, and a streak passes
  straight through it.

Nothing is ever finalized automatically. A day you never get to simply stays unknown forever,
which is honest — Cibo does not know, so it does not guess.

Finalizing also builds the day's **cover wall**: the covers of everything you touched that day,
laid out as a keepsake. Days you have not finalized are listed on Daily so they are easy to find.

### Visualizing your habits

Every habit has a dashboard, and so does every stretch of time and every entry.

**Cadence dashboards** cover a period — a day, week, month, quarter, or year. They lead with the
verdict: what got done, what was missed, what is still unknown. Longer periods go deeper —
heatmaps, trends, comparisons against the year before.

**Habit dashboards** cover one habit across its whole life: totals, streaks, best days, a
heatmap, and breakdowns for each of the habit's mediums.

**Entry dashboards** cover one game or book or story — every session it ever had, and its waves.

**Periods aggregate days; they never change how anything is judged.** Completion is only ever
decided per day. A week is a summary of seven verdicts, and a streak is a run of days no matter
which dashboard you are reading it on.

**Dashboards build themselves.** There is no layout to arrange and no charts to pick — each
measure a habit tracks adds a statistic, each medium adds a breakdown. Change what the habit
tracks and the dashboard changes with it. This is the whole design: you describe the habit, and
the view follows.

### Archiving your habits

**Archiving** puts a habit away without losing anything. It disappears from the rail and from the
daily form; its data stays exactly where it is, and every dashboard it ever had still works.
Un-archive and it comes straight back. This is the move for "not doing this right now."

**One thing to know: archiving ends a running streak.** The gap while a habit is archived is not
judged — those days are not counted as misses — but the streak does not resume where it left off
when you bring the habit back. If a live streak matters to you, that is the cost.

**Deleting** is different and it is permanent. Deleting a habit takes its sessions and its entries
with it. Cibo will tell you exactly how much before it does anything — the number of entries, the
number of sessions, the number of cover images — and there is no undo afterwards. A backup is the
only way back.

Smaller deletions are gentler: removing a single entry or session gives you about ten seconds to
undo it.

### Creating new habits

New habits are made in **Settings › Habits › New habit**, or straight from the palette. The
creator asks one thing at a time, and only asks what it needs.

**Name and kind.** A name — it has to be unique — and what kind of thing this is: a **project**
that tracks individual things, something **simple** with nothing to track against, or a **range**
logged as a span between two times. Projects also say whether their entries will arrive from an
importer or be added by hand. **The kind is permanent** once you have logged to the habit.

**What you measure.** Time, a count, or nothing at all. If you count, you name the unit yourself —
words, steps, pages. Declare both time and a count and each is logged on its own.

**Mediums.** Optional ways to slice the habit: a stage, a discipline, a type, a board. You write
the values, and you can add more later straight from the log form.

**Colour and icon.** A colour from the twelve, and an icon if you want one. Neither blocks
anything and both can change later.

Only the name and the kind are required, plus a unit if you chose to count. Everything else can
be answered now, later, or never.

Creating a habit gives you something you can log to right away — and its **dashboard is already
built**. Every dashboard assembles itself from what the habit tracks: each thing you measure adds
a stat, each category you slice by adds a breakdown. There is no dashboard to lay out and nothing
to tune. The only thing that ever changes a dashboard is adding a measure or a medium to the
habit itself.

Depending on how a habit is set up, one small thing may still be waiting for you. None of it
blocks you, and none of it is an error:

- **Simple and range habits** — a keepsake tile. Open the habit in **Habits › Manage** and paste a
  tile snippet to give it its own art on the cover wall. A snippet is code: an **HTML** fragment
  (preferred, and the only way to make it move) or a static **SVG**. An image file will not work.
  Until you paste one, a plain fallback tile stands in. The exact format — the placeholders the
  app fills with the day's numbers, and the rules a snippet has to follow — is written up in the
  developer manual in the repository, as a spec you can hand whole to anyone (or anything)
  writing a tile for you.
- **Projects fed by importers** — the importer itself. Pulling entries in is developer work; until
  that importer ships, the habit runs on entries you add by hand.
- **Projects by hand** — nothing. So long as you answered everything in the creator, it is
  finished the moment you create it.

A habit is fully usable the day it is made. Finishing it is only ever about the art on its cover
wall, or an importer that has not been built yet.

---

## Tools

### Themes

A theme re-skins the whole app — colours, spacing, corners, type, and any artwork it carries.
Pick one in **Settings › Appearance**. The choice is per-machine, so your desktop and your laptop
can wear different themes.

**Two themes ship with Cibo:** **Default**, a light neutral, and **Void**, a hard dark inversion
with a magenta accent. Default is the one that can never be missing — if a theme you picked is
gone, Cibo falls back to it and says so once.

**Adding a theme is dropping a folder in.** Themes live in `themes/` inside your cloud root. Put a
theme folder there, open **Settings › Appearance**, and it is in the list — no restart, nothing to
install. That is the entire procedure — and because the folder is on your cloud drive, the theme
shows up on your other machine too.

**A theme is one folder, and the folder name is the theme name.** Inside it:

```
themes/
└── My Theme/
    ├── theme.css          ← the only required file
    ├── backdrop.png       ← optional, 2560×1440 — the window background
    ├── backdrop_loop/     ← optional, animated crops of the backdrop
    ├── timer.png          ← optional — a different backdrop for the Timers screen
    ├── timer_loop.mp4     ← optional, the whole scene as a video loop
    └── fonts/             ← optional — the theme's own typefaces
```

**`theme.css` is the only thing a theme actually needs.** It holds the colour and shape values —
and, if the theme wants more than values can say, its own styling rules after them. A folder with
nothing else in it is a complete, legal theme — it is simply a recolour.

Everything else is optional, with a few rules:

- **Backdrops are stills.** If a surface has motion, it still needs its still image — that is what
  shows before the motion starts and what you get when effects are turned off.
- **A surface gets one kind of motion, not both** — either a `_loop.mp4` video or a `_loop/`
  folder of frames, never both at once.
- **Fonts travel in the folder.** Font files dropped into `fonts/` are used while the theme is
  active — the file's name is the name the theme's CSS calls it by, nothing is installed on the
  machine, and there is no extra step on either device.
- **Anything malformed is skipped, quietly.** A broken video falls back to the still image; a
  broken animation is simply not played. The app does not break over a theme.

**To start one, copy `_theme-template/`** — it sits alongside the themes and holds a commented
skeleton plus a README. Folders whose names begin with `_` are skipped by the loader, so the
template never shows up as a theme itself.

### Timers

The Timers screen is a board of clocks running independently. Start several at once if a sitting
covers more than one thing.

Three modes:

- **Stopwatch** — counts up until you stop it.
- **Countdown** — counts down from a length you set. It records the time that actually elapsed,
  so stopping early logs what you really did.
- **Pomodoro** — alternating work and break intervals.

Stopping a clock and reaching the end of an interval are the same event: you get the same prompt,
and logging writes an ordinary session into today's form. Anything a timer produces you could have
typed by hand.

Timers make a sound at the end of an interval by default. Minimizing Cibo puts running clocks in
the tray. There is no global hotkey — a timer is something you start on purpose.

**Closing Cibo closes it properly.** If a clock is still running you get a warning first, and you
can stop it and log it or discard it. If Cibo ever crashes with a clock running, it offers to
continue, log, or discard when it next opens.

### Importers

Importers create entries from outside sources so you are not typing in covers and titles by hand.
They run when you ask them to and never in the background.

| Source | Brings in | Setup |
|---|---|---|
| **Steam** | Games | None — no key needed |
| **TMDB** | Movies and TV | An API key |
| **YouTube** | Channels (your watching rides the channel) | An API key |
| **AniList** | Anime and manga | None — no key needed |
| **Calibre** | Books, from your local library | The path to your Calibre folder |
| **AO3** | Fanfiction | None — no key needed |

AniList feeds two habits — anime lands alongside your other media, manga lands in Reading. AO3
works are fanfiction for Reading too; fanfic has no cover art, so those entries wear their
lettermark and that is their finished look.

Keys and the Calibre path live in **Settings › Importers**. The keys travel between your machines;
the Calibre path does not, since it is a location on one particular disk.

Using one: open the importer, search or paste in a link, pick what you want, and import. Cibo
recognizes things you already have and will not duplicate them.

**Importers never overwrite what you have already written.** They fill in blanks — if you have
rated something or written a status, importing again leaves your version alone. Covers are
downloaded once, into `images/`, and from then on they are ordinary files on your drive.

An importer produces entries, not sessions. It knows you own a game; it has no idea when you
played it. That part is always yours.

### Backups

Backups are automatic. **Cibo backs up every time it closes cleanly**, and if it has been more
than about a week since the last good one — which is what happens if it crashed — it backs up when
it opens instead. There is no schedule to configure, because opening and closing the app *is* the
schedule.

Backups go to `backups/` in your cloud root. One slot per day, so a busy day of opening and closing
leaves one backup rather than twenty. Daily backups are kept for about three months; the last
backup of each month is kept indefinitely.

A backup is not one file but several, each compressed, and they are kept for different lengths
of time:

- The **plain-readable export** — everything as JSON, plus CSV files of your sessions and entries
  for opening in a spreadsheet. **Every backup carries this, and it is kept forever.** It exists
  so your data is never trapped inside this app.
- A **copy of the database**, readable by any SQLite tool — kept on the last month or so of
  dailies and on every monthly keeper.
- A **copy of the app's internal store** — the part that actually restores. Kept on every daily
  and every monthly keeper.

That last distinction matters:

> **The `.db` file and the exports are for reading, not for restoring.** They exist so your data
> is never trapped inside this app. **Restoring uses the store copy.**

An old backup that has been trimmed down to its export over the years is still perfectly
readable — it just cannot be restored in one click any more, and the Backups screen says so
plainly rather than offering something it cannot do.

**Restoring** lives in **Settings › Backups**. Pick a dated backup, confirm — the confirmation
carries the date, because this replaces everything — and Cibo takes a safety copy of your current
data first, swaps in the backup, and restarts. It has to restart; the data cannot be swapped while
it is open. Because of the safety copy, even a restore you regret is undoable.

Every backup is checked after it is written, and a failure lights the health dot in the rail
rather than failing silently.

### Data Doctor

Data Doctor checks your data for things that are probably mistakes — a session pointing at an
entry that no longer exists, a cover file that has gone missing, a category that was removed, the
same book entered twice. The checks are quick and run quietly when the app starts — that is one
of the things that lights the health dot — and again when you open **Settings › Health**. What
they never do is act on their own: a finding waits for you, and fixing it is always your click.

Findings are described plainly and are usually fixable in a click. If something it flags is
actually fine and you would rather not see it again, mute it — the finding is remembered as muted
rather than deleted, and muting travels between your machines.

The same Health section holds the rest of the app's status: when the last backup ran, a
**Test connection** button for each importer, and any recent errors. The dot on the rail's
Settings entry lights when something in here wants attention, and clicking it brings you straight
here.

Data Doctor has far less to do than its predecessor did. Most of what the old vault's linter
caught were formatting mistakes in text files — quoting, casing, name collisions. Those cannot
happen now.

### Palette

`Ctrl K` opens the palette from anywhere. It does two things.

**It teleports.** Type the name of a habit, an entry, a date, a settings section, or a manual page
and go straight there. Every page in this manual is a destination.

**It runs a short list of actions** — back up now, create a habit, switch the theme, and so on. The
list is deliberately small and fixed; the palette is not a hidden second menu with everything in
it. You can turn individual actions off in **Settings › Palette** if you never use them, which
hides them without removing them.

`Esc` closes it, as it closes anything.

### Comparing Statistics

Comparing Statistics answers **"how much?"** — and specifically, how much compared to something
else. Two habits against each other, this year against last, one month against the one before.

You build a question out of four parts: what to compare, which measurement, over which periods,
and how to draw it. It opens blank, because there is no sensible default question.

Not everything is comparable, and the workspace shows you that as you build rather than
complaining afterwards — hours and word counts do not share an axis, and it will not pretend they
do.

When you have built something you will want again, save it as a **preset**. Presets are the way
back to a question; they travel between your machines and are managed in **Settings › Presets**.

The companion tool is **Search**, which answers *"which ones?"*.

### Search

Three ways to find things, for three different questions.

**The palette** (`Ctrl K`) is for *"take me to this."* You know what you want and you want to be
there. This is the one to reach for most of the time.

**Search bars** sit on the Library and other lists, for narrowing what is in front of you.

**Advanced Search** is for *"which ones match this?"* — everything with a rating above three that
you dropped, every day last winter with more than two hours logged. It uses the same builder as
Comparing Statistics, and the two are deliberate opposites: Comparing Statistics tells you **how
much**, Advanced Search tells you **which ones**. It saves presets the same way.

### Map

The Map is a table of contents for everything in the app. Two branches — **Time** and
**Content** — and every line in it is a door.

It is text, not tiles, and it exists for the moments when you know something exists but not what
it is called or where it lives. Nothing in it is anywhere else exclusively; it is a directory, not
a feature.

The Content branch lists the project habits — the ones with entries to catalog. Archived habits
are not listed.

### Library

The Library is the catalog for a project habit — every game, every book, every film, as covers.

Sort it and filter it however you like; **it remembers, per machine**, so the way you left it is
the way you find it. What is currently in progress is pulled to the top.

From here you can open anything's entry dashboard, add an entry by hand, run an importer, or
select several at once and edit them together — handy for marking a stack of things finished, or
fixing a category across a dozen entries in one pass.

The Library is about *what you have*. For *how much you have done*, that is the habit's dashboard.
They are deliberately separate screens.

### Bulk Editor

The Bulk Editor changes the same field across many entries at once — marking a stack of games
finished, adding a genre to eight books, correcting a category you have been spelling two ways.

It opens from the Library's toolbar, and **the selection happens inside it**, not out in the
Library. The bulk editor is a searchable grid of covers: click to select, search by title or
creator, filter, or select everything matching a filter at once. A running count tells you how
many entries you are about to change.

The covers in that grid are the one place in Cibo where a cover is **not** a door — clicking one
selects it rather than opening it. That is deliberate, and it is why the Library itself never
enters a selection mode: out there, a cover always opens the thing.

**Six fields can be set on many entries at once:**

- **Status** · **Priority** · **Type** · **Purchased** · **Rating**
- **Genre**, which works as **add** and **remove** rather than replace — an entry can have
  several genres, so "add *roguelike* to these eight" never wipes what is already there.

Everything else is per-item by nature — titles, covers, descriptions, creators, series — and
lives on the entry's own dashboard in its edit mode.

Field edits apply immediately. There is no confirmation step and no undo, because nothing is
destroyed: run it again with the right value and the wrong one is gone.

**Bulk delete is the exception.** You can delete a selection from here, and it is the
highest-stakes thing the app can do — every selected entry, all of their sessions, and their
cover files. It asks first, with the real counts, and there is no undo afterwards. A backup is
the way back.

**Fixing a duplicate.** There is no merge tool, deliberately. If the same book exists twice:
reassign the stray sessions to the entry you are keeping (from either entry's session history),
copy across anything worth keeping, and delete the leftover — that one rides the ten-second undo.
At the scale a personal library actually reaches, a duplicate has a handful of sessions, and a
merge workflow would be more failure modes than it removes.

### Whimsy & the calendar

The Daily dashboard is framed in small cards. The sky's: sunrise and sunset, the weather, the
season, the moon, what is visible tonight. An almanac of the day: a quote, a word, a fun fact,
on-this-day history alongside your own tracking anniversaries, holidays, and how far through the
week and month and year you are. And a shelf of the frivolous: a horoscope, a tarot draw, a door
back to a random past day, your countdowns. (The rail's calendar is the plain month grid — the
cards live on Daily.)

This runs on a few things you tell it once, in **Settings › Whimsy**: roughly where you are, your
birthday, and any dates you want counted down to. Where you are is stored as plain coordinates —
no address, no lookup. Two cards do talk to the internet: the weather card sends those coordinates
to a weather service, and the horoscope card asks its service about your star sign. That is the
whole of it, and **Settings › Help › About** lists every outside service the app can reach and
why.

Every card can be turned off individually, in the same place, and turning most of them off is a
perfectly reasonable thing to do.

These settings travel between your machines. They are facts about you, not about a particular
computer, so the laptop does not ask you again.

None of it affects your data. It is the part of the app that exists because a calendar you look at
every day may as well tell you when the sun sets.

