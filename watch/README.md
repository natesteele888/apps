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
- Swipe left or right, or turn the bezel, to move between batters. Swiping never starts or stops music.
- Swipe up, or tap **≡ Order**, for the batting order. Tap a name to jump there.
- To play, press and hold the green **Hold to play** button until the ring fills, about one second. Letting go early does nothing.
- While a song plays, the whole screen pulses blue with **PLAYING**, a ring showing the song's progress, and a big red **STOP**. One tap stops it. You can't swipe to another batter while a song plays.
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

## What the phone does

- The **Game** screen is the walk-up player. The pitch counter is off at first. To add it, tap **Count pitches too** on the Game screen, or turn on **Settings › Game mode › Pitch counter on the Game screen**. It then sits at the top of Game (+1, Undo, and the Bullpen), with the walk-up player below. Coaches without a watch use it the same way. Turn it off the same way in Settings, or in Bullpen › Pitching settings.
- Pitch Count on the watch works whether or not the phone shows the pitch counter. Its pitches still sync to the phone.
- **Watch** in the top bar opens a screen where you set a photo for each batter and open LYBS Ballclub inside Dugout.
- **Pocket** turns the screen black and ignores touches, so the phone can't play or stop anything in your pocket. Music and the watch keep working. Hold the screen for 1.5 seconds to unlock it.
- The Bullpen has an **Official counts** button. In Dugout it opens the MAC League website on its own screen, and remembers the last league page you were on, so next time it opens straight to your team. Dugout only shows the league's page; it doesn't read or copy it. In Chrome the button opens the site in a new tab.
- Pitching settings has a **Copy for Ballclub** button. It copies today's totals so you can paste them into the game in Ballclub.

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
   - Hold **Hold to play**. The song plays on the phone, and the watch turns blue with **STOP**.
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

## Updates

- **Phone:** Dugout checks for a new version when it opens (at most every half hour) and asks **Update Dugout?** Tap **Update**, then **Update** on Android's own screen. The first time, Android asks you to allow Dugout to install apps. **Watch › Check for updates** looks right away.
- **Watch:** the watch app doesn't update itself. When a release changes the watch app, install its `dugout-watch.apk` with step 5 above (step 6 on an older watch).
- Only main-branch builds that change the apps are published, as `dugout-v<number>` releases in this repo. A Walk-Up-only change needs no app update, because Dugout loads the live site.
- **Switching over once:** a Dugout installed from an older build (signed with a throwaway debug key) can't update itself. Uninstall it, then install `dugout-phone.apk` from the newest `dugout-v…` release. Do the same for the watch.

## Things to know

- **Your team data.** Dugout has its own storage, separate from Chrome. To move your team in, open Walk-Up in Chrome and tap Settings › Back up everything with audio. Then in Dugout, tap Settings › Restore from a backup file and pick that file.
- **Ballclub pitchers and pitch counts.** In Dugout, tap **Watch › Open LYBS Ballclub here**, sign in and open your team once, then go back to Walk-Up. Pitching settings then offers **Add pitchers from Ballclub**, and pitchers resting from earlier games show "Resting" in the Bullpen.
- **Screen off.** Keep Dugout open and use **Pocket** during games. Dugout also keeps a "Dugout is ready" notification so Android doesn't close it. Music with the phone's screen fully off depends on the phone, so test it once before a game.
- **Battery.** The watch keeps its screen on while Dugout is open. Close the app between innings if battery runs low.

## For developers

- `shared/` holds the message format (`Protocol.kt`) and the pitch math (`PitchCore.kt`). The pitch math is a Kotlin copy of `walkup/pitch-core.js`, and its unit tests match `tests/walkup-pitch.test.cjs`.
- `phone/` is the Dugout phone app. It's a WebView of the live Walk-Up site (`https://natesteele888.github.io/apps/walkup/`) with a JavaScript bridge (`walkup/bridge.js` on the page side, `Bridge.kt` here). The bridge adds Android text-to-speech, file picking, the microphone and saving to Downloads.
- `wear/` is the watch install, built with Compose for Wear OS. It has four launcher activities, `WalkUpActivity`, `PitchCountActivity`, `ScoresActivity` and `GameChangerActivity` (GC Scores), so the watch shows four apps. Walk-Up and Pitch Count share `PhoneLink` and `PitchStore`, and one application id with the phone app, which the Wear OS link needs. Its minSdk is 25 (Android Wear 2.0), with java.time desugared, and CI runs lint's NewApi check so it stays that way. An old watch pairs with the phone through Google's Wear OS app, not Galaxy Wearable.
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
