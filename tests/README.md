# Tests for Eight Count, Play Board and Locker

Browser tests (Playwright + Google Chrome) that drive the real pages at phone size. No data, no accounts: fixtures use placeholder names only.

```
NODE_PATH=/path/to/node_modules tests/run.sh           # everything (about 5 minutes)
NODE_PATH=/path/to/node_modules tests/run.sh locker    # one app
```

- `eightcount-core`: the pure timing math (beats, lock-in marks, share links).
- `eightcount`, `eightcount-more`: the screens, click timing (checked with an oscillator spy), lock-in across two pages with a shifted clock, recording with a fake camera, offline.
- `playboard`: every sport, drag by mouse and touch, paths, animation, share links, picture and print, offline.
- `locker`, `locker-back`: hand-checked stat math, streaks, pitch rest days, backup and restore, the card picture, the Back button.
- `live-smoke.cjs <app> <text>`: opens the published page and checks the service worker, manifest icons, offline reload and console errors.

Not covered by any test (needs real phones): two real phones' clocks lining up, real music and Bluetooth speaker delay, iPhone Safari recording, real touch hardware.
