# Tests for the family sports apps

Browser tests (Playwright + Google Chrome) that drive the real pages at phone size. No data, no accounts: fixtures use placeholder names only.

```
NODE_PATH=/path/to/node_modules tests/run.sh           # everything (about 20 minutes)
NODE_PATH=/path/to/node_modules tests/run.sh locker    # one app
```

- `health`: the shared health check and problem report (`health.js`) that every app loads: a healthy phone, crash and failed-promise logging that survives a reload with repeats folded, the no-save bar, the Something wrong? sheet sending through the share sheet or copying, installed detection, and a check that every app loads the script and has the button.
- `picks`: Gameday Picks' core (slate keys for the NFL week and the MLB/NBA/NHL day, local dates, reading ESPN's scoreboard, records and team stats per league or all), then the page with Firebase and ESPN stubbed: the four league tabs, this week versus today, picks saved under a league-dated slate, locking at game time, the per-league and all-leagues boards, a 320 px phone.
- `photoblueprint`: the sheet math (angle of view, shutter and aperture formats, APEX, compass, the field-of-view wedge, share links), the EXIF reader on JPEGs built in the test (both byte orders, GPS, damaged files), then the app: every screen at phone size, a photo whose camera notes fill the sheet and drop the pin, stance and direction, the blueprint sheet, share links, edit, delete, backup, themes and units, small phones, the Back button, offline with the real service worker.
- `eightcount-core`: the pure timing math (beats, lock-in marks, share links).
- `eightcount`, `eightcount-more`: the screens, click timing (checked with an oscillator spy), lock-in across two pages with a shifted clock, recording with a fake camera, offline.
- `playboard`: every sport, drag by mouse and touch, paths, animation, share links, picture and print, offline.
- `locker`, `locker-back`: hand-checked stat math, streaks, pitch rest days, backup and restore, the card picture, the Back button.
- `practiceclock`: block and station schedule math across pauses, sleep and skips, the runner on a fake clock, share links, print, backup.
- `read20`: the story library (levels, page lengths), day, streak and month math, damaged saves, tap-to-highlight, the nightly timer on a fake clock across two stories, idle pause, the log, offline.
- `getready`: checklist and day-complete logic, streaks that skip days off, reminder windows, the calendar file, dance poses, then the app: ticking items, the full-screen dance, add/rename/reorder/remove, timers on a fake clock, photos, reminders, the log, your own GIFs, small-phone layout, offline, and the Google backup against a stubbed Firebase (merge rules, two phones, photos up and down, sign out, blocked account).
- `whoswhere`: the clash engine (kids, drivers, drive time, midnight, the November clock change), repeats, .ics parsed back, week text.
- `tournamentpack`: 18 hand-worked standings cases with every tiebreaker, brackets of 4, 6 and 8, .ics, the packing list.
- `walkup`: the mix plan and ducking math, the voice polish chain rendered offline and measured, fake-microphone recording, the song library, backup with audio.
- `walkup-requests`: asking a parent for a song (request links, the parent page with a stubbed share sheet, file names that carry a code, matching a received file to its player, the Android share target through the real service worker, audio formats: real WAV, MP3 and webm decodes plus a name-and-type table for the rest).
- `scoreboard`: the game engine (baseball count and innings, basketball fouls and bonus, football downs, clock math, undo all the way back) and the board screens.
- `filmlite`: frame stepping, loops, tags, drawing and angle math, a video recorded in the page, notes that come back for the same file.
- `situations`: Where Do I Go? runs LYBS Ballclub's own trainer, so this serves `lybs-ballclub` beside this repo (next to it, or `BALLCLUB=/path`) and checks the field draws, a ball plays, Fundamentals opens in the store page's info sheet, and it opens offline after one visit.
- `secretary`: Meeting Secretary with six demo members, one absent. Checks the Unanimous button counts only who is present (5–0–0, not 6–0–0), a Nay gives 4–1–0 and is never called unanimous, an Abstain gives 4–0–1, the minutes' attendance and quorum lines, and the closing line has no stray comma when no secretary is picked.
- `live-smoke.cjs <app> <text>`: opens the published page and checks the service worker, manifest icons, offline reload and console errors.

Not covered by any test (needs real phones): real microphones and Bluetooth speakers, the iPhone silent switch, real wake locks and vibration, two real phones' clocks lining up, real music and Bluetooth speaker delay, iPhone Safari recording, real touch hardware.
