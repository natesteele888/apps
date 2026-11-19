# Hole art

Pictures of each hole that come with the app. When a hole has one, Fairway shows it on the Score screen instead of
the pencil sketch. The sketch still shows if the picture can't load.

To add a course's art:

1. Make a folder named for the course id (Monoosnock is `monoosnock`), for example `art/monoosnock/`.
2. Put one picture per hole in it, named by hole number: `1.webp`, `2.webp` ... `18.webp`. Keep each one under
   about 150 KB (about 640 pixels on the long side). The tee should be at the bottom and the green at the top.
3. In `core.js`, list the holes that have a picture in `HOLE_ART`, like `monoosnock: { ext: "webp", holes: [1, 2, 3] }`.

A front or back nine of that course uses the same pictures. Only drawings of the course go here. No photos of people.
