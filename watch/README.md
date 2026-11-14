# Dugout: Walk-Up on your phone and your Galaxy Watch

Dugout is two small Android apps that work together:

- **Dugout for the phone.** This app is the Walk-Up web app full screen, with a thin bar on top showing the speaker, plus **Pocket** and **Watch** buttons. The music still plays on the phone, through your Bluetooth adapter on the Bose L1.
- **Two watch apps** (Wear OS, Galaxy Watch 7 or 8), from one install:
  - **Walk-Up**, a remote for the walk-up songs on the phone.
  - **Pitch Count**, a pitch counter.

  Each works without the other. Use Walk-Up on a day with no pitch count, or Pitch Count with no music.

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

## What the phone does

- The **Game** screen is the walk-up player. The pitch counter is off at first. To add it, tap **Count pitches too** on the Game screen, or turn on **Settings › Game mode › Pitch counter on the Game screen**. It then sits at the top of Game (+1, Undo, and the Bullpen), with the walk-up player below. Coaches without a watch use it the same way. Turn it off the same way in Settings, or in Bullpen › Pitching settings.
- Pitch Count on the watch works whether or not the phone shows the pitch counter. Its pitches still sync to the phone.
- **Watch** in the top bar opens a screen where you set a photo for each batter and open LYBS Ballclub inside Dugout.
- **Pocket** turns the screen black and ignores touches, so the phone can't play or stop anything in your pocket. Music and the watch keep working. Hold the screen for 1.5 seconds to unlock it.
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
5. Run `adb install dugout-watch.apk`. **Walk-Up** and **Pitch Count** appear in the watch's app list.
6. Turn **ADB debugging** off again when you're done.

Both apps must come from the same build run, because each run signs them with its own debug key, and the watch only talks to a phone app signed the same way.

## Things to know

- **Your team data.** Dugout has its own storage, separate from Chrome. To move your team in, open Walk-Up in Chrome and tap Settings › Back up everything with audio. Then in Dugout, tap Settings › Restore from a backup file and pick that file.
- **Ballclub pitchers and pitch counts.** In Dugout, tap **Watch › Open LYBS Ballclub here**, sign in and open your team once, then go back to Walk-Up. Pitching settings then offers **Add pitchers from Ballclub**, and pitchers resting from earlier games show "Resting" in the Bullpen.
- **Screen off.** Keep Dugout open and use **Pocket** during games. Dugout also keeps a "Dugout is ready" notification so Android doesn't close it. Music with the phone's screen fully off depends on the phone, so test it once before a game.
- **Battery.** The watch keeps its screen on while Dugout is open. Close the app between innings if battery runs low.

## For developers

- `shared/` holds the message format (`Protocol.kt`) and the pitch math (`PitchCore.kt`). The pitch math is a Kotlin copy of `walkup/pitch-core.js`, and its unit tests match `tests/walkup-pitch.test.cjs`.
- `phone/` is the Dugout phone app. It's a WebView of the live Walk-Up site (`https://natesteele888.github.io/apps/walkup/`) with a JavaScript bridge (`walkup/bridge.js` on the page side, `Bridge.kt` here). The bridge adds Android text-to-speech, file picking, the microphone and saving to Downloads.
- `wear/` is the watch install, built with Compose for Wear OS. It has two launcher activities, `WalkUpActivity` and `PitchCountActivity`, so the watch shows two apps. They share `PhoneLink` and `PitchStore`, and one application id with the phone app, which the Wear OS link needs.
- Build: `./gradlew :shared:test :phone:assembleDebug :wear:assembleDebug` (JDK 17, Android SDK 35). GitHub Actions runs this on every push that touches `watch/` or Walk-Up.
- The phone app loads the live site. Web changes reach Dugout once they're merged to `main` and published.

## Setting up another coach

1. Install `dugout-phone.apk` on their Android phone, and `dugout-watch.apk` on their Galaxy Watch if they have one, both from the same build run.
2. Open Dugout on the phone and add their team in Walk-Up: players, songs and voices. Or restore a Walk-Up backup file they made in Chrome.
3. For pitch counts, tap **Count pitches too**, then add pitchers in the Bullpen and pick the league division in Pitching settings. If they use LYBS Ballclub, they can open their own team once through **Watch › Open LYBS Ballclub here**, then add its pitchers.
4. On the watch, open Walk-Up or Pitch Count.

Each coach's team stays on their own phone and watch. Coaches without an Android phone can still use Walk-Up in Chrome at the web address above, including the pitch counter, but without a watch.
