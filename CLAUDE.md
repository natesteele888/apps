# Privacy rules for this repo (public on GitHub Pages)

Everything in this repo is public. Nathan's rule: no data, personal info or sensitive info is ever committed here.

- Commit code, icons and generic copy only. App data (projects, tasks, notes, rosters, measurements, resume) lives in Firebase behind Google sign-in, never in files here.
- Never commit: names of real people (especially kids), emails, phone numbers, addresses, schedules, photos of people, exports/backups/JSON dumps, .env files, API secrets or tokens.
- Firebase *web* config (apiKey, projectId, appId) is a public identifier and may be committed; the Firestore rules are what protect the data. Never commit service-account keys.
- Before every push, scan the staged changes:
  git diff --cached | grep -inE '@gmail|@yahoo|@icloud|[0-9]{3}[.) -][0-9]{3}[.-][0-9]{4}|desmond|password|secret|private_key|BEGIN .*KEY'
  and stop if anything personal shows up.
- If personal data does get pushed, rewrite history to remove it (a force-push of a cleaned branch) and tell Nathan.

## Tests
Eight Count, Play Board, Locker, Practice Clock, Read 20, Who's Where, Tournament Pack, Walk-Up, Scoreboard and Film Lite have browser tests in `tests/` (see `tests/README.md`). Each app registers its own service worker in its own code (install.js does not), and the live-smoke check catches an app that forgot. Run
`NODE_PATH=<node_modules with playwright> tests/run.sh` (or `tests/run.sh locker`) before changing them.

## Nate AI Brain (shared memory)
This app is one of several that share parts and lessons through the private
`natesteele888/nate-brain` repo.
- **Start here, every session:** get the latest brain
  (`git -C /Volumes/AutoNuvo_1/nate-brain pull --ff-only`; a cloud session's attached
  copy is already current), then read `state/FRESHNESS.md`: what every app's code
  says right now, what's in flight, and where the brain's notes are behind. **If a
  note disagrees with it, the code wins.** Pull this repo too before you edit; never
  work in a copy that's behind.
- **Live and relied on:** only the Bengals coaching app (ASL-Bengals dev2). Test
  before you push there. Everything else is safe to improve and push freely.
- **Apps & links:** `apps.md` lists every app's live link, repo and Toolbox id,
  explains Nate's Toolbox app (his hub, natesteele888.github.io/apps/toolbox/) and
  how to send it updates. Never guess an app URL; if one changes, update
  `registry.json` in this repo.
- **Read first:** before building, check `lessons.md`, and check `parts.md` for
  anything that already exists (sign-in, rules, calendar export, offline install,
  rosters…). Reuse the keeper version and follow its `playbooks/<id>.md`.
- **Write back:** when you hit a bug, gotcha or better way another project would
  want, add a dated entry to `nate-brain/lessons.md`. If you change a shared part
  here, update its entry in `parts.md`.
- Know-how only in nate-brain: never copy names, contact info, stats or secrets into it.
