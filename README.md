<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="Daybloom icon">

# Daybloom

**See your day. Feel the time.**

A visual day planner and timer for macOS and Windows.<br>
Your day is a dial. Each block is an arc on the ring, and the orange hand is now.

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Falshell7%2Fdaybloom-releases%2Fmain%2Flatest.json&query=%24.version&label=version&color=3d6ee8)](https://github.com/alshell7/daybloom-releases)
![macOS](https://img.shields.io/badge/macOS-Apple%20silicon%20%2B%20Intel-121826)
![Windows](https://img.shields.io/badge/Windows-10%20%2B%2011-121826)
![Offline](https://img.shields.io/badge/works-offline-1f9e6a)

[**Download for macOS**](https://github.com/alshell7/daybloom-releases#macos-apple-silicon--intel) &nbsp;·&nbsp; [**Download for Windows**](https://github.com/alshell7/daybloom-releases#windows) &nbsp;·&nbsp; [Guide](#guide) &nbsp;·&nbsp; [Build from source](#for-developers)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/hero-dark.png">
  <img src="docs/media/hero-light.png" width="880" alt="The Daybloom planner. A dial shows the day as coloured arcs and a timeline lists the blocks.">
</picture>

</div>

<br>

## See it move

<div align="center">
<img src="docs/media/demo.webp" width="880" alt="A tour of Daybloom: the dial, the four dial types, quick add, voice, the focus launcher, themes, finishing a block, the desktop widget and screen cues.">
<br>
<sub>The animation does not play? <a href="docs/media/demo.mp4">Watch the video (MP4, 71 s)</a>.</sub>
</div>

<br>

## Contents

- [What Daybloom does](#what-daybloom-does)
- [Install](#install)
- [Guide](#guide): [the dial](#read-the-dial), [add blocks](#add-a-block), [change blocks](#change-a-block), [finish blocks](#finish-a-block), [backlog](#use-the-backlog), [assistant](#ask-daybloom), [voice](#talk-to-daybloom), [your week](#see-your-week), [gentle support](#get-gentle-support), [focus sessions](#start-a-focus-session), [screen cues](#use-screen-cues), [privacy mode](#use-privacy-mode), [addons](#use-addons), [Work](#bill-your-time-with-work), [Time Tracker](#track-your-time), [widget](#use-the-desktop-widget), [themes](#change-the-theme), [time zones](#change-the-time-zone), [calendars](#connect-calendars), [sync](#sync-with-github), [shortcuts](#keyboard-shortcuts)
- [Your data](#your-data)
- [For developers](#for-developers)

<br>

## What Daybloom does

<table>
<tr>
<td width="50%" valign="top">

### Time you can see
The ring shows your blocks as arcs. The remaining time of a block shows as a shrinking ring and a countdown. You do not have to calculate.

</td>
<td width="50%" valign="top">

### Four ways to read the dial
**12 h** shows the next 12 hours. **24 h** shows the whole day. **Hour** shows one hour as a wedge. **Cycles** shows focus rounds with breaks.

</td>
</tr>
<tr>
<td colspan="2"><img src="docs/media/dials.png" alt="The four dial types: 12 hours, 24 hours, one hour and focus cycles."></td>
</tr>
<tr>
<td valign="top">

### Plan in plain words
Type “gym 5pm 45m” or “standup weekdays 9:30 15m”. A preview shows what Daybloom understood before you press Enter.

<img src="docs/media/quick-add.png" alt="Quick add with the text 'coffee with Sam 4pm 30m every friday' and a preview of the block.">

</td>
<td valign="top">

### Details on hover
Move the pointer over an arc. A card shows the times, the time left and the next step.

<img src="docs/media/hover.png" alt="A hover card on the dial for the block 'Draft the proposal'.">

</td>
</tr>
<tr>
<td valign="top">

### A backlog for later
Put tasks in **Inbox**, **Next** or **Someday**. Give them a priority and a due date. Drag one onto the dial to schedule it.

<img src="docs/media/backlog.png" alt="The backlog panel with an inbox of tasks, priorities and due dates.">

</td>
<td valign="top">

### Ask in your own words
Ask “plan my day” or “what's next”. The assistant answers with cards that you can use. It runs on your computer.

<img src="docs/media/assistant.png" alt="The assistant panel with a plan that places six backlog items into free time.">

</td>
</tr>
<tr>
<td valign="top">

### Your week and your rhythm
See what you finished this week. A rhythm counts the days on which you finished something. A rest day can cover a missed day.

<img src="docs/media/insights.png" alt="The 'Your week' panel with seven small dials, observations and a 17-day rhythm.">

</td>
<td valign="top">

### Focus on one thing
Focus mode shows only the session, the steps of the task and the next block.

<img src="docs/media/focus.png" alt="Focus mode on a black theme with the current block and its steps.">

<br><br>

### Ten themes
Four light themes and six dark themes, including true black.

<img src="docs/media/themes.png" alt="Eight dials in the themes Fog, Linen, Mist, Sage, Black, Forest, Plum and Cocoa.">

</td>
</tr>
<tr>
<td valign="top">

### Just say it
Hold <kbd>V</kbd> and talk. Your words appear as you speak, and the assistant acts on them when you stop. Speech recognition runs on your computer.

<img src="docs/media/voice.png" alt="The voice capsule while listening, and the answer card after 'Add yoga tomorrow at 7:30 for 30 minutes'.">

</td>
<td valign="top">

### Focus your way
Pick what to focus on and turn the dial to any length, from 1 minute to 2 hours. Use one stretch, or cycles with breaks.

<img src="docs/media/focus-launcher.png" alt="The focus launcher with targets, a time dial set to 40 minutes, and length chips.">

</td>
</tr>
<tr>
<td colspan="2" valign="top">

### Cues at the edge of your screen
An optional edge glow breathes in the colour of the task, and breathes faster near the end. A thin time bar drains on the edge that you choose. A small HUD shows the time left in a corner. None of them take a click.

<img src="docs/media/screen-cues.png" alt="A desktop with a breathing blue edge glow, a time bar at the top, a HUD in the top-right corner, and the Daybloom widget.">

</td>
</tr>
<tr>
<td valign="top">

### Addons
Switch on new powers when you need them. Your day stays as it was when you switch one off.

<img src="docs/media/addons.png" alt="The Addons gallery with the Work and Time Tracker addons.">

</td>
<td valign="top">

### Work: every block can earn
Give blocks a project and a rate. See what you earned this week, budgets, and the work that isn't billed yet. Make a bill and print it to PDF.

<img src="docs/media/work.png" alt="The Work overview with earnings, an earnings chart, projects, a budget and unbilled work.">

</td>
</tr>
<tr>
<td valign="top">

### Time Tracker
A live stopwatch for any block or project. Daybloom notices when you step away, and focus sessions track themselves.

<img src="docs/media/tracker.png" alt="The Time Tracker with a running stopwatch and today's entries.">

</td>
<td valign="top">

### Calendars in one place
Sign in with Google, or paste a calendar link from Google, iCloud or Outlook. Daybloom shows a preview before it adds anything.

<img src="docs/media/calendars.png" alt="The Calendars panel with two ways to add a calendar.">

<br><br>

### Privacy mode
Keep Daybloom out of screenshots, screen recordings and screen sharing with <kbd>⇧</kbd><kbd>⌘</kbd><kbd>P</kbd>.

</td>
</tr>
<tr>
<td colspan="2" valign="top">

### Always in view
A small, transparent dial floats over your work or sits on the desktop. On macOS, the menu bar shows the countdown.

<img src="docs/media/desktop-widget.png" alt="The Daybloom widget floating on a desktop next to a document window.">

</td>
</tr>
</table>

**Also included:** voice dictation in quick add · recurring blocks · multiple Google Calendar accounts and calendar links · sync between computers through a private GitHub repo · notifications and soft sounds · a one-minute breathing guide · an evening wind-down · keyboard control · signed automatic updates.

<br>

## Install

Get the newest installers from [**daybloom-releases**](https://github.com/alshell7/daybloom-releases).

### macOS

1. Download `Daybloom_<version>_universal.dmg`. It works on Apple silicon and Intel Macs.
2. Open the `.dmg` file.
3. Drag **Daybloom** into **Applications**.
4. Open Daybloom from **Applications**.
5. If macOS stops the app, open **System Settings › Privacy & Security**.
6. Scroll to **Security**. Click **Open Anyway** next to the Daybloom message.

> [!NOTE]
> Daybloom is not notarised by Apple yet. Thus macOS asks you once. Later updates install without this step.

### Windows

1. Download `Daybloom_<version>_x64-setup.exe`. The `.msi` file is an alternative for managed computers.
2. Run the installer.
3. If Microsoft Defender SmartScreen shows a warning, click **More info**.
4. Click **Run anyway**.

### Updates

Daybloom checks for updates when it starts and every 6 hours. When an update is available, an **Update** chip shows in the top bar.

1. Click **Update**.
2. Wait while the chip fills. Daybloom downloads the update and checks its signature.
3. Daybloom restarts with the new version.

To check manually, open **Settings › Updates** and click **Check now**.

> [!IMPORTANT]
> Daybloom installs only updates that have a valid signature. It rejects all other files.

<br>

## Guide

The guide uses these terms:

| Term | Meaning |
|---|---|
| **Block** | One item on your day, with a start time and a length. Example: “Lunch, 12:30, 40 min”. |
| **Dial** | The clock face. Each block is an arc on its ring. |
| **Hand** | The orange line on the dial. It points to the current time. |
| **Timeline** | The list of blocks on the right side of the planner. |
| **Backlog** | The tasks that do not have a time yet. |
| **Widget** | The small dial that stays on your desktop. |

### Read the dial

- The **hand** shows the current time.
- The **centre** shows the time left in the current block. In the last 5 minutes, it counts seconds.
- The **inner ring** gets shorter as the block uses its time.
- A dotted block is a block that ended without a tick.
- A hatched block is an event from a calendar. You cannot edit it in Daybloom.

To change the dial type, click **12 h**, **24 h**, **Hour** or **Cycles** below the dial. You can also press <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> or <kbd>4</kbd>.

### Add a block

**With words:**

1. Click the **Quick add** field at the top of the timeline.
2. Type the block in plain words.
3. Look at the preview. Make sure that the time and the length are correct.
4. Press <kbd>Enter</kbd>.

| You type | Daybloom adds |
|---|---|
| `gym 5pm 45m` | Gym, today at 17:00, 45 minutes |
| `lunch 12:30 for 45 mins` | Lunch, today at 12:30, 45 minutes |
| `meds every day 8am` | Meds, every day at 08:00 |
| `standup weekdays 9:30 15m` | Standup, Monday to Friday at 09:30, 15 minutes |
| `team sync every mon and thu 2-3pm` | Team sync, every Monday and Thursday, 14:00 to 15:00 |
| `dentist on fri at 3` | Dentist, next Friday at 15:00 |
| `yoga every other day 7am 30m` | Yoga, every 2 days at 07:00, 30 minutes |
| `water plants anytime` | Water plants, today, without a fixed time |
| `return parcel later` | Return parcel, in the backlog |

**With one key:** press <kbd>N</kbd>. Daybloom adds a 30-minute block in the next free time and opens it for editing.

**On the dial:**

1. Put the pointer on the ring at the start time.
2. Push and hold the mouse button.
3. Drag around the ring to the end time. The dial clicks at each 5-minute step.
4. Release the mouse button.

### Change a block

- **Move:** drag the block up or down in the timeline, or drag its arc on the dial.
- **Change the length:** drag the bottom edge of the block in the timeline, or drag the knob at the end of its arc.
- **Fine adjustment:** put the pointer on an arc and turn the scroll wheel.
- **Edit the details:** click the block. You can change the title, icon, colour, repeat rule, alerts, steps and notes.
- **Repeating blocks:** when you edit a repeating block, select **Every time** or **Just this day**.
- **Remove:** select the block and press <kbd>Delete</kbd>.

### Finish a block

- Click the circle at the right of the block in the timeline.
- Or select the block and press <kbd>Space</kbd>.

The block fills, gets a line through its title and lights up on the ring.

When a block ends without a tick, Daybloom asks “Did you finish?”. Select one of these:

| Option | Result |
|---|---|
| **Done** | The block is finished. |
| **+15m** | The block gets 15 more minutes. |
| **Later** | The block goes to the backlog. |
| **Let go** | The block stays as it is. Daybloom does not ask again. |

### Use the backlog

1. Click the **Backlog** button in the top bar, or press <kbd>B</kbd>.
2. Type in **Brain dump**. Put one task on each line.
3. Sort the tasks into **Inbox**, **Next** and **Someday**.
4. To schedule a task, drag it onto the dial. You can also click **Plan my day**.

Use **Must**, **Should** and **Could** to set the priority. Add a due date to make a task show earlier.

### Ask Daybloom

1. Press <kbd>⌘</kbd> <kbd>K</kbd> on macOS or <kbd>Ctrl</kbd> <kbd>K</kbd> on Windows.
2. Type a request.
3. Press <kbd>Enter</kbd>.
4. Use the buttons on the cards to do the action.

Examples:

- `what's now?`
- `plan my day`
- `add gym at 5pm for 45 minutes`
- `move lunch to 2pm`
- `start a 25 minute focus`
- `show backlog`
- `how did my week go?`

You can also speak your request. See [Talk to Daybloom](#talk-to-daybloom).

The assistant works in **basic mode** without a download. For better understanding of requests, download **Needle**:

1. Open **Settings › Assistant**.
2. Click **Download** (35 MB, one time).

Needle is a small on-device model by [Cactus Compute](https://cactuscompute.com/needle) (Apache-2.0). Daybloom checks the download with SHA-256. After the download, the assistant works offline. It does not send your requests to a server.

### Talk to Daybloom

**Talk once (push to talk):**

1. Push and hold <kbd>V</kbd>.
2. Say what you want. Example: “Add gym at 5 for 45 minutes”.
3. Release <kbd>V</kbd>.

**Talk hands-free:**

1. Push <kbd>V</kbd> one time and release it.
2. Speak. Daybloom stops listening when you pause.

The voice capsule shows your words while you speak. When you stop, the assistant does the action and shows its card. Push <kbd>Enter</kbd> to send immediately, or <kbd>Esc</kbd> to cancel.

You can also click the microphone in **Quick add** or in **Ask Daybloom**. In Quick add, your words go into the field. Look at the preview, then push <kbd>Enter</kbd>.

The first time, Daybloom asks to download **Whistle** (17 MB, one time). Whistle is a speech model by [Cactus Compute](https://cactuscompute.com/blog/whistle) (Apache-2.0). It runs on your computer. Daybloom checks the download with SHA-256.

> [!NOTE]
> The microphone is on only while the capsule shows “Listening”. The first time, macOS or Windows asks for permission to use the microphone.

To change the language, open **Settings › Assistant › Voice**. Commands are understood in English.

### See your week

Click the **Your week** button in the top bar, or press <kbd>I</kbd>.

- **This week** shows seven small dials and what you finished.
- **Last 4 weeks** shows longer patterns.
- **Rhythm** counts the days on which you finished something.
- Each 7 counted days give you one rest day (maximum 2). A rest day covers one missed day, so the rhythm continues.
- Repeating blocks show how many times in a row you did them.

### Get gentle support

Open **Settings › Gentle support**. You can turn on or turn off each item.

| Setting | What it does |
|---|---|
| Ask “did you finish?” when a block ends | Shows the check-in card. |
| Speak up when a block runs into the next | Tells you when the current block overlaps the next block. |
| Suggest backlog items that fit free time | Shows a backlog task that fits a free gap. |
| Time anchors | Gives a soft tick each hour or each 30 minutes. |
| Offer a wind-down at | In the evening, shows what you did and moves open blocks to tomorrow. |

Open **Settings › Transitions** to set the heads-up before a block ends (2, 5 or 10 minutes), notifications and sounds.

In free time, click **Breathe · 1 min** in the centre of the dial for a one-minute breathing guide.

### Start a focus session

1. Push <kbd>F</kbd>, or click the **Focus** button in the top bar.
2. Under **Focus on**, select the current block, the next block, a backlog task or **Just focus**.
3. Under **For how long**, drag the knob around the dial. One lap is 1 hour. Continue past 12 for a second hour.
4. Or click a chip: **Rest of block**, **Until** the next block, a saved length, or **Just 2 min**.
5. Under **Rhythm**, select **One stretch** or **Cycles with breaks**. For cycles, set the number of rounds.
6. Click **Start focus**, or push <kbd>Enter</kbd>.

Focus mode then shows only the session, the steps of the task and the next block. When the session ends, Daybloom asks if the task is done.

- To pause, skip a round or stop, use the buttons in the centre of the dial.
- To go back to the planner, push <kbd>Esc</kbd>. The session continues. Push <kbd>F</kbd> to see it again.
- A backlog task that you focus on becomes a block on today's dial.

### Use screen cues

Screen cues are optional signals on your desktop. They help you keep the time in view, also when Daybloom is behind other windows. They do not take clicks or the keyboard.

1. Open **Settings › Screen cues**.
2. Under **Show them**, select **In focus sessions** or **For every block**.
3. Turn on the cues that you want:

| Cue | What it does | Options |
|---|---|---|
| **Edge glow** | The edge of the screen breathes in the colour of the task. It breathes faster in the last 5 minutes and in the last minute. | Soft, Medium, Strong |
| **Time bar** | A thin bar drains as the time goes. The time left shows at its tip. | Top, bottom, left or right edge. Thin or Bold. |
| **HUD** | A small pill with a ring, the task name and the time left. | Any corner |
| **Colour** | All cues use the colour of the task, or one colour that you select. | Task colour, 7 calm colours, or any colour |

When you turn on a cue, Daybloom shows a preview for a few seconds. You can also turn cues on and off in the focus launcher. Use the HUD, the widget, or both.

### Use privacy mode

Privacy mode keeps Daybloom's windows out of screenshots, screen recordings and screen sharing. Use it when you share your screen.

1. Push <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>P</kbd> (<kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>P</kbd> on Windows). You can also open the **More** menu (…) in the top bar, or the Daybloom icon in the menu bar or notification area, and select **Privacy mode**.
2. A **Private** pill shows in the top bar. Click it to turn privacy mode off.
3. Optional: open **Settings › Privacy** and turn on **Hide block names**. The widget, the HUD and the menu bar then show the category (for example “Focus”) instead of the block name.

> [!NOTE]
> Windows leaves protected windows out of captures. On macOS, screenshots leave them out, but some screen recorders can still capture them. Use **Hide block names** as a second layer when you share your screen on a Mac.

### Use addons

1. Click the **Addons** button (puzzle) in the top bar. You can also open **Settings › Addons**.
2. Turn on an addon with its switch.
3. The addon adds its own button to the top bar and its fields to the block editor.

Addon data is kept separately from your blocks. When you turn an addon off, your day does not change, and the addon keeps its data for later.

### Bill your time with Work

**Do these steps one time:**

1. Turn on **Work** in the Addons gallery.
2. Open **Work › Projects** and click **New project**.
3. Enter a name, and select or add a client.
4. Set a rate: **Per hour**, **Per block** (a fixed amount), or **Client rate**. Optional: set a budget in hours or money.
5. Open **Work › Bills › Your details on bills** and enter your name, email and address.

**Every day:**

1. Open a block and select its project under **Work**. The block editor shows what the block earns.
2. Finish the block. Daybloom adds it to your earnings. If you track time on the block, Daybloom bills the tracked time.
3. Open **Work › Overview** to see the week or the month: earnings, billable time, effective rate, budgets and the work that is not billed yet.

**Make a bill:**

1. Open **Work › Bills** and click **New bill**.
2. Select the client, the period and how to group the lines (by block, by project or by day).
3. Look at the preview, then click **Save bill**.
4. Click **Print / PDF**. The bill opens in your browser. Print it and select **Save as PDF**. Click **CSV** for a spreadsheet.
5. Click **Mark sent** and **Mark paid** to keep the status. Work that is on a bill never goes on a second bill.

Exports go to your **Downloads** folder.

### Track your time

1. Turn on **Time Tracker** in the Addons gallery.
2. Click the stopwatch button in the top bar.
3. Select what you work on (the current block, a later block or a project), then click **Start**. You can also click **Track this block** in the block editor.
4. The time runs in a pill in the top bar. Click the square to stop.

- **Focus sessions** track themselves. Turn this off in **Time Tracker › Settings**.
- **Time away:** when you do not use the computer for 5 minutes (you can change this), Daybloom asks what to do with that time: **Keep it**, **Drop it**, or **Drop it and stop**.
- **Edit entries:** in **Today**, click the times of an entry to change them. Click **Add time** to add time that you forgot to track.
- **Week:** see the hours of each day and the totals by block. Click **Export timesheet (CSV)**.
- **Activity (optional):** turn on **Note the apps I use while tracking**. Daybloom notes the name of the app in front every 30 seconds, only while the stopwatch runs. On Windows you can also note window titles. This data stays on your computer.

### Use the desktop widget

1. Press <kbd>W</kbd>, or click the **Desktop widget** button in the top bar.
2. Drag the widget to a position on your screen.
3. Double-click the widget to open the planner.

Open **Settings › Desktop widget** to change these options:

- **Position:** **Float on top** keeps the widget above other windows. **On desktop** keeps it below other windows.
- **Dial:** the dial type of the widget.
- **Countdown in the menu bar** (macOS only).
- **Open at login.**

When you close the planner, Daybloom stays in the menu bar (macOS) or in the notification area (Windows).

### Change the theme

- To switch between light and dark, click the sun or moon button in the top bar.
- To select a theme, open **Settings › Theme**.

| Light | Dark |
|---|---|
| Fog, Linen, Mist, Sage | Midnight, Black (true black), Graphite, Forest, Plum, Cocoa |

Open **Settings › Comfort** to set **Calm** motion or the **Hyperlegible** reading font.

### Change the time zone

1. Click the globe chip next to the date in the top bar.
2. Search for a city.
3. Select the city.

Repeating blocks keep their clock times. Calendar events keep their real moments.

### Connect calendars

Open the **More** menu (…) in the top bar and select **Calendars**. You can also open **Settings › Calendars**.

**Add a calendar link (Google, iCloud, Outlook and others):**

1. Click **Calendar link**.
2. Paste the link. Daybloom checks it and shows a preview: the name, the next event and the number of events in the next 2 weeks.
3. Change the name if you want, then click **Add**.

**Find the link for a Google calendar:**

1. Open Google Calendar on the web.
2. Open **Settings**, then select the calendar under **Settings for my calendars**.
3. Select **Integrate calendar**.
4. Copy **Secret address in iCal format**. Use the secret address: the public address works only if the calendar is public.

> [!WARNING]
> A secret address gives read access to your calendar. Do not share it. Daybloom keeps calendar links in the system keychain, not in its files.

**Sign in with Google:** click **Google account**. You can add more than one account, for example work and personal. Daybloom needs a Google OAuth client of the type “Desktop app”. See [docs/calendar.md](docs/calendar.md).

Calendar events are read-only. When the same event is in two accounts, Daybloom shows it one time. Each calendar has a switch to show or hide it.

### Sync with GitHub

Sync keeps your blocks, settings and badges the same on all your computers. Daybloom writes small JSON files to a private GitHub repo that you own. There is no Daybloom server.

<img src="docs/media/sync.png" width="360" align="right" alt="The 'Sync with GitHub' section in Settings.">

**Do these steps one time:**

1. On GitHub, create a **private** repository. Example: `daybloom-data`.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
3. Give the token access to this repository only.
4. Set **Contents** to **Read and write**. Do not give other permissions.

**Do these steps on each computer:**

1. Open **Settings › Sync with GitHub**.
2. Enter the repository as `owner/name`.
3. Paste the token.
4. Click **Test connection**.
5. If the repository already has data, select **Use the repo's** or **Combine both**.
6. Click **Start syncing**.

Daybloom syncs a short time after each change, and every 5 minutes. The token stays in the system keychain. Settings that apply to one computer only, for example the volume and the widget position, do not sync.

<br clear="right">

> [!WARNING]
> Use a private repository. In a public repository, everybody can read your tasks.

### Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>N</kbd> | New block in the next free time |
| <kbd>←</kbd> <kbd>→</kbd> | Previous day, next day |
| <kbd>T</kbd> | Today |
| <kbd>1</kbd> – <kbd>4</kbd> | Dial type: 12 h, 24 h, Hour, Cycles |
| <kbd>Space</kbd> | Finish the selected block |
| <kbd>Delete</kbd> | Remove the selected block |
| <kbd>B</kbd> | Backlog |
| <kbd>I</kbd> | Your week |
| <kbd>F</kbd> | Start a focus session (or show the running session) |
| <kbd>V</kbd> | Hold to talk, or tap to talk hands-free |
| <kbd>W</kbd> | Desktop widget |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>K</kbd> | Ask Daybloom |
| <kbd>⇧</kbd><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>P</kbd> | Privacy mode on or off |
| <kbd>,</kbd> | Settings |
| <kbd>Esc</kbd> | Close the panel, cancel listening, or clear the selection |

<br>

## Your data

- Daybloom keeps all data on your computer:
  - macOS: `~/Library/Application Support/app.daybloom.desktop/state/`
  - Windows: `%APPDATA%\app.daybloom.desktop\state\`
- Tokens, calendar sign-ins and calendar links stay in the system keychain (macOS Keychain or Windows Credential Manager).
- Work and Time Tracker data stay on your computer. GitHub sync does not include them yet.
- Voice stays on your computer. Whistle turns speech into text locally. Daybloom does not save recordings.
- Daybloom sends data only to services that you connect: Google Calendar, your ICS links and your GitHub repo.
- To make a backup, open **Settings › Your data** and click **Export**. To restore, click **Import**.

<br>

## For developers

<details>
<summary><b>Build from source</b></summary>

<br>

Requirements: Node.js 20.19 or later. For the desktop app, also [Rust](https://rustup.rs).

```bash
npm install
npm run dev          # the UI in a browser at http://localhost:1420 (no Rust needed)
npm run tauri dev    # the desktop app with the tray and the widget
npm run tauri build  # release bundles (.app/.dmg on macOS, .msi/.exe on Windows)
npm test             # unit tests
npm run check        # svelte-check and TypeScript
```

Development helpers: `?view=widget` shows the widget in a browser tab. `?at=10:40` shows the UI at a different time of day.

Build Windows bundles on Windows. The installer installs the WebView2 runtime if it is missing. Linux can work, but it is not tested.

</details>

<details>
<summary><b>Why Tauri, Svelte and TypeScript</b></summary>

<br>

- Tauri uses the system webview (WKWebView on macOS, WebView2 on Windows). The installers are small: about 3 MB on Windows and 9 MB on macOS (universal).
- Measured on an Apple-silicon Mac with the planner and the widget open and a block running: about 4% total CPU when idle, about 1% with **Calm** motion.
- All looping animations change only opacity and transform on HTML layers. The hands are placed from the wall clock at each tick, so they cannot drift.
- A hidden planner updates every 5 seconds instead of every second. The widget webview exists only while the widget shows.
- Svelte compiles away. The UI is about 600 KB of JavaScript (about 200 KB gzipped), plus the 0.9 MB Needle runtime. All sounds are made with WebAudio, so there are no audio files.
- The assistant runs [Needle](https://cactuscompute.com/needle) as WebAssembly in a worker, and voice runs [Whistle](https://cactuscompute.com/blog/whistle) in a second worker on the same engine. Live transcription never waits for Needle. Both models download on first use and are pinned to a revision and a SHA-256 hash.
- Screen cues are one transparent, click-through window. It exists only while a cue has something to show.

</details>

<details>
<summary><b>Releases and automatic updates</b></summary>

<br>

```bash
npm run release          # 0.1.3 → 0.1.4 (or: npm run release minor | major | 1.2.3)
```

The script changes the version in `package.json`, `package-lock.json` and `src-tauri/Cargo.toml`. Then it makes a commit, an annotated tag `vX.Y.Z`, and pushes both. The tag starts `.github/workflows/release.yml`, which:

1. builds the **macOS** (universal) and **Windows** (NSIS and MSI) installers, and signs each update file with the updater key;
2. publishes a release in this private repo (`alshell7/daybloom`);
3. copies the installers, their `.sig` files and `latest.json` to the public feed repo [`alshell7/daybloom-releases`](https://github.com/alshell7/daybloom-releases). The source code stays private.

Installed apps read `https://raw.githubusercontent.com/alshell7/daybloom-releases/main/latest.json`. They verify each download against the public key in `tauri.conf.json`.

| Secret (private repo) | What it is | Where the original is |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | minisign key that signs updates | `~/.tauri/daybloom.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password | `~/.tauri/daybloom.key.password` |
| `RELEASES_DEPLOY_KEY` | SSH deploy key with write access to the feed repo only | `~/.tauri/daybloom-releases-deploy` |
| `VITE_GOOGLE_CLIENT_ID` / `_SECRET` (optional) | Google OAuth desktop client for builds | — |

> [!CAUTION]
> Keep a backup of `~/.tauri/daybloom.key` and its password. Without them, installed copies cannot get updates. A new key needs a manual reinstall on each computer.

The installers are not Apple-notarised or Windows code-signed yet. Thus the first install shows a Gatekeeper or SmartScreen prompt. Updates after that install silently.

`.github/workflows/windows.yml` runs smoke tests on a Windows runner for each pull request: install, tray, widget transparency and layers, drag, notifications and CPU use.

</details>

<details>
<summary><b>Project layout</b></summary>

<br>

```
src/
  lib/engine/        time logic: dates, time zones, recurrence, blocks, lanes, now and next, gaps
  lib/dial/          the dial: geometry, Dial, arcs, readout, remaining-time ring, hover card
  lib/stores/        Svelte 5 rune stores, saved per window and synced across windows
  lib/calendar/      calendar providers (Google with multiple accounts, ICS) and the sync service
  lib/assistant/     Needle and Whistle engines (WebAssembly workers), tools, matcher and cards
  lib/voice/         microphone capture, resampler, voice activity, spoken-text rules, voice state
  lib/sync/          GitHub sync: Contents API client and three-way merge
  lib/addons/        addon registry; work/ (rates, earnings, bills) and tracker/ (entries, idle, timesheets)
  lib/platform.ts    the only connection to the native shell (commands and events)
  components/        top bar, timeline, panels, settings, focus mode, assistant cards
  views/             MainView (planner), WidgetView (desktop dial), OverlayView (screen cues)
src-tauri/           Rust shell: windows, tray, widget layers, screen-cue overlay, privacy mode, exports,
                     idle and app activity, keychain, OAuth loopback, model downloads
docs/                calendar notes and the media in this README
```

</details>

<details>
<summary><b>Roadmap</b></summary>

<br>

- Write blocks back to Google Calendar, and colours for each calendar on the dial.
- Native companions: macOS WidgetKit and the Windows 11 widget board.
- iOS and Android with Tauri mobile, with the same engine and dial.
- Energy levels for each block and a weekly review.

</details>

<br>

<div align="center">
<sub>Made with care for calm, clear days. Icons by <a href="https://lucide.dev">Lucide</a> (ISC). Needle and Whistle models by <a href="https://cactuscompute.com">Cactus Compute</a> (Apache-2.0).</sub>
</div>
