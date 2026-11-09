# App Store screenshots

The public App Store (`store/`) shows each app with real screens, made with **made-up demo data**. One script per app
(`tools/shots/<id>.cjs`) opens the app, fills it with fake data, and saves 4 to 6 screens to `store/shots/<id>-<n>.webp`
plus a one-line caption each (`tools/shots/<id>.caps.json`). `getready.cjs` is the model to copy; `lib.cjs` is the helper.

```
NODE_PATH=/opt/node22/lib/node_modules node tools/shots/<id>.cjs
```

## What a good screenshot is
- It shows the app **doing its job**: a plan with blocks, a scoreboard mid-game, a roster, a standings table, a bracket, a
  full week with a clash flagged. Never a sign-in screen, a "choose a file" prompt, an empty state, a spinner or an error.
- 4 to 6 per app, in the order that tells the story (the best one first: it is the store thumbnail). Each one a different
  screen or feature. 390x844 phone at 2x (lib.cjs does this).
- Scroll or tap to the interesting part before shooting. No on-screen keyboard, no install bar, no toasts that cover content.
- Captions: plain words a parent or coach would use, under 70 characters, say what the screen is for ("Run the whole
  practice by the minute"), not what it is made of.

## Privacy (this repo is public)
Nothing real, ever. Fictional common first names only (Riley, Jordan, Casey, Morgan, Avery, Quinn, Sam, Taylor), never
the name of anyone real (family, players, coaches). Teams like Hawks, Comets, Lightning, Rockets. No real emails (use example.com), phone numbers,
addresses, school names, league names, or photos of people (draw simple shapes or emoji in a canvas instead). No real Firebase
traffic: block the network to Google and Firebase and give the app a fake sign-in and fake documents locally. Every
script must contain only fake data. Check every image before you finish: if a real name or number appears, fix it.

## Apps in other repos
Some apps live in their own repos (ASL-Bengals, lybs-dashboard, ...). Read them only: attach the repo with `add_repo`
(read access), clone it into your scratchpad folder, serve it with `serve(dir, mount)` from lib.cjs, and **never push or
change that repo**. Your script goes in this repo (`tools/shots/<id>.cjs`) and takes the checkout folder from an `APP_DIR`
environment variable. If the app talks to Firebase, stub the SDK script (route gstatic URLs to a small fake like the one in
`tests/read20.test.cjs`) or the REST calls, and feed it fake documents in the shape the code expects.
Read the code to learn the data model; do not guess it.

## Rules for workers
- Only add or change `tools/shots/<id>.cjs`, `tools/shots/<id>.caps.json` (made by finish()) and `store/shots/<id>-<n>.webp`
  for your own apps. Do not edit `registry.json`, `store/index.html`, `tools/sync.py`, other apps' source, or tests. Do not
  commit or push; the lead does that.
- Open and look at every image you save (Read tool on the .webp). Redo any that are empty, cropped badly, show an
  error, a keyboard, an install bar, or real-looking personal data.
- If you find a bug in an app while shooting (layout overflow, a screen that is broken with sample data), do not fix it
  here: describe it in your report.
