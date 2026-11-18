# Nate crew: virtual testers

`testers.cjs` opens every game day app like a first-time user on two phones (a new 360 px Android and an old 320 px one),
taps every button once (never delete, reset, send, share, pay or sign-in buttons), and records crashes, console errors,
dead buttons, sideways scrolling, tap targets under 36 px, unnamed buttons, clipped text and tiny type.
`oldphone.cjs` reads the code and lists anything an iPhone 6/7 or an older Android Chrome can't run.

Safety: every request that isn't to the test's own local server is blocked, so the testers never reach Firebase,
ESPN or any live data. Each app gets fresh, empty browser storage. Nothing real is typed anywhere.

Runs in `.github/workflows/nate-crew.yml` on demand only (the nightly Claude run starts it; nothing is scheduled). The findings feed the Nate crew review
(the persona charters live with the reports, outside this public repo).

    NODE_PATH=/path/to/node_modules node tests/crew/testers.cjs <folder holding apps/ (and asl-bengals/, lybs-ballclub/)> <out folder>
    ACORN=/path/to/node_modules/acorn node tests/crew/oldphone.cjs <apps repo> fairway walkup ...

## The virtual test team (no browser needed)

`personas.json` holds 100 made-up people (built by `personas-build.cjs`; edit that and rerun it): first-time T-ball
parents, seasoned coaches, kids, grandparents on old phones, board members, golfers and more. Each has a skill level,
a style (taps everything, double-taps, fat-fingers, one hand at the field, no signal, one bar, big text, read-aloud,
reloads halfway, comes back the next day, fills in every box) and the apps they'd really open.

`personas.cjs` walks each persona through their apps inside `sandbox.cjs`, a fake browser (jsdom) with no network:
only this machine's own test server answers, Firebase is an in-memory stand-in whose writes are counted and never
sent, storage starts empty, and every typed value is made up. Each journey records what broke and what the persona
thought: what made sense, what was confusing, what should change and what was good. The report groups that by app.
No layout engine here, so sizes and positions aren't measured: that stays with `testers.cjs` in a real browser.

    npm i --prefix /tmp/crew jsdom@25 fake-indexeddb@6
    NODE_PATH=/tmp/crew/node_modules node tests/crew/personas.cjs <folder holding the repos side by side> <out folder>
    # optional: CREW_APPS=regex  CREW_PERSONAS=regex  CREW_WORKERS=4  OLDPHONE=<oldphone.cjs output json>

`pages.cjs` is the shared list of app pages (game day apps first, then every app found in the checked-out repos).
