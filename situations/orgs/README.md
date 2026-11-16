# Where Do I Go? for any league ("baseball org in a box")

Another league sets its own name, colors, logo and teams with settings. Nobody edits the code.
LYBS is the built-in default: with no league chosen the app looks and plays exactly as it always has.

## Three ways to set up a league

1. **Setup screen, then a share link (no files at all).** Open
   `https://natesteele888.github.io/apps/situations/?setup`, fill in the league, and tap
   **Copy share link**. Anyone who opens that link gets the league's setup, and their phone
   remembers it. **Use on this phone** saves it on just that phone.
2. **A settings file in this folder.** Save `orgs/<slug>.json` (the setup screen's
   **Download settings file** writes one), then open `…/situations/?org=<slug>`.
   `<slug>` is lowercase letters, numbers and dashes. See `sample.json`.
3. **Team links.** Add `&team=<team>` to send each team its own link, for example
   `?org=sample&team=owls`. The team is the team's name in lowercase with dashes.

`?org=lybs` (or `?org=default`) puts a phone back on LYBS.

## Settings file fields

The names match League Ops in a Box's `Organization` type, so the two can share one league record later.

| Field | What it does |
| --- | --- |
| `name` | League name, shown at the top and in the page title. |
| `abbreviation` | Short name, up to 8 letters, e.g. `SVYB`. Used in the title and footer. |
| `branding.logoUrl` | An `https://` link to a PNG or SVG, or a file in this folder such as `sample/logo.svg`. |
| `branding.primaryColor` | Main color (`#rrggbb`) for buttons and highlights. Text on it turns black or white to stay readable. |
| `branding.secondaryColor` | Background color. Light backgrounds switch the page to dark text. |
| `teams` | List of `{ "name": "Owls", "color": "#f2b705" }`. Players pick their team at the top; a team's color replaces the main color. Up to 60. |
| `footer` | Line at the bottom. Leave it out for "SVYB · Where Do I Go?", or `""` for none. |
| `title` | Optional page title in place of "Where Do I Go? — SVYB". |
| `plays.situations`, `plays.responsibilities` | Optional links to the league's own play files, with the same columns as LYBS Ballclub's `data/situations.csv` and `data/responsibilities.csv`. A Google Sheet published as CSV works. Both or neither. |

The field's role colors (who fields, covers, cuts, backs up) never change, because players learn by them.

## Privacy

This folder is public on GitHub Pages. League names, colors, logos and team names only. Never players'
names, coaches' contact details or schedules. `sample.json` is a made-up league.

## Not in settings yet

The installed app's home-screen icon and name stay "Where Do I Go?" for every league, because the install
file is shared. A league's logo shows inside the app.
