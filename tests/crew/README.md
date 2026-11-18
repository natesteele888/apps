# Nate crew: virtual testers

`testers.cjs` opens every game day app like a first-time user on two phones (a new 360 px Android and an old 320 px one),
taps every button once (never delete, reset, send, share, pay or sign-in buttons), and records crashes, console errors,
dead buttons, sideways scrolling, tap targets under 36 px, unnamed buttons, clipped text and tiny type.
`oldphone.cjs` reads the code and lists anything an iPhone 6/7 or an older Android Chrome can't run.

Safety: every request that isn't to the test's own local server is blocked, so the testers never reach Firebase,
ESPN or any live data. Each app gets fresh, empty browser storage. Nothing real is typed anywhere.

Runs in `.github/workflows/nate-crew.yml` every night and on demand. The findings feed the Nate crew review
(the persona charters live with the reports, outside this public repo).

    NODE_PATH=/path/to/node_modules node tests/crew/testers.cjs <folder holding apps/ (and asl-bengals/, lybs-ballclub/)> <out folder>
    ACORN=/path/to/node_modules/acorn node tests/crew/oldphone.cjs <apps repo> fairway walkup ...
