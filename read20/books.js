/* Read 20: the story shelf. Every story here is free to share: either written for this app, or an old public-domain
   rhyme or fable (Mother Goose, Aesop) that has been retold in simple words.
   Format: the first line of each story is  Title|cover emoji|cover color ; every other line is one page:  words|picture emoji
   Levels go from easy to harder; add a story by adding a block under its level. */
(function (root) {
  "use strict";
  const LEVELS = [
    { n: 1, name: "Sound It Out", sub: "Short words, 2 to 5 words a page", icon: "🌱" },
    { n: 2, name: "Sight Words", sub: "Short words plus words like the, said, you", icon: "🌼" },
    { n: 3, name: "Blends and Rhymes", sub: "sh, ch, th, st, fr… and old rhymes", icon: "🌷" },
    { n: 4, name: "Long Vowels", sub: "cake, bike, snow, tree… and more rhymes", icon: "🌳" },
    { n: 5, name: "Story Time", sub: "Longer stories and fables", icon: "⭐" }
  ];

  const SRC = {
    1: [`Sam the Cat|🐱|#ffe0b2
Sam is a cat.|🐱
Sam sat on a mat.|🐱🧺
Sam has a hat.|🐱🎩
The hat is tan.|🎩
A rat ran at Sam!|🐀🐱
Sam ran and ran.|🐱💨
Sam can nap.|😴🐱`,
`The Fat Rat|🐀|#e6dcf7
A rat ran.|🐀
The rat is fat.|🐀
The rat had a nap.|😴🐀
A cat ran at the rat.|🐱🐀
The rat ran and ran.|🐀💨
The cat is mad.|😾
The rat is not sad.|🐀😊`,
`A Big Pig|🐷|#ffd6e0
A pig is big.|🐷
The pig can dig.|🐷⛏️
The pig dug in the mud.|🐷🟤
The pig has a red wig.|🐷🎀
Zig, zig, zig!|💃🐷
The pig sat in a tub.|🐷🛁
Big pig, big pig!|🐷`,
`Pen the Hen|🐔|#fff3b0
Pen is a hen.|🐔
Pen has a bed.|🛏️
The bed is red.|🛏️
Pen sat on the bed.|🐔🛏️
Peck, peck, peck!|🐔🌾
Pen got ten eggs.|🥚🥚🥚
Pen is a mom hen.|🐔🥚`,
`Bud the Bug|🐞|#d4f0c4
Bud is a bug.|🐞
Bud can hop.|🐞
Bud hid in a mug.|☕🐞
Bud is in the mug!|☕
Tug, tug, tug!|💪
Bud is up.|🐞
Hug, hug, hug.|🤗`,
`Tim and the Pot|🍲|#ffd6a5
Tim has a pot.|🍲
The pot is hot.|🔥🍲
Tim got a lid.|🍲
Tim can mix it.|🥄
Tim can sip.|😋
Yum, yum, yum!|😋
Tim did it!|🎉`,
`Dan's Van|🚐|#bde0fe
Dan has a van.|🚐
The van is tan.|🚐
Pam and Pat sat in the van.|👧👦🚐
Dan can zip, zip, zip.|💨🚐
The van got in the mud.|🟤🚐
Pam and Pat can tug.|💪
Yes! The van is up.|🎉🚐`,
`Dot the Dog|🐶|#ffe5ec
Dot is a dog.|🐶
Dot got a log.|🪵
Dot dug in the mud.|🟤🐶
Dot hid the log.|🐶
Dot sat on the log.|🐶🪵
Dot is hot.|🥵
Dot can nap.|😴🐶`],

    2: [`I Can Run|🏃|#c8f7dc
I can run.|🏃
I can jump.|🤸
I can hop.|🦘
I can skip.|🧒
I can sit.|🪑
You can run, too.|👧🏃
Let us run and jump!|🏃🤸`,
`My Pet|🐕|#ffe8cc
I have a pet.|🐾
My pet is a dog.|🐕
My dog can sit.|🐕
My dog can get a stick.|🪵🐕
My dog will not let go of it.|🐕
I like my dog.|❤️🐕
My dog likes me.|🐶❤️`,
`At the Pond|🦆|#c9eaff
We go to the pond.|🏞️
We see a duck.|🦆
The duck is wet.|💦🦆
We see a frog on a log.|🐸🪵
We see a fish. It can swim.|🐟
The sun is hot.|☀️
We had fun at the pond.|😊`,
`Look in the Box|📦|#eadcff
Look in the box.|📦
I see a red cup.|🥤
I see a pen.|🖊️
I see a tin can.|🥫
What is in the box?|❓
Yes! It is a pup.|🐶
The pup licks me.|🐶😄`,
`Mom and Me|🍞|#ffedd5
Mom and I fix a snack.|👩‍🍳
I get the jam.|🍓
Mom gets the ham.|🍖
We put them on a bun.|🍔
We sit and we eat.|🪑
Yum! It is the best.|😋
I am full. Thank you, Mom!|❤️`,
`What Is It?|🤔|#fff0b3
It is green.|❓
It can hop.|❓
It can swim.|❓
It sits on a log.|❓
It says, "Rib-bit!"|❓
What is it?|🤔
It is a frog!|🐸`,
`Bed Time|🌙|#d0d6ff
The sun is down.|🌇
I get in my bed.|🛏️
Dad said, "Let us read."|📖
We read a big book.|📚
I am in my bed.|🛏️
I will rest.|😌
Nap, nap, nap.|😴`,
`A Big Red Bus|🚌|#ffd0d0
Look at the bus.|🚌
The bus is big.|🚌
The bus is red.|🔴🚌
Kids get on the bus.|🧒🧒🚌
The bus can go up the hill.|⛰️🚌
The bus will stop.|🛑
Bye, bus!|👋`],

    3: [`Chip the Chimp|🐒|#ffd8a8
Chip is a chimp.|🐒
Chip can chat and chomp.|🐒💬
Chip has lunch.|🥪
Chip had a bun and a plum.|🍞🍑
Chip shut the lunch box.|📦
Then Chip got on a swing.|🌳🐒
Swish, swish, swish!|🎠`,
`Fran the Frog|🐸|#c7f9cc
Fran is a frog.|🐸
Fran can swim in the pond.|🏊
Fran can jump on a stump.|🪵🐸
Fran can snap, snap, snap!|🪰
Snap! Fran got a bug.|🐸🪰
Fran sits on a flat log.|🐸🪵
Plop! Fran is in the pond.|💦🐸`,
`The Trip to the Shop|🛍️|#ffc8dd
Mom and I go on a trip.|🚗
We stop at a shop.|🏪
I see a shell.|🐚
I see a ship.|🚢
Mom gets a plant.|🪴
I get a drum.|🥁
We had a fun trip.|😊`,
`Camp Out|⛺|#b9fbc0
Dad and I go to camp.|🏕️
We pack the truck.|🛻
We set up the tent.|⛺
Dad lit a lamp.|🏮
We sit and eat snacks.|🍪
We see stars.|🌟
Snug in the tent, we rest.|😴⛺`,
`Shep the Sheep|🐑|#e9ecef
Shep is a sheep.|🐑
Shep is soft.|🐑
Shep can munch on grass.|🌱🐑
Shep can run fast.|🐑💨
Shep ran past a shed.|🛖
Shep got stuck in the mud.|🟤🐑
Help! Help! Help!|🆘
The man did help. Thank you!|🙏`,
`The Snail Race|🐌|#d0f4de
Snail and Slug had a race.|🐌🪱
"Go!" said the snail.|🏁
Snail is slow.|🐌
Slug is slow, slow, slow.|🪱
They go past a stick.|🪵
They stop to eat a plant.|🌿
Snail and Slug had a snack.|😋`,
`Stan and the Drum|🥁|#ffe3a3
Stan has a drum.|🥁
Stan can drum fast.|🥁💨
Stan can drum slow.|🐢
Drum, drum, drum!|🥁
Mom said, "Stop the drum."|🛑
Stan can clap.|👏
Clap, clap, clap!|👏`,
`Jack and Jill|⛰️|#c9e4ff
Jack and Jill went up the hill|⛰️
To fetch a pail of water.|🪣
Jack fell down and broke his crown,|🤕
And Jill came tumbling after.|💫`,
`Hickory Dickory Dock|🕰️|#e5dbff
Hickory, dickory, dock!|🕰️
The mouse ran up the clock.|🐭
The clock struck one,|1️⃣
The mouse ran down,|🐭
Hickory, dickory, dock!|🕰️`,
`Baa, Baa, Black Sheep|🐑|#ece8f5
Baa, baa, black sheep,|🐑
Have you any wool?|🧶
Yes sir, yes sir,|🙂
Three bags full!|🛍️
One for the master,|👨
One for the dame,|👵
And one for the little boy|👦
Who lives down the lane.|🏡`,
`Mary Had a Little Lamb|🐑|#ffe8f0
Mary had a little lamb,|🐑
Its fleece was white as snow.|❄️
And everywhere that Mary went|🚶‍♀️
The lamb was sure to go.|🐑`],

    4: [`Jake and the Kite|🪁|#bde0fe
Jake has a kite.|🪁
The kite is blue.|🔵
Jake runs and runs.|🏃
The wind blows.|💨
Up, up, up goes the kite!|🪁
The kite is high in the sky.|☁️🪁
Jake smiles. What a day!|😊`,
`Mike's Bike|🚲|#ffd6e0
Mike has a bike.|🚲
The bike is nice.|✨🚲
Mike likes to ride.|🚴
Mike rides up the hill.|⛰️
Mike rides down the road.|🛣️
Ring, ring! Mike has a bell.|🔔
Mike rides home.|🏠`,
`A Cake for Kate|🎂|#fff1b8
Kate wants to bake a cake.|🎂
She gets a bowl.|🥣
She mixes it all.|🥄
Kate puts it in the oven.|♨️
Kate waits and waits.|⏰
The cake is done.|🎂
Kate has a slice. Yum!|🍰`,
`Snow Day|⛄|#e0f2ff
It is a snow day!|❄️
We stay home.|🏠
Jo puts on a coat.|🧥
Jo and I play in the snow.|🛷
We make a snowman.|⛄
He has a long nose.|🥕
Time to go in. Hot cocoa!|☕`,
`The Rain Train|🚂|#cfd8ff
Rain, rain, rain on the train.|🌧️🚂
The train goes down the track.|🛤️
Toot, toot!|🚂
The train will not wait for the rain.|⏱️
It goes past a lake and a gate.|🌊
The rain is gone!|🌤️
The train is home.|🚉`,
`Pete the Bee|🐝|#fff3b0
Pete is a bee.|🐝
Pete can see a green tree.|🌳
Pete hums by the tree.|🐝🌳
Pete sees a big, red rose.|🌹
Zoom! Pete lands on the rose.|🌹🐝
Sweet! Pete likes the treat.|🍯
Pete takes it home to the hive.|🏠🐝`,
`Row, Row, Row Your Boat|🚣|#c8ecff
Row, row, row your boat,|🚣
Gently down the stream.|🌊
Merrily, merrily, merrily, merrily,|😄
Life is but a dream.|💭`,
`Twinkle, Twinkle, Little Star|⭐|#dcd6ff
Twinkle, twinkle, little star,|⭐
How I wonder what you are!|🤔
Up above the world so high,|🌍
Like a diamond in the sky.|💎`,
`Hey Diddle Diddle|🐄|#d6f5e3
Hey, diddle, diddle,|🎻
The cat and the fiddle,|🐱
The cow jumped over the moon.|🐄🌙
The little dog laughed|🐶
To see such sport,|😂
And the dish ran away with the spoon.|🍽️🥄`,
`Little Miss Muffet|🕷️|#ffe0f0
Little Miss Muffet|👧
Sat on a tuffet,|🪑
Eating her curds and whey.|🥣
Along came a spider|🕷️
Who sat down beside her|😨
And frightened Miss Muffet away.|🏃‍♀️`,
`Humpty Dumpty|🥚|#fff0c2
Humpty Dumpty sat on a wall.|🧱🥚
Humpty Dumpty had a great fall.|💥
All the king's horses|🐴
And all the king's men|🤴
Couldn't put Humpty|🥚
Together again.|🥚`],

    5: [`The Hare and the Tortoise|🐢|#d4f5d0
A hare liked to boast. "I am the fastest animal in the woods," he said.|🐇
A slow tortoise said, "Let us have a race."|🐢
The hare laughed. "You? You are too slow!"|😂
Off they went. The hare ran far ahead.|🐇💨
"I have lots of time," he said. He lay down for a nap.|😴
The tortoise kept walking, slow and steady.|🐢
When the hare woke up, the tortoise was at the end!|🏁
Slow and steady wins the race.|🏆`,
`The Lion and the Mouse|🦁|#ffe2b0
A little mouse ran across a sleeping lion.|🐭🦁
The lion woke up and grabbed the mouse.|🦁
"Please let me go," said the mouse. "Some day I will help you."|🥺
The lion laughed, but he let the mouse go.|😄
Later, hunters caught the lion in a net.|🕸️
The mouse heard him roar. He chewed the ropes.|🐭
The lion was free. "Thank you, little friend," he said.|🦁❤️
Even small friends can do big things.|⭐`,
`The Ant and the Grasshopper|🐜|#e4f5c6
All summer, the grasshopper sang and played.|🦗🎶
The ant worked hard and carried food home.|🐜
"Come and play," said the grasshopper.|🎶
"No, I must get ready for winter," said the ant.|❄️
Winter came. The grasshopper had no food.|🥶
He knocked on the ant's door. The ant shared his food.|🚪
Next summer, the grasshopper worked, too.|☀️`,
`The Boy Who Cried Wolf|🐺|#dfe7f5
A boy watched the sheep on a hill.|🐑⛰️
He was bored. "Wolf! Wolf!" he yelled.|📢
The people ran to help. There was no wolf.|🏃
The boy laughed. He did it again.|😂
Then a real wolf came! "Wolf! Wolf!" he cried.|🐺
No one came. They thought he was tricking them.|🙅
Tell the truth, or no one will believe you.|💡`,
`Grandpa's Garden|🌻|#fff0a8
Grandpa has a big garden behind his house.|🏡🌻
In the spring, we dig holes and plant seeds.|🌱
We give the seeds water every day.|💧
Soon, little green sprouts pop up.|🌿
By summer, the plants are tall.|🌽
We pick red tomatoes and sweet corn.|🍅
Grandpa smiles. "You are a good gardener," he says.|👴😊`,
`The Lost Puppy|🐶|#ffe1cc
Mia found a puppy in the park. It had no collar.|🐶🌳
"Are you lost?" she asked. The puppy wagged its tail.|🐕
Mia asked everyone at the park. No one knew the puppy.|🤷
Then a boy ran up, crying. "That is my dog, Max!"|😢
Max jumped into the boy's arms and licked his face.|🐶❤️
"Thank you for finding him!" said the boy.|🙏
Mia felt proud. She had done a good thing.|😊`,
`The Night of the Big Storm|⛈️|#d5dcf5
The wind blew hard. Rain hit the windows.|🌧️💨
Then the lights went out!|🌑
"Do not worry," said Dad. He found a flashlight.|🔦
We sat together on the rug with a blanket.|🛋️
Mom told a story, and the storm went on outside.|📖
After a while, the rain got soft and slow.|🌦️
In the morning, the sun came up. The storm was gone.|🌅`]
  };

  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const books = [];
  Object.keys(SRC).forEach(lv => SRC[lv].forEach(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const [title, cover, color] = lines[0].split("|");
    books.push({
      id: slug(title), level: +lv, title, cover, color,
      pages: lines.slice(1).map(l => { const i = l.lastIndexOf("|"); return { text: l.slice(0, i), pic: l.slice(i + 1) }; })
    });
  }));

  const API = { LEVELS, books };
  root.R20Books = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
