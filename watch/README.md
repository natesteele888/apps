# Dugout: Walk-Up on your phone and your Galaxy Watch

Dugout is two small Android apps that work together:

- **Dugout for the phone.** This app is the Walk-Up web app full screen, with a thin bar on top showing the speaker, plus **Pocket** and **Watch** buttons. The music still plays on the phone, through your Bluetooth adapter on the Bose L1.
- **Four watch apps** (Wear OS, built for the Galaxy Watch 7 or 8, and installable on watches back to Android Wear 2.0), from one install:
  - **Walk-Up**, a remote for the walk-up songs on the phone.
  - **Pitch Count**, a pitch counter.
  - **Scores**, today's MAC League scores from around the league, the same ones LYBS Select shows.
  - **GC Scores**, your own team's GameChanger scoreboard: the live score, the next game and recent finals.

  Each works without the others. Use Walk-Up on a day with no pitch count, or Pitch Count with no music.

You set up the lineup, songs and pitchers on the phone. The watch is for game time.

**For any LYBS coach.** Nothing is built in for one team. Each coach adds their own players, songs and pitchers in Dugout on their own phone, and that data stays on that phone and its watch. None of it goes to GitHub or any server, so no sign-in is needed.

## How they connect

```
     Bose L1 speaker (press box)
            ▲
            │  Bluetooth adapter, 75 to 100 feet
            │
   ┌────────┴─────────┐   Wear OS link (Bluetooth,    ┌──────────────────┐
   │      PHONE       │   phone to watch only)        │      WATCH       │
   │  Dugout app      │ ◄───────────────────────────► │  two apps        │
   │  ┌────────────┐  │   phone → watch:              │  Walk-Up:        │
   │  │ Walk-Up    │  │     who's up, the order,      │   swipe batters, │
   │  │ (plays the │  │     what's playing, speaker   │   hold to play,  │
   │  │  music)    │  │   watch → phone:              │   big STOP       │
   │  └────────────┘  │     pick batter, play, stop   │  Pitch Count:    │
   │  Pitch counter   │   both ways:                  │   tap +1, undo,  │
   │  (optional, top  │     the pitch log (each       │   bullpen        │
   │   of Game)       │     pitch counted once)       │                  │
   └────────┬─────────┘                               └──────────────────┘
            │
            │  reads, on the phone only
            ▼
   LYBS Ballclub's saved copy of your team
   (pitchers and pitch counts logged in Ballclub)
```

Nothing goes through the internet or a server. Player names and photos stay on the phone and the watch.

## What the watch does

**Walk-Up** (the blue music-note icon)
- One screen per batter shows the jersey number big, the name, and the batter's photo behind them if you set one.
- Swipe left or right, or turn the bezel, to move between batters. Swiping never starts or stops music. The order goes round: after the last batter comes the leadoff batter again.
- Swipe up for the batting order. Tap a name to jump there. Press and hold a name to swap in a bench player: pick who comes in, and they take that batting spot while the other player goes to the bench. Swaps wait while a song plays.
- **Lineup card:** at the top of the batting order. It shows who plays where: the nine positions with the player at each, then who sits. Turn the bezel, or tap **−** and **+**, to change the inning. It opens on the last inning you looked at while Walk-Up is open (inning 1 the first time). A position with two players shows red, one with nobody shows yellow, and a line at the top sums it up. The innings come from Walk-Up's **Team › Positions by inning** on the phone; with none set, the card shows each batter's one position and says where to set them.
- To play, press and hold anywhere on the face. A green ring fills around the edge in about one second. Letting go early, or starting a swipe, does nothing.
- When the ring closes, a short countdown shows (**STARTING IN 2**, set in the phone's **Watch › Song countdown**, 0 to 5 seconds) with a light buzz. A tap anywhere cancels it before any sound plays.
- While a song plays, the whole screen pulses blue with **PLAYING**, a ring showing the song's progress, and a big red **STOP**. One tap stops it right away. You can't swipe to another batter while a song plays.
- **Keep playing:** while a song plays, press and hold (anywhere, Stop too). The watch buzzes, the ring turns gold, and the song runs on past its clip for that song's extra seconds (30 unless changed, set per song in Walk-Up's Trim sheet), then fades out over 2 seconds. Stop still ends it at once.
- **Game sounds:** swipe down on the batter. Tap a sound (the anthem, music between innings, your own clips) to play it after the same countdown. Press and hold one to put it in **Up next**, which plays by itself when the sound before it ends; tap one in Up next to take it out. While a game sound plays, **Next: …** under Stop skips to what's up next. Stop ends everything, Up next too.
- Every screen past the batter goes back the same three ways: swipe right, the watch's back button, or the **Back** chip at the bottom of the list.
- The top line shows the speaker: green when the phone is on a Bluetooth speaker, yellow for "No speaker", and red for "Open Dugout on your phone" when the watch can't reach the phone.

**Pitch Count** (the green baseball icon)
- Tap the middle of the screen to add a pitch. **Undo** takes back the last one.
- The screen is green while the pitcher is well under the limit. It turns yellow at 10 pitches left and red at 5 left. At the limit it flashes.
- The watch buzzes once on reaching 10 left, buzzes twice on every pitch from 5 left, and buzzes three times at the limit.
- Swipe up or down, or turn the bezel, for the **Bullpen**. It shows every pitcher's pitches today, how many they have left, and who is resting and until when. Tap a pitcher to put them on the mound.
- The limit is the smallest of three numbers: the MAC League daily max for your division (Majors 85, Minors 75, Juniors 95, Seniors 105), your team max, and that pitcher's own limit. These are the same rules as LYBS Ballclub.
- Pitches count on the watch even if the phone is out of reach. They sync when the two are together again, and each pitch counts once.

**Scores** (the brown scoreboard icon)
- Every MAC League game today, one card per game: both teams and their runs. Majors comes first, then Minors, then Rookies, and Lunenburg's games sit on top of each division in blue.
- Swipe up or down, or turn the bezel, to scroll through the games. A finished game shows the winner in bold and the loser dimmed. A game that hasn't started shows a dash and its start time.
- The top line says when the league's scores were last copied ("Updated 6:32 PM"). The watch looks for new ones every minute while Scores is open. The scores themselves come from LYBS Select's copy of macleague.org, which refreshes about every 30 minutes from 8am to 9pm ET.
- On a day with no league games it shows each division's standings instead.
- It needs the internet: on most watches that comes through the phone, so keep Bluetooth on. The last scores it saw stay on the watch for when there's no signal.
- No sign-in. It reads only public league results (teams, scores, records), nothing about any player.

**GC Scores** (the red scoreboard icon)
- Your team's GameChanger scoreboard on your wrist, the same games and scores as the GameChanger scoreboard widget in Ballclub.
- During a game: a big **LIVE** score, the opponent and the inning. It reads GameChanger again every 30 seconds while the screen is open. Tap it for the line score (runs by inning, then R H E).
- Between games: **Next** game and time, then **Recent** finals (green win, red loss) and **Coming up**. Tap a final for its line score.
- Pick the team once on the phone: **Watch › GameChanger team**, paste the team's web.gc.com/teams/… link, tap **Send to watch**.
- It reads GameChanger's public team page data, so no sign-in. It needs the phone nearby (or the watch's own Wi-Fi). With no signal it shows the last scores it read and when.
- Only teams scored in GameChanger show up, and the score is only as live as the scorekeeper.

**Tiles** (swipe left from the watch face)
- **Pitch Count tile:** who's pitching, the count and how many are left, in the same green, yellow and red as the app, with the ring filling toward the limit. **+1** and **Undo** work right on the tile, with the same buzzes, so you can count without opening anything. Tap the count to open Pitch Count.
- **Scores tile:** today's MAC League games, Lunenburg's first, two at a time, and how many more there are. Tap it to open Scores. It reads new scores when you swipe to it and the last ones are over 5 minutes old.
- Add them once: press and hold a tile, swipe to the end, tap **+**, and pick **Pitch Count** or **Scores** under Dugout. On a Galaxy Watch you can also do it in the Galaxy Wearable app on the phone (**Tiles**).
- **On the watch face:** Pitch Count can also fill a slot on any watch face that has them (complications). Press and hold the face, tap **Customize** (or the pencil), pick a slot and choose **Pitch Count**. A small slot shows the count and how many are left, a ring slot fills toward the limit, and a wide slot also names the pitcher. Tap it to open Pitch Count.
- The watch takes the phone's pitch count even with Pitch Count closed, so the tile matches the phone when someone counts on the phone.
- Tiles need Wear OS 2 (Android 8) or newer. On a watch still on Android Wear 2.0 the tiles don't show, and the apps work the same.

**Live score on the watch face.** To see GC Scores without opening it, long-press the watch face › **Customize** › tap a complication slot › **Dugout** › **Live score**. During a game it shows the score and inning ("INN 5" over "4-3"), between games the next game's day and time ("SAT" over "6:30"), and for 6 hours after a game the final ("W 7-3"). A wide slot shows the whole line, like "LIVE vs Hawks 4-3". Tap it to open GC Scores. It follows the team set on the phone, updates every minute during a game (and in the 30 minutes before one), and every 5 to 15 minutes otherwise, so it's easy on the battery. It needs Android 8 or newer on the watch (Wear OS 3, 4 and 5, and most Wear OS 2 watches); an Android Wear 2.0 watch on Android 7 doesn't list it.

## What the phone does

- The **Game** screen is the walk-up player. Under it is **Game sounds**: buttons for the anthem, music between innings and your own clips. Tap one to play it, tap **Next** to put it in Up next. **Edit** adds, names, orders and deletes them, and picks each one's song from your song library with where it starts and ends (it skips the quiet at either end by itself). The anthem button can fetch the U.S. Navy Band's public-domain recording with one tap, or use your own file.
- The phone keeps playing a game sound when you move to the next batter, and stops a walk-up as before.
- The pitch counter is off at first. To add it, tap **Count pitches too** on the Game screen, or turn on **Settings › Game mode › Pitch counter on the Game screen**. It then sits at the top of Game (+1, Undo, and the Bullpen), with the walk-up player below. Coaches without a watch use it the same way. Turn it off the same way in Settings, or in Bullpen › Pitching settings.
- Pitch Count on the watch works whether or not the phone shows the pitch counter. Its pitches still sync to the phone.
- **Watch** in the top bar opens a screen where you set a photo for each batter and open LYBS Ballclub inside Dugout.
- **Pocket** turns the screen black and ignores touches, so the phone can't play or stop anything in your pocket. Music and the watch keep working. Hold the screen for 1.5 seconds to unlock it.
- The Bullpen has an **Official counts** button. In Dugout it opens the MAC League website on its own screen, and remembers the last league page you were on, so next time it opens straight to your team. Dugout only shows the league's page; it doesn't read or copy it. In Chrome the button opens the site in a new tab.
- **Team › Positions by inning** is the lineup card: one row per player (the batting order, then the bench) and one box per inning. Tap a box to pick P, C, 1B, 2B, 3B, SS, LF, CF, RF or Sit. **Innings in the game** sets 1 to 9 (6 to start), **Copy inning 1 to all** fills the rest of the game from the first inning, and a chip for each inning warns when a position has two players or nobody. It's saved with the team (and in backups) and shows on the watch's Lineup card.
- Pitching settings has a **Copy for Ballclub** button. It copies today's totals so you can paste them into the game in Ballclub.
- **Field mode** (Watch › Field tablet) turns a tablet into the field's walk-up player for every Lunenburg team: Walk-Up's Field mode page full screen, screen kept on, the app pinned. **Add Field mode to the home screen** puts an icon on the tablet that opens straight to it. A board member lets the tablet in once from LYBS Select (Data Admin › Field tablets). Leave pinning with Back and Overview held together.

## Try it now, without a watch (Android Studio emulators)

1. Install Android Studio on a computer.
2. Download the two apps. Open the repo on GitHub, then **Actions › Dugout watch and phone apps**, open the newest green run, and download **dugout-apks**. Unzip it to get `dugout-phone.apk` and `dugout-watch.apk`. Use both files from the same run.
3. In Android Studio, open **Device Manager** and create two virtual devices:
   - a phone, for example a Pixel 8 with a Google Play system image,
   - a watch, under **Wear OS**, for example Wear OS Large Round (API 33 or newer).
4. Start both devices. Drag `dugout-phone.apk` onto the phone window, and `dugout-watch.apk` onto the watch window. Each one installs.
5. Pair them in Device Manager: open the phone's **⋮** menu, choose **Pair Wearable**, pick the watch, and follow the steps. It opens the Wear OS app on the phone to finish pairing.
6. On the phone, open **Dugout**. Walk-Up loads. Tap **Add a sample lineup**.
7. On the watch, open **Walk-Up**. The top line turns from red to "No speaker" (the emulator has no Bluetooth speaker), and the batters show up.
8. Try it out:
   - Swipe between batters and check that the phone follows.
   - Hold the face until the green ring closes. The song plays on the phone, and the watch turns blue with **STOP**.
   - Tap **STOP**.
   - On the phone, tap **Count pitches too**. On the watch, open **Pitch Count** and tap a few times. The phone's pitch counter shows the same count.
   - Tap **+1 Pitch** on the phone. The watch shows it too.

If you'd rather not use Android Studio's window, the same install works from a terminal with `adb install dugout-phone.apk` (run it once for each device).

## When the watch arrives (sideload)

1. On the phone, install `dugout-phone.apk`. Open the file from your phone's Downloads, and allow "install unknown apps" for your browser or Files app when it asks.
2. On the Galaxy Watch, open **Settings › About watch › Software information** and tap **Software version** 5 times. That turns on **Developer options**.
3. In **Settings › Developer options**, turn on **ADB debugging** and **Wireless debugging**. Put the watch and a computer on the same Wi-Fi. Wireless debugging shows the watch's address, and **Pair new device** shows a code.
4. On the computer (Android's platform tools), run `adb pair <address shown under Pair new device>` and type the code. Then run `adb connect <the watch's address>`.
5. Run `adb install dugout-watch.apk`. **Walk-Up**, **Pitch Count** and **Scores** appear in the watch's app list.
6. Turn **ADB debugging** off again when you're done.

### An older watch (Android Wear 2.0 or Wear OS 2, like the Huawei Watch 2)

These watches have no **Wireless debugging** pairing screen, so the watch install goes like this instead. Step 1 on the phone is the same, and the watch pairs with the phone through Google's **Wear OS** app (not Galaxy Wearable).

1. Download `dugout-watch.apk` to the computer from the newest `dugout-v…` release (**Releases** on this repo's GitHub page), the same release as the phone's `dugout-phone.apk`.
2. On the watch, open **Settings › System › About** and tap **Build number** 7 times. That turns on **Developer options**.
3. Connect the watch to the same Wi-Fi as the computer (**Settings › Connectivity › Wi-Fi**).
4. In **Settings › Developer options**, turn on **ADB debugging**, then **Debug over Wi-Fi**. After a few seconds it shows the watch's address, like `192.168.1.40:5555`.
5. On the computer (Android's platform tools; on a Mac, `brew install android-platform-tools`), run `adb connect <that address>`. The watch asks **Allow debugging?**: tap **OK**.
6. Run `adb install dugout-watch.apk`. **Walk-Up**, **Pitch Count** and **Scores** appear in the watch's app list.
7. Turn **Debug over Wi-Fi** and **ADB debugging** off again when you're done.

Both apps must be signed with the same key, because the watch only talks to a phone app signed the same way. Builds from the `dugout-v…` releases all share one key, so any phone and watch build from there match.

## The Steele Family watch app (for a kid's watch)

`steele-family-watch.apk` (from the same release) is a second, separate watch app with several apps in the watch's list. Each one follows its web app on the phone:

- **Get Ready**: today's checklist. Tap an item to tick it; an item with a timer starts it first, buzzes at the end and ticks itself. Finishing the list throws a small party on the watch and the full one on the phone.
- **Cube Clock**: tap, 3-2-1, solve, tap to stop. +2 or DNF right after. Every solve lands in Cube Clock's history on the phone, and the watch shows the PB and average of 5.
- **Power Program**: the next day's workout, one exercise per screen, with timers for timed moves (both sides for "/side" ones). Finished exercises and the finished day are checked off in Power Program on the phone.
- **Gameday Picks**: this week's NFL games. Tap the left half for the away team, the right half for home. Tap the same side again to take the pick back. Locked games show the score, and the standings are at the bottom.
- **Read 20**: a reading timer that fills a ring to the goal and buzzes when it's reached. Finish saves the minutes to that reader's log on the phone.
- **Practice Clock**: the block or station that's on in the practice running on the coach's phone, with its countdown, a ring and what's next. It buzzes at every block and station change (a longer buzz at the end of practice), even with the watch screen off, and says when the phone is paused or waiting for the coach. The controls stay on the phone.
- **Schedule**: games and practices for the next two weeks, next one up top, with the live score during a game when the team has a GameChanger link. LYBS Ballclub › Calendar › On a watch sends them, for the teams ticked there, each time the app opens.

**Install:** the same steps as above, with `adb install steele-family-watch.apk`. It runs on Wear OS 2 through Wear OS 5, round or square, and needs no phone app: it talks to the web apps over the internet (through the phone's connection when the watch has no Wi-Fi).

**Link it once:** open any of the apps in the watch's list. It shows an 8-letter code. On the phone open Get Ready › More › Watch (or Cube Clock › Statistics › Your watch, Read 20 › Settings › Watch, Power Program › Program › Watch, Practice Clock › Settings › Watch, LYBS Ballclub › Calendar › On a watch, or Gameday Picks › watch under your name) and type the code. One link covers them all, because the web apps share it.

**Where the data goes:** one private document in the nates-toolbox Firestore, named by a 26-character random key that only that phone and that watch know (see `../watchlink.js`). Nothing is in GitHub. Gameday Picks is the one exception: picks are saved in Gameday Picks itself, so the watch signs in on its own and the player's phone okays that watch (the `gp_watch` rules in `toolbox/firestore.rules`).

**Switching it on (once):** publish `toolbox/firestore.rules` in the Firebase console, and for Gameday Picks turn on **Anonymous** sign-in (Authentication › Sign-in method) in the nates-toolbox project.

## Updates

- **Phone:** Dugout checks for a new version when it opens (at most every half hour) and asks **Update Dugout?** Tap **Update**, then **Update** on Android's own screen. The first time, Android asks you to allow Dugout to install apps. **Watch › Check for updates** looks right away.
- **Watch:** the watch app doesn't update itself. When a release changes the watch app, install its `dugout-watch.apk` with step 5 above (step 6 on an older watch).
- Only main-branch builds that change the apps are published, as `dugout-v<number>` releases in this repo. A Walk-Up-only change needs no app update, because Dugout loads the live site.
- **Switching over once:** a Dugout installed from an older build (signed with a throwaway debug key) can't update itself. Uninstall it, then install `dugout-phone.apk` from the newest `dugout-v…` release. Do the same for the watch.

## Things to know

- **Android and Wear OS only.** There's no Apple Watch app. One watch app covers Wear OS 2 (like the Huawei Watch 2) through Wear OS 5 (Pixel Watch, Galaxy Watch 4 and newer); anything that needs a newer watch is switched on only on watches that have it. iPhone users can use Walk-Up on the web, everything but the watch.
- **Your team data.** Dugout has its own storage, separate from Chrome. To move your team in, open Walk-Up in Chrome and tap Settings › Back up everything with audio. Then in Dugout, tap Settings › Restore from a backup file and pick that file.
- **Ballclub pitchers and pitch counts.** In Dugout, tap **Watch › Open LYBS Ballclub here**, sign in and open your team once, then go back to Walk-Up. Pitching settings then offers **Add pitchers from Ballclub**, and pitchers resting from earlier games show "Resting" in the Bullpen.
- **Screen off.** Keep Dugout open and use **Pocket** during games. Dugout also keeps a "Dugout is ready" notification so Android doesn't close it. Music with the phone's screen fully off depends on the phone, so test it once before a game.
- **Battery.** The watch keeps its screen on while Dugout is open. Close the app between innings if battery runs low.

## For developers

- **Lineup card data:** once a grid is set, `walkup/bridge.js` adds `inn` to each lineup and bench row (one entry per inning: `"P"`, `"SS"`, `"Bench"` or `""`) and `innings` to the state; an optional `inning` (the inning being played) is read too, for a later phone that knows it. `shared/.../Lineup.kt` reads them (who plays where in inning k, duplicates, missing positions) with tests in `LineupTest.kt`; older phones send neither and older watches ignore both.
- `shared/` holds the message format (`Protocol.kt`) and the pitch math (`PitchCore.kt`). The pitch math is a Kotlin copy of `walkup/pitch-core.js`, and its unit tests match `tests/walkup-pitch.test.cjs`.
- `phone/` is the Dugout phone app. It's a WebView of the live Walk-Up site (`https://natesteele888.github.io/apps/walkup/`) with a JavaScript bridge (`walkup/bridge.js` on the page side, `Bridge.kt` here). The bridge adds Android text-to-speech, file picking, the microphone and saving to Downloads.
- `wear/` is the watch install, built with Compose for Wear OS. It has four launcher activities, `WalkUpActivity`, `PitchCountActivity`, `ScoresActivity` and `GameChangerActivity` (GC Scores), so the watch shows four apps. `Tiles.kt` has the two tiles (`PitchTileService`, `ScoresTileService`), drawn with ProtoLayout; their services are switched on only from Android 8 (`res/values-v26/bools.xml`). `PitchSyncService` takes the phone's pitch log while the apps are closed. `Complication.kt` puts the pitch count on the watch face. `GcScoreComplication` is the watch face's Live score: it shares `GcStore` with GC Scores, and its words come from `shared/.../GcFace.kt`, with tests. Walk-Up and Pitch Count share `PhoneLink` and `PitchStore`, and one application id with the phone app, which the Wear OS link needs. Its minSdk is 25 (Android Wear 2.0), with java.time desugared, and CI runs lint's NewApi check so it stays that way. An old watch pairs with the phone through Google's Wear OS app, not Galaxy Wearable.
- **Scores' data** is plain HTTPS and JSON, so any watch can read it the same way, an Apple Watch app later included: an anonymous Firebase sign-in, then `shared/macLeagueStandings.json` from LYBS Ballclub's Realtime Database. `shared/.../LeagueScores.kt` has the addresses, the data's shape and the parser, with tests. The data is written by `scripts/scrape-standings.mjs` in the lybs-ballclub repo, every 30 minutes from 8am to 9pm ET.
- Build: `./gradlew :shared:test :phone:assembleDebug :wear:assembleDebug` (JDK 17, Android SDK 35). GitHub Actions runs this on every push that touches `watch/` or Walk-Up.
- The phone app loads the live site. Web changes reach Dugout once they're merged to `main` and published.
- **Signing and releases.** The workflow signs both apps with the key in the `DUGOUT_KEY` secret (a base64 PKCS12 keystore with the alias `dugout`) and its password in `DUGOUT_KEY_PASSWORD`, sets the version code to the run number, and publishes main builds as releases. The key is never committed: `.github/workflows/dugout-key-setup.yml` makes it once, on GitHub's runner, and saves it straight into the secrets. `phone/.../Updater.kt` reads the releases list, and Android only installs an update signed with the same key.

### GC Scores data (and an Apple Watch version later)

GC Scores reads three public GameChanger URLs straight from the watch, with no key or sign-in. A browser can't call them (CORS), but an app can. LYBS Ballclub's schedule mirror (`lybs-ballclub/scripts/scrape-gamechanger-schedule.mjs`) reads the same feed.

| What | URL | Fields used |
| --- | --- | --- |
| Team | `https://api.team-manager.gc.com/public/teams/{teamId}` | `name`, `team_season.season/year/record` |
| Games | `https://api.team-manager.gc.com/public/teams/{teamId}/games` | `id`, `opponent_team.name`, `start_ts`, `end_ts`, `home_away`, `score.team/opponent_team`, `game_status`, `has_live_stream` |
| Line score | `https://api.team-manager.gc.com/public/game-stream-processing/{gameId}/details?include=line_scores` | `line_score.team/opponent_team.scores` (runs by inning), `.totals` (R, H, E) |

`teamId` is the short id in the team's web.gc.com/teams/… link. The parsing and the live/final/upcoming rules are in `shared/.../GcCore.kt` with tests. It's plain JSON over HTTPS and nothing in it is Android-only, so a SwiftUI watchOS app could read the same URLs with `URLSession` and copy those rules. The feed has team names, times and scores only. GC Scores doesn't read the team's staff list, and no player names or stats.

## Setting up another coach

1. Install `dugout-phone.apk` on their Android phone, and `dugout-watch.apk` on their Galaxy Watch if they have one, both from the newest `dugout-v…` release in this repo. Dugout keeps itself up to date after that.
2. Open Dugout on the phone and add their team in Walk-Up: players, songs and voices. Or restore a Walk-Up backup file they made in Chrome.
3. For pitch counts, tap **Count pitches too**, then add pitchers in the Bullpen and pick the league division in Pitching settings. If they use LYBS Ballclub, they can open their own team once through **Watch › Open LYBS Ballclub here**, then add its pitchers.
4. On the watch, open Walk-Up or Pitch Count. **Scores** works for any coach with nothing to set up. For **GC Scores**, paste the team's GameChanger link in **Watch › GameChanger team** on the phone.

Each coach's team stays on their own phone and watch. Coaches without an Android phone can still use Walk-Up in Chrome at the web address above, including the pitch counter, but without a watch.
