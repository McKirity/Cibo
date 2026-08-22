## What Is Cibo?

### Why I Made It

To make a long story short, there are no habit tracker apps in existence that actually track your habits. At best, they just offer to build your habits and then maybe give you a pie chart for $5 every month. No detailed analyses, you can only do boolean values, and if you try to track anything like specific games or books, lol. Lmao, even. I tried all kinds of things like bullet journaling, trying those apps, building excel sheets, and make a whole custom Obsidian app, but in the end, none of them ever went deep enough for me. And so: I made my own app. Or to be more accurate, Claude made it for me, with a ton of handholding and guiding. I'm able to track nearly all kinds of habits, including how long I did them for, what exactly I did, how much effort I put into them, and the app will do the hard work of crunching numbers and spitting them out into dashboards loaded with all sorts of graphs. I can track specific entries too, like games and books. I even loaded it up with timers, themes, and importers.

It is important to note that this is NOT a task manager or habit builder. This is purely for tracking your habits and visualizing them. If you want to make sure you're exercising regularly, this app is not that. It could guilt you into it via dashboards, but that is not the intended purpose and never will be. Don't ask to include any features like that, because the answer will be a flat no.

As for the name itself, I was on a bit of a Tsutomu Nihei kick when I started this. I needed a name and so: Cibo

**Important: I will never monetize this app.** This app is purely for personal use and maybe for sharing with friends. It was never made with the goal of monetization in mind, so if you are somehow paying for this, you got fucking scammed my guy.

### How It Works

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

### General App Layout

One window, one screen at a time.

**The rail** runs down the left and is always there. It holds four things, top to bottom: the
**month calendar** (every label is a door — click a day, a week, a month, a year and you land on
that dashboard), your **habits**, the **tools**, and **Settings** at the foot. The rail can be
collapsed entirely when you want the room; the content reflows to fill the space.

**The app opens on Daily.** There is no homepage — today is the front page. If days are waiting
to be finalized, Daily says so at the top.

**Four kinds of dashboard**, and everything you click leads to one of them: **Daily** (the day's
form, and its cover wall once the day is finalized), a **cadence** dashboard for a stretch of
time (day, week, month, quarter, year), a **habit** dashboard for one habit across all time, and
an **entry** dashboard for one specific game, book, or project.

Navigation behaves like a browser — back and forward work, including the mouse's side buttons
and `Alt` with the arrow keys. `Ctrl K` opens the command palette from anywhere, and `Ctrl E`
takes you back to today (on a Mac, `⌘` stands in for `Ctrl`; the full list is under
**Settings › Help › Hotkeys**). Overlays and dialogs are never places you can navigate back to;
they just close.

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
| All your data — habits, entries, sessions, days | Theme choice, and the slideshow's timing |
| Day cutoff, week start, wave gap, auto-save interval | UI scale, reduce effects, force-opaque panels |
| Milestone ladders | Window size and position |
| Saved presets, palette curation | The cloud-root path, the Calibre path |
| Whimsy settings — dates, location, countdowns | Timer sound and the default pomodoro plan |
| Importer API keys | Whether sync and automatic backups are on |
| Muted Data Doctor findings | How you left the Library — its sort and filters |

Appearance settings deliberately do **not** travel: a size that reads well on a large monitor is
wrong on a 14-inch laptop. (Density is not a setting at all — the layout tightens on its own when
the window is narrower than a desktop monitor.) Anywhere a setting stays put, the app marks it
**This device** — if there is no mark, it travels.

### Getting Started

Cibo starts with a short setup screen — important dates, roughly where you are (used for sunrise,
moon phase, and the almanac), and which habits you want to begin with. **Your location is the one
thing it insists on** — Finish stays off until both coordinates are in, because the sky cards
cannot draw without them. It is stored as two plain numbers; no address, no lookup. Every other
field can be left empty, everything can be changed later in Settings, and the one door out is
Finish.

Then it opens on today. **Log something.** Pick a habit, fill in the form, save. That is the
whole loop, and everything else in the app is downstream of it.

When you are finished with a day, **finalize** it. That tells Cibo the day is settled — and it
turns the day into its cover wall.

There is no goal to set, no target to hit, and nothing will ever remind you or nag you. Cibo is a
record of what happened, not a task manager.

---

## Habits

### What Are Habits?

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

### How to Log Your Habits

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

**One measurement can be borrowed from another habit.** Keyboard's word count is read off
Writing's: log your words under Writing, and the Keyboard row fills in on its own — you never type
a Keyboard word count, only which board you used. If you ever hand-edit that borrowed number it
becomes yours and stops following; a **Refresh** on the row puts it back under Writing's control
for good.

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

### Daily & the Cover Wall

Daily is the front page and the only place logging happens. It has two faces: the **working day**,
and the **cover wall** the day becomes once you finalize it.

**The working day** is a column of habit strips — one per active habit — framed by the whimsy
cards. Open a strip, fill in a session, and move on; the rail's calendar marks the day you are
looking at, and the **Jump** control on it takes you to any month or year. Days you have opened
but not finalized are listed at the top of today's page so they are easy to find again.

**The form saves itself.** What you type is held and written out on a timer — every ten minutes
by default, adjustable in **Settings › Tracking** — so a crash between saves can lose at most
that interval. **Finalize is the one deliberate save**: it writes everything pending first, then
seals the day.

**Edit day never un-finalizes.** Open a finalized day, press **Edit day**, change what you like —
the day stays finalized throughout. The flag means "I have settled this day," not "this day is
locked," and nothing in the app takes it back off.

**The cover wall** is what a finalized day turns into: the cover of every game, book, or film you
touched, the banner of anything you made, a keepsake tile for each simple or range habit, and
the whimsy cards of the day as they were. The wall is packed from the centre outwards, the
biggest art first, and any **milestones** the day earned are stamped on it (see *Milestones*).
Nothing on the wall is stored — it is drawn fresh from the day's sessions every time, which is
why editing a day later simply redraws it.

### Visualizing Your Habits

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

### Milestones

A milestone is a threshold crossed — your hundredth day of a habit, a thousand hours, ten
thousand words, a streak longer than any before it. Cibo notices them on its own. The day's
banner counts how many the day earned; the full list is on that day's cover wall, and each one
is stamped with the habit's seal.

**Milestones are never stored.** They are worked out again from the sessions every time they are
asked for, and they belong to the day they were *earned*, not the day you typed the session in —
so back-dating a week of logging can light milestones across that week, and editing a day can
take one away again. A record needs something to beat, so the first time a habit sees a value it
sets the bar quietly; a streak record fires only when you *overtake* your longest-ever run, never
on every day that extends it.

The **ladders** — which numbers count as milestones for days, hours, words, sessions — are yours
to edit. The global defaults live in **Settings › Tracking › Milestone Ladders**; any habit can
carry its own override on its Manage row.

### Entries

An entry's dashboard is where everything about one title lives, and its **edit mode** is where
you change it. The fields the importers fill — type, genre, status, priority, rating, series,
description, creators — are all editable here; so is the art:

- **Cover** — pick or replace the picture from your disk. Covers are filed under `images/` in
  your cloud root and travel to the other machine with it.
- **Banner** — for creation habits, the wide picture behind the entry's hero card and on the
  cover wall. *Set banner…* and *Replace banner…* live on the same edit face.

**Ratings are whole stars** (★★★★, never "4.2") and **priority is chevrons** (›, ››, ›››) —
the same two faces wherever they appear in the app. Sessions are listed on the dashboard too;
from a session's row you can move it to another entry, which is how a duplicate gets untangled
(see *Bulk Editor*). Deleting the entry itself takes its sessions and its cover file with it,
with the usual ten seconds to undo.

### Archiving Your Habits

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

### Creating New Habits

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

**Settings › Habits** has three tabs. **Manage** is every habit's row — archive, colour, icon,
its own milestone ladder and wave gap, the keepsake tile slot for simple and range habits, and
for project habits an **Image folder** door that opens that habit's corner of `images/`.
**Vocabulary** is where the shared status list and every habit's mediums are edited. **Icons**
shows the icon set the app draws from.

### Tracking Settings

A handful of rules shape how every day is read, all in **Settings › Tracking**, and all of them
travel between your machines:

- **Day cutoff** — when a "day" rolls over. It only sets the *default* date on the log form for
  a late-night session; the form always wins, and changing the cutoff never re-files anything
  already logged.
- **Week start** — Monday or Sunday. Every week grid, heatmap row and week label follows it.
  Week *numbers* stay ISO whichever you pick.
- **Wave gap** — how long a pause has to be before an entry's sessions count as a new wave of
  engagement rather than the same one. Thirty days by default; any habit can override it.
- **Auto-save interval** — how often the Daily form writes out what you have typed (see *Daily
  & the Cover Wall*).
- **Milestone Ladders** — the thresholds that count as milestones (see *Milestones*).

---

## Tools

### Themes

A theme re-skins the whole app — colours, spacing, corners, type, and any artwork it carries.
Pick one in **Settings › Appearance › General**. The choice is per-machine, so your desktop and
your laptop can wear different themes. The same tab has **Reduce effects** (strips motion, blur
and glow — a theme's stills stay) and **Force-opaque panels** (for themes that let the backdrop
show through their panels), both per-machine as well.

**Two themes ship with Cibo:** **Default**, a light neutral, and **Void**, a hard dark inversion
with a magenta accent. Default is the one that can never be missing — if a theme you picked is
gone, Cibo falls back to it and says so once.

**Adding a theme is dropping a folder in.** Themes live in `themes/` inside your cloud root — the
**Open themes folder** door on the Appearance tab (or in the palette) takes you straight there,
and creates the folder if it does not exist yet. Put a theme folder in, open **Settings ›
Appearance**, and it is in the list — no restart, nothing to install. That is the entire
procedure — and because the folder is on your cloud drive, the theme shows up on your other
machine too. (The list is read when the pane opens, so a folder dropped in while you are already
looking at it needs a step out and back.)

**A theme is one folder, and the folder name is the theme name.** Inside it:

```
themes/
└── My Theme/
    ├── theme.css          ← the only required file
    ├── backdrop.jpg       ← optional, 2560×1440 — the window background (png/jpg/webp/avif/svg)
    ├── backdrops/         ← optional — several backdrops, shown as a slideshow (see Ambience)
    ├── backdrop_loop.mp4  ← optional — the whole scene as a video loop
    ├── backdrop_loop/     ← optional — animated crops of the still
    ├── timer.jpg          ← optional — a different backdrop for the Timers screen
    ├── timers/            ← optional — a slideshow for the Timers screen
    ├── fonts/             ← optional — the theme's own typefaces
    └── decoration/        ← optional — ornament art for the app's frames and stamps
```

**`theme.css` is the only thing a theme actually needs.** It holds the colour and shape values —
and, if the theme wants more than values can say, its own styling rules after them. A folder with
nothing else in it is a complete, legal theme — it is simply a recolour.

Everything else is optional, with a few rules:

- **Backdrops are stills.** If a surface has motion, it still needs its still image — that is what
  shows before the motion starts and what you get when effects are turned off.
- **A surface gets one kind of motion, not both** — either a `_loop.mp4` video or a `_loop/`
  folder of frames, never both at once. A slideshow folder carries stills only.
- **Fonts travel in the folder.** Font files dropped into `fonts/` are used while the theme is
  active — the file's name is the name the theme's CSS calls it by, nothing is installed on the
  machine, and there is no extra step on either device.
- **Decoration is optional ornament** — frames around panels and cards, stamps on milestones and
  finalized days, a strip along the titlebar — supplied as image files plus a small manifest that
  says which of the app's slots each one fills. The app's layouts already reserve the room, so
  ornament never moves anything.
- **A theme's CSS cannot point at a file.** Fonts go in `fonts/`, art in `decoration/`; a
  picture referenced from `theme.css` by path will quietly fail to load.
- **Anything malformed is skipped, quietly.** A broken video falls back to the still image; a
  broken animation is simply not played; a broken decoration set leaves the slot bare. The app
  does not break over a theme.

**To start one, copy `_theme-template/`.** It is not in your themes folder — it ships inside the
app (in the repository under `src-tauri/resources/themes/`, and in the installed app's resources
folder) and holds a commented skeleton of every value plus a README that is the full format
spec. Folders whose names begin with `_` are skipped by the loader, so the template never shows
up as a theme itself.

### Ambience

A theme's backdrop can be one picture or many. Put several stills in a **`backdrops/`** folder
inside the theme instead of a single `backdrop` file and Cibo plays them as a **slideshow**: a
shuffled deck, never the same picture twice in a row, each change a crossfade. The Timers screen
can have its own set in **`timers/`**, or simply keep the backdrop going.

The timing is yours, per machine, in **Settings › Appearance › Ambience**:

- **Change every** — from 30 seconds to an hour, ten minutes by default. **Off** stops the
  rotation and shows the first picture by filename.
- **Fade** — how long the crossfade takes, up to five seconds. The row carries a live preview so
  you can see the fade you are setting.
- **Timer backdrop** — whether the Timers screen uses its **own folder** or **shares** the
  backdrop. Sharing means there is no separate timer picture at all; the backdrop just continues.

A few things worth knowing:

- **The clock only runs while you are looking.** Minimize or hide the window and the rotation
  pauses where it is; it does not skip ahead to catch up.
- **Reduce effects freezes it** on the current picture, fade and all.
- **Only two pictures are ever loaded** — the one showing and the next — however many are in
  the folder. Mixed sizes are fine; each is cropped on its own.
- **The folder is read when the theme is applied.** A picture dropped in while that theme is
  active joins the deck the next time the theme is applied or the app opens.
- **If a theme has both a single `backdrop` file and a `backdrops/` folder, the folder wins.**

### Timers

The Timers screen is a board of clocks running independently. Start several at once if a sitting
covers more than one thing.

Three modes:

- **Stopwatch** — counts up until you stop it.
- **Countdown** — counts down from a length you set. It records the time that actually elapsed,
  so stopping early logs what you really did.
- **Pomodoro** — a set number of work intervals with breaks between them. You choose how many
  (at least two), and how long work and break run; Settings → Timers holds the defaults. Breaks
  sit between intervals only, so a run starts and ends on work. Cibo chimes at every changeover
  and moves straight on — work to break, break to the next interval, no interruption. Only when
  the last interval ends does it stop and ask what to do with the time. If you want to keep
  going from there, it asks for a fresh number of intervals and lengths, and carries on with the
  time you have already banked.

Stopping a clock yourself and reaching the end of a run are the same event: you get the same
prompt, and logging writes an ordinary session into today's form. Anything a timer produces you
could have typed by hand.

**A clock asks its questions when you join a habit to it**, not when you log. A project habit
asks which entry; a habit with a per-session category — Coding's language, Writing's stage — asks
that too, so the session arrives in the form already complete. Only habits that measure time are
offered.

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

Backups are automatic, and they are the desktop PC's job. **On the PC, Cibo backs up every time
it closes cleanly**, and if it has been more than about a week since the last good one — which is
what happens if it crashed — it backs up when it opens instead. There is no schedule to configure,
because opening and closing the app *is* the schedule.

#### The PC is the anchor

**The desktop PC is the only machine that writes backups, and the only one that restores from
them.** On the Mac there is no Backups section in Settings and no backup command in the palette —
deliberately, not because something failed to load.

The reasons are practical. All backups share one folder on the cloud drive and one slot per day,
so with two machines writing, the last one to close would own the day's slot — a laptop closing on
a half-synced copy could quietly replace the day's real backup with a thinner one. One writer
means the day's backup is always the fullest picture there is. And a second device never needed
backup files anyway: under sync, its way back has always been the recovery phrase, not a file.

Nothing logged on the Mac is left out. Everything it records reaches the PC by sync and is backed
up there with everything else. The one honest gap: something logged on the Mac while the two
machines have not talked yet is not in any backup until they do — if a big logging session
matters to you, let the two sync before shutting everything down.

Recovery, in one line each:

- **The Mac is lost or replaced** — install Cibo, then **Settings › Storage › Restore from a
  phrase**, exactly like adding a second device. No backup file is involved.
- **The PC is lost** — the backups on the cloud drive rebuild it, and the Mac then follows the
  rebuilt PC by sync.

**The automatic part has a switch.** **Settings › Backups › Automatic backups** turns the
close-and-launch backups off for this machine — the pane, the last-backup line and the Health row
all say *paused* while it is — but **Back up now** (same pane, or the palette) always runs
regardless. The switch exists for the odd occasion you do not want a close to claim the day's
slot; leaving it on is the normal state.

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

### Sync

Cibo can keep two devices carrying the same data. **Sync moves your data, not the app** — you
install Cibo on each machine separately, and each one keeps its own look and its own local
settings.

Sync is **on by default**, and the switch is in **Settings › Storage**. Turning it on or off takes
effect the next time Cibo opens.

#### Your recovery phrase

Your data is identified by a **twelve-word recovery phrase**, also in Settings › Storage, where you
can reveal and copy it. That phrase *is* your data's name — it is what a second device uses to find
the data and recognise it as yours.

> **Keep the phrase somewhere outside Cibo** — a password manager, or paper. It is not stored in
> your backups, and if every device is lost there is no way to look it up.

#### Adding a second device

Install Cibo, open it, and complete the setup screen as normal. Then go to **Settings › Storage ›
Restore from a phrase**, enter the phrase from your first device, and confirm.

Cibo waits for your data to arrive rather than starting you off empty, and it arrives **once** — you
will not end up with two of everything. After that the setup screen never appears again on that
device, because "setup is done" is one of the things that syncs.

**The relay has to be reachable while you join.** Your data comes through it, so the PC that runs
it must be on. If it is not, Cibo does not start you off empty and hope — it holds on the
"waiting for your data" screen with a **Try again** door, and a deliberate **Start fresh** for
the case where you really do want an empty store.

#### What syncs, and what does not

- **Syncs:** your habits, everything you have logged, your entries, and the preferences that are
  meant to be the same everywhere.
- **Stays on each device:** the theme you picked, UI scale, reduce effects, and where your cloud
  folder lives. These are deliberately per-device, because the two screens are not the same size.
- **Cover art does not travel by sync.** Images live in your cloud folder and reach the other device
  through the cloud drive.

#### Speed, and working offline

When both devices are running, a change appears on the other one within seconds.

The two devices do not talk directly — they pass changes through a small relay program on the
desktop PC. While that machine is off, the laptop simply keeps your changes and sends them the next
time both are up.

When a device has been away for a while, **catching up takes minutes rather than seconds.** The
connection waits longer and longer between attempts while there is nothing on the other end, so it
takes a little time to notice you are back. This is normal, and nothing is lost while you wait.

Working offline is ordinary. Everything keeps working with no connection at all.

> **You will never be asked to resolve a conflict.** If both devices change the same thing, Cibo
> merges them quietly. There is no conflict screen anywhere in the app, deliberately.

If sync hits a real error it says so once, in a small message, and carries on. **A sync problem
never blocks you and never costs you a log.**

#### Restoring while sync is on

This one is worth reading twice.

> **Restoring a backup while sync is on rewinds everything, not only this device.** The restored
> data becomes the truth, and the other device follows it back.

So while sync is running, the **recovery phrase** is the everyday way to get your data onto a
device, including a replacement one. The **backup** is the deep net — for when the data itself is
wrong and you want to go back to how it was. When you do reach for it, **have the other device
closed first** — a device still running could push the history you are trying to undo straight
back.

### Data Doctor

Data Doctor checks your data for things that are probably mistakes — a session pointing at an
entry that no longer exists, a cover file that has gone missing, a category that was removed, the
same book entered twice. The checks are quick and run quietly when the app starts — that is one
of the things that lights the health dot — and again when you open **Settings › Health**. What
they never do is act on their own: a finding waits for you, and fixing it is always your click.

The ten checks, in plain words: sessions pointing at an entry that no longer exists · a category
value that was removed from its list · a sleep that ends before it starts · a sleep longer than a
habit allows · a session dated in the future · an icon name the app cannot draw · an entry with
no cover art · a cover file that has gone missing · an image file no entry owns · the same thing
entered twice. Only the first kind — actual errors — lights the dot; the rest wait quietly for
your next visit.

Findings are described plainly and are usually fixable in a click. If something it flags is
actually fine and you would rather not see it again, mute it — the finding is remembered as muted
rather than deleted, and muting travels between your machines. When a check turns up a pile of
stray files, a **Delete all** button clears the visible lot in one confirmed go — muted findings
are left alone by construction.

The same Health section holds the rest of the app's status: when the last backup ran, a
**Test connection** button for each importer, the sync row with its **Check for updates** button,
and any recent errors. The dot on the rail's Settings entry lights when something in here wants
attention, and clicking it brings you straight here.

Data Doctor has far less to do than its predecessor did. Most of what the old vault's linter
caught were formatting mistakes in text files — quoting, casing, name collisions. Those cannot
happen now.

### Palette

`Ctrl K` opens the palette from anywhere. It does two things.

**It teleports.** Type the name of a habit, an entry, a date, a settings section, or a manual page
and go straight there. Every page in this manual is a destination.

**It runs a short list of actions.** Ten, and the list is deliberately small and fixed; the
palette is not a hidden second menu with everything in it: **New habit** · **New entry** ·
**Back up now** · **Open backups folder** · **Open themes folder** · **Switch theme** ·
**Run data checks** · **Test connection** · **Check for updates** · **Advanced Search**. You can
turn individual actions off in **Settings › Palette** if you never use them, which hides them
without removing them.

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

### Whimsy & the Calendar

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
perfectly reasonable thing to do. The weather card reads in °F by default; the same pane switches
it to °C. One card is about your tracking rather than the sky — the **lifetime** card, which
counts everything you have ever logged in the app.

These settings travel between your machines. They are facts about you, not about a particular
computer, so the laptop does not ask you again.

None of it affects your data. It is the part of the app that exists because a calendar you look at
every day may as well tell you when the sun sets.

### Updates

Cibo updates itself, and it does so quietly. Each time it opens it checks the app's release page
for a newer version and, if there is one, downloads it in the background; the update is
**installed when you next quit**, and the next launch is the new version. Nothing is announced —
an update is maintenance, not news — and an offline launch simply skips the check.

If you want to know rather than wait, **Check for updates** is in the palette and on the sync row
of **Settings › Health**. That door does talk: it tells you whether you are current, and it
reports a failure plainly, because you asked.

There is one channel and no rollback. If an update ever leaves the app unable to open, the fix is
to **download the latest installer from the release page and run it over the top** — your data,
settings, backups and themes all live outside the install folder and are untouched by an
install, an uninstall, or an update. The version you are running is shown in
**Settings › Help › About**.

