# What's new in Daybloom

Each release lists what it adds and fixes. Write new items under **Next** as they land;
`npm run release` turns Next into the new version's notes. The notes show on the GitHub
release, in the app's update card, and once after the update.

Format: `### New`, `### Addons` and `### Fixes`, each with `- **Name** — one plain sentence.`

## Next
### New

- **Daybloom on Android** — the planner, the dial and your day on your phone, drawn edge to edge, with the back gesture closing what is open. Install the APK from the release; the app tells you when a new version is ready and installs it with one tap.
- **Reminders and alarms with the app closed** — on your phone, block starts, heads-ups, your alerts and salah times arrive on time even when Daybloom is closed. A block set to ring as an alarm rings like a clock, in its own tone and starting gently, over the lock screen with Snooze and Stop. A focus counts down in your notifications.
- **Widgets on your home screen** — a dial of the next 12 hours with what is on now, a live countdown and Done; and Alef, with one small next step and Start 2 min. Add them in Settings › Phone.
- **Quick add from anywhere on your phone** — share text to Daybloom, tap Quick add in your quick settings, or press and hold the app icon.
- **Sync with Cloudflare D1** — keep your devices the same through a database in your own Cloudflare account. Everything is sealed with your master password before it leaves your device, so Cloudflare keeps only ciphertext. Use it alone or together with GitHub Sync.
- **A master password for sync** — one password seals everything you sync. You get a recovery key when you set it; you can change the password or make a new recovery key at any time. Turning encrypted sync on or off asks for it. On a phone, your fingerprint can unlock it.
- **Encrypted GitHub Sync** — turn on encryption in Settings › Connect › Sync and your repo keeps only sealed files.
- **More of your day syncs** — the Trash, what you did with calendar events, your AI setup, Alef, Retrospection and Soft landings now sync too. With encryption on, your calendar subscriptions and your AI keys sync as well, so a new device needs only your password.

## 0.2.0
### New

- **AI, set up once** — Settings › AI holds every AI service in one place: add a key and a model once, agree once, then choose what each part of Daybloom uses to think, listen and speak. Alef, Ask Daybloom, Make it smaller and voice input each pick a service and a model, or stay on this device.
- **Ask Daybloom with AI** — choose an AI service for Ask Daybloom and it plans with your day and Daybloom's tools; one Undo takes back everything it changed.
- **Voice input with AI** — choose a listening service (such as OpenAI) to turn your voice into words; Whistle on this device stays the fallback.
- **Alarms** — set any timed block to ring as an alarm, with its own tone if you like. It comes to the front with Stop, Snooze and Start now, and rings out by itself. Pick the tone, volume, snooze and gentle start in Settings › Rhythm › Alarm. Quick add understands “alarm at 7am” and “wake me at 6:30”.
- **World clock** — compare your time with up to two other cities. Their day and night show as thin rings around the dial, with dawn and dusk shaded and each city's time beside it. Pin cities from the time-zone chip or in Settings › Rhythm › World clock.
- **Tick or skip calendar events** — meetings and other events get a tick in the timeline, like your blocks, and count in your week. Skip one you won't attend: it steps back and its time is free for plans. Your calendar itself stays as it is.
- **What you've done** — a new Done tab in Your week lists everything you finished, day by day: blocks, backlog tasks, calendar events and salah, each with its time, with search and filters. Open it from "3 of 5 done" in the timeline, from the dial, or from the backlog. Change your mind with "Not done after all", and Undo. Your week, badges, your rhythm and Retrospection count from the same list.
- **The month at a glance** — click the date in the top bar, the calendar button, or press M: every day of the month is a tiny dial of its blocks. Move by month, jump to today, or type “fri”, “next week” or “12 nov” to go there. Browse other weeks in the week strip without leaving the day you're on.
- **A top bar that fits** — at any window width, buttons that don't fit move into a tidy More menu, grouped, and come back as the window grows. Choose which buttons show in Settings › Screen › Top bar.
- **A clearer update card** — a new version shows at the bottom right with what it brings, one button to update and restart, and its progress.
- **Box breathing** — Breathe on the dial is now box breathing: in, hold, out and rest, each the same length (3–6 seconds), or the calmer 4·4·6·2 rhythm. A soft sphere grows and glows with each breath, a bead of light travels a ring round the four phases, and a real-sounding breath (made on your computer) follows it — or gentle tones, or silence. Choose in Settings › Rhythm › Breathe.
- **Long words on the widget** — long titles slide gently under the dial's round edge. Click one, or let Alef answer, and the words open in a wing beside the dial, on the side with room, typing out Alef's replies. Set it up with a live preview in Settings › Screen › Desktop widget.
- **Answers you can tap** — with an AI service, Alef and Ask Daybloom can answer with small cards as well as words: a plan with tick boxes to place in one go, free times with “Add here”, a block with Done and Start 2 min, first steps, quick replies and charts of your week.
- **A clean start** — the sample day is easy to clear: at the end of getting started, with one tap once you plan your own blocks, or in Settings › App.
- **Reset Daybloom** — in Settings › App, choose what to clear: blocks, progress, settings, addons and their data, AI services and keys, calendars, sync, downloaded models — or everything. Save a copy first, then hold to confirm.
- **Trash** — deleted blocks and backlog items wait in the Trash for 30 days. Restore one with a tap, or delete it forever. Open it from the backlog or Settings › App.
- **Help me start** — when one of your blocks begins, Daybloom has one tiny, concrete first step ready for it — like “open the Q3 numbers sheet” or “pull out the dish soap” — added as the block's first step, with a warm word and one tap to start it as a 2- or 5-minute focus. Try another idea, or say “Not now” and it lets go. When the short focus ends, the step is ticked: you started. With an AI service for Getting started in Settings › AI, the step fits your exact task and notes; without one, it comes from ready-made first steps. Alef offers the same step when it's on. Turn it off in Settings › Rhythm › Gentle support.

### Addons

- **Timeline views** — a new addon that shows your day as a Board or a Gantt chart. On the Board, drag blocks between Later, Today, Now and Done, or across the week; a block from Later goes to the first free time. On the Gantt chart, see a day, three days or a week side by side, and drag to move, stretch or paint blocks along the hours. Calendar events and salah stay in place.
- **A new Addons screen** — addons sit in calm groups you can search and filter, with their details beside the list, each with a small animated scene of what it does. Switching one on gives a little hop and spark.
- **Alef, on your side** — Alef now reacts as things happen: it nods when you add a block, watches while you drag one, looks at the block you pick and notices a new look. It offers one small next step at the right moments (start for two minutes, make it smaller, ten more minutes, move it, a fresh start), never a scolding look. With an AI brain it writes its own hellos, check-ins and cheers, shows what it's doing while it works with your day, and its feelings change as it talks. Your last conversation is still there next time.
- **Waqt: mark salah in one tap** — tick a prayer right in the timeline: on time while its time lasts, made up after. Hold or right-click the tick to choose in jamaat, late or qasr. Or tap the salah on the dial and choose On time, In jamaat or Made up right there.
- **Waqt: your salah in charts** — a headline of what's going well, the week as stacks of five, the month as a calm grid, a ring per prayer with its run of on-time days, the share on time week by week, and how soon after the adhan you usually mark it.
- **Alef watches you, everywhere** — its eyes follow the pointer anywhere on your screen, on the dial and on the widget, with no extra permission.
- **Alef's voice from an AI service** — Alef can speak in a voice from an AI service, through its own small speaker.
- **Make it smaller with AI** — with an AI service chosen, the steps fit your exact task and your moment: its notes and the steps it already has, the time before your next block, and how long tasks like it really take you. Each step says when it's done, a practical tip comes with them, and any step can be made smaller again. The built-in ideas still show at once.
- **Reality check with AI** — choose an AI service for Reality check in Settings › AI. When you set a block's length, it suggests a realistic one from your own record, with the reason (“your report blocks run about 40% long”) and a tip. In Reality check, practical tips look at your record and today's plan, each with a one-tap fix: give a repeating task its real length, or move a block to tomorrow so today fits.

### Fixes

- **Free time is really free** — adding something “in my free time”, planning your day and moving a block now step around calendar events and salah (also when salah blocks are hidden on the dial), stay within your waking hours, and move to the next day when today is full. Alef and AI apps (MCP) see the same free time.
- **“Add reading in my free time”** — now adds it to your next free time instead of only listing the gaps.
- **Microphone on Windows** — if the microphone was blocked once, it works again. Daybloom asks Windows itself, and a button opens the microphone settings when they are off.
- **Deleted blocks stay deleted** — the sample day no longer comes back after you clear your blocks, and Clear all is remembered by sync.
- **Twenty themes** — ten new palettes (Dawn, Sakura, Sand, Sky, Lemon, Dusk, Ocean, Ember, Cobalt and Bordeaux) and eleven new dial finishes (Ceramic, Lilac, Blossom, Sandstone, Azure, Champagne, Twilight, Lagoon, Copper, Sunray and Claret), grouped Light and Dark with live mini-dials. Every theme and finish is checked for readable contrast.
- **Calmer blocks** — no more stripes or star patterns. Your blocks are solid, calendar events are clear glass with one crisp edge, and salah glows softly. Skipped events fade to an outline, and blocks whose time passed get a quiet dashed edge, never red.
- **Dragging in the timeline** — the dial now shows the block moving as you drag it.
- **Alef on the widget** — its sounds and voice play on the widget at once when the planner is closed, instead of seconds later.
- **Waqt's icon** — Waqt now has its own mihrab icon, so it no longer looks like the dark-mode moon.
- **Kinder words** — check-ins ask how it went, and reminders never say time's up.

## 0.1.13

### New

- **Blocks open like a genie** — a block's editor pours out of the block you clicked, in the timeline or on the dial, and back into it when you close it. Calendar events, salah and backlog tasks too.

### Addons

- **Alef on the widget** — talk to Alef from the desktop widget: click the chat button or just start typing, or hold Space to speak. Its answer shows over the dial, and the talk stays in Alef's chat in the planner.
- **Alef knows you** — under About you, tell Alef what to call you, a few words about yourself and how to talk to you (warm, playful, calm or brief). It greets you by name, and an AI brain uses your words to fit its help to you.
- **Glass shine** — turn off the glint across Alef's screen in Alef's settings.

### Fixes

- **Alef's eyes** — when Alef frowned or looked sad, one eye's lid could cut too deep, so that eye looked cut off. Both eyes now match.
- **Alef's long answers** — show in full, on the dial and on the widget, and stay up long enough to read (longer still while you point at them).
- **Widget edges** — the widget's shadow no longer ends in a straight line on light desktops.
- **Update notes** — read clearly in every version of the app, also in older ones.

## 0.1.12
### New

- **Join meetings in one click** — Google Meet, Zoom and Teams events get a Join button in the timeline, lit from 10 minutes before. Open an event to see who's coming, their answers and the notes.
- **Calendars in the top bar** — see when they last synced, sync now, and choose how often they check.
- **Move a block to the backlog** — from its hover buttons, from the block editor, or drag it onto the Backlog. Undo is one tap away.
- **What's new** — updates now say what they bring before you install them.

### Addons

- **Alef** — a small robot friend lives in the middle of your dial, on the widget and in focus mode. Its eyes show how it feels about your day: 32 feelings, from glad to sleepy. It keeps you company while you work, cheers your wins and asks kindly about blocks that ended. Pet it, tickle it or poke it; it welcomes you back, asks you to stretch and dances when the day is done. Talk to it to plan: on this device, or with OpenAI, Anthropic, Gemini, OpenRouter, Cloudflare or your own service, only after you agree. It speaks in little robot sounds or with a small voice made on your computer.
- **Retrospection** — look back over a week or a month, kindly: the story in a few lines, bright spots, your days at a glance, the rhythm of your day and where the time went; then what could be easier, each with a gentle tip and a one-tap fix, and three lines of your own.
- **Soft landings** — after meetings, energy dips. Daybloom keeps a few minutes free to land, marks back-to-back hand-offs in the timeline with “Make room”, and when a meeting ends offers three small stepping stones: a reset, a little spark, and a two-minute first step into what’s next.
- **Waqt: your salah** — mark each prayer on time, in jamaat or made up late, and qasr while travelling. See a week or a month: how the prayers went, each prayer's streak, and kind notes on what's going well.

### Fixes

- **Timeline colours** — icons and capsules follow the app's light or dark look (not the dial's finish), and every icon has enough contrast on its background.
- **Backlog** — opens out of the button you pressed and pours back into it on close, like the macOS genie.
- **Closing panels** — every panel (a block, a backlog task, a calendar event, salah, settings, addons) closes with ✕, Esc or a click outside; clicking another block on the dial opens that block instead. A new block that never got a name goes away quietly however you close it.
- **New block layout** — the block editor fits its panel at any window size: day and time sit side by side, and Delete is a small bin (with “skip just this day” for repeating blocks) so Close always fits. Long titles in “Close the day” wrap instead of running off the edge.
- **Menu bar** — the countdown and the next block stay current while the planner is closed. The menu shows what's now and what's next.
- **Widget** — shows the same dial face, colours, salah times and day as the planner.
- **Screen cues** — the edge glow ends when a session ends or pauses. Leaving focus mode tells you the session keeps running, with a way to end it.
- **Sounds** — play reliably after sleep, a change of speakers or using the microphone, and keep time while the planner is closed.
- **Google Calendar** — hiding all repeats of an event now works for Google events.

## 0.1.11

### New

- **A new day and time picker** — type “fri”, “30 oct”, “930” or “2:30pm”, or drag the hand on a small dial that shows your other blocks, so free time is easy to see. **Next free** finds a slot that fits.
- **A timeline filter** — show or hide your blocks, calendars, salah, finished blocks, free time and kinds of block.
- **Time you can see** — a capsule fills while its block runs and is full when its time has passed; the line through the timeline fills down to now, and free time is an empty glass.
- **Past blocks step back on the dial**, so what comes next reads first.

### Fixes

- **Sync** — Breadcrumbs, Reality check and Waqt now sync between your computers. The Time Tracker's app tracking stays on each computer.

## 0.1.10

### New

- **A timeline you can resize** — it fits the room beside the dial by itself; drag its edge to make it wider or narrower.

### Fixes

- **12-hour clock** — Auto now follows your computer's clock, so times show as 2:30pm where your computer uses 12-hour time.
- **More room for titles** — the move, copy and remove buttons appear only on hover.

## 0.1.9

### Addons

- **MCP** — Claude, Codex and other AI apps can read your day, find free time and add or move blocks, with an Undo for every change.
- **Waqt** — the five salah times on your dial and in your plans, with adhan, jamaat and Jumu’ah reminders.
- **Breadcrumbs** — leave one line about where you stopped a task; see it when you come back.
- **Make it smaller** — a task that feels too big breaks into small, friendly steps.
- **Reality check** — learns how long your blocks really take and offers a better length when you plan.
