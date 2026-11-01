# Privacy rules for this repo (public on GitHub Pages)

Everything in this repo is public. Nathan's rule: no data, personal info or sensitive info is ever committed here.

- Commit code, icons and generic copy only. App data (projects, tasks, notes, rosters, measurements, resume) lives in Firebase behind Google sign-in, never in files here.
- Never commit: names of real people (especially kids), emails, phone numbers, addresses, schedules, photos of people, exports/backups/JSON dumps, .env files, API secrets or tokens.
- Firebase *web* config (apiKey, projectId, appId) is a public identifier and may be committed; the Firestore rules are what protect the data. Never commit service-account keys.
- Before every push, scan the staged changes:
  git diff --cached | grep -inE '@gmail|@yahoo|@icloud|[0-9]{3}[.) -][0-9]{3}[.-][0-9]{4}|desmond|password|secret|private_key|BEGIN .*KEY'
  and stop if anything personal shows up.
- If personal data does get pushed, rewrite history to remove it (a force-push of a cleaned branch) and tell Nathan.
