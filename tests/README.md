# Tests for the family sports apps

Browser tests (Playwright + Google Chrome) that drive the real pages at phone size. No data, no accounts: fixtures use placeholder names only.

```
NODE_PATH=/path/to/node_modules tests/run.sh           # everything (about 20 minutes)
NODE_PATH=/path/to/node_modules tests/run.sh locker    # one app
```

- `eightcount-core`: the pure timing math (beats, lock-in marks, share links).
- `eightcount`, `eightcount-more`: the screens, click timing (checked with an oscillator spy), lock-in across two pages with a shifted clock, recording with a fake camera, offline.
- `playboard`: every sport, drag by mouse and touch, paths, animation, share links, picture and print, offline.
- `locker`, `locker-back`: hand-checked stat math, streaks, pitch rest days, backup and restore, the card picture, the Back button.
- `practiceclock`: block and station schedule math across pauses, sleep and skips, the runner on a fake clock, share links, print, backup.
- `whoswhere`: the clash engine (kids, drivers, drive time, midnight, the November clock change), repeats, .ics parsed back, week text.
- `tournamentpack`: 18 hand-worked standings cases with every tiebreaker, brackets of 4, 6 and 8, .ics, the packing list.
- `walkup`: the mix plan and ducking math, the voice polish chain rendered offline and measured, fake-microphone recording, the song library, backup with audio.
- `scoreboard`: the game engine (baseball count and innings, basketball fouls and bonus, football downs, clock math, undo all the way back) and the board screens.
- `filmlite`: frame stepping, loops, tags, drawing and angle math, a video recorded in the page, notes that come back for the same file.
- `live-smoke.cjs <app> <text>`: opens the published page and checks the service worker, manifest icons, offline reload and console errors.

Not covered by any test (needs real phones): real microphones and Bluetooth speakers, the iPhone silent switch, real wake locks and vibration, two real phones' clocks lining up, real music and Bluetooth speaker delay, iPhone Safari recording, real touch hardware.
