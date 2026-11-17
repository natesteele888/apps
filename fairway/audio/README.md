# Fairway menu sounds

The home screen plays quiet ambience after the first tap: birdsong, a light breeze and a calm piano over a soft pad. All of it is made in the phone by `../sound.js` (Web Audio), so nothing needs to be here.

To use your own recordings instead, drop either file here with exactly this name. A file replaces only its own layer:

| File | Replaces | Volume |
| --- | --- | --- |
| `menu-birds.mp3` | the made-up birdsong | 22% |
| `menu-music.mp3` | the made-up piano and pad | 14% |

- MP3, ideally 1 to 3 minutes, trimmed so the end flows back into the start. Keep each under about 3 MB.
- Only use audio you have the rights to (your own recordings, or licensed for this use).
- Scoring screens stay quiet: the sound fades out when a tournament opens and back in on the menu.
- Volumes, fade time and the chord list are at the top of `../sound.js`.
- After adding a file, add it to `SHELL` in `../sw.js` so it plays offline too.
