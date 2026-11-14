#!/bin/bash
# Runs the browser tests for Photo Blueprint, Get Ready, Eight Count, Play Board, Locker, Practice Clock, Who's Where, Tournament Pack, Walk-Up,
# Scoreboard, Film Lite and Where Do I Go? against the files in this repo.
# Needs: Google Chrome on the Mac, or Playwright's own Chromium anywhere else (see CHROME in lib.cjs), python3, and Node with the `playwright` package
# (point NODE_PATH at a node_modules that has it).
#   NODE_PATH=/path/to/node_modules tests/run.sh            # everything
#   NODE_PATH=/path/to/node_modules tests/run.sh locker     # only test files whose name contains "locker"
# The tests expect a layout of <work>/apps (the repo), <work>/tests, <work>/serve/apps and <work>/shots,
# so this script builds that in a temp folder, starts the two static servers they use, and cleans up.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"
mkdir "$W/tests" "$W/serve" "$W/shots"
ln -s "$REPO" "$W/apps"; ln -s "$REPO" "$W/serve/apps"
# Where Do I Go? loads LYBS Ballclub's trainer from /lybs-ballclub/, so serve that repo beside this one.
BALLCLUB="${BALLCLUB:-$REPO/../lybs-ballclub}"
[ -d "$BALLCLUB" ] && ln -s "$(cd "$BALLCLUB" && pwd)" "$W/serve/lybs-ballclub"
cp "$REPO"/tests/*.cjs "$W/tests/"
(cd "$W/serve" && exec python3 -m http.server 8791 --bind 127.0.0.1 >/dev/null 2>&1) & S1=$!
(cd "$W/serve" && exec python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1) & S2=$!
trap 'kill $S1 $S2 2>/dev/null; rm -rf "$W"' EXIT
sleep 1
FILTER="${1:-}"; FAIL=0
for t in health photoblueprint picks picks-stats getready eightcount-core eightcount eightcount-more playboard locker locker-back practiceclock read20 whoswhere tournamentpack walkup walkup-requests walkup-pitch scoreboard filmlite situations; do
  [ -n "$FILTER" ] && [[ "$t" != *"$FILTER"* ]] && continue
  echo "=== $t"
  (cd "$W/tests" && node "$t.test.cjs") 2>&1 | grep -E "^(PASS|FAIL|ALL|[0-9]+/[0-9]+|[0-9]+ passed|all passed|  FAIL|HARNESS|      )|failed" | tail -60
  [ "${PIPESTATUS[0]}" -ne 0 ] && FAIL=1
done
[ "$FAIL" -eq 0 ] && echo "ALL TEST FILES PASSED" || echo "SOME TEST FILES FAILED"
exit $FAIL
