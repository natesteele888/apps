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
`Clip Clop the Pony|🐴|#ffe0c2
Clip is a pony.|🐴
Clop is a pony, too.|🐴
Clip can trot fast.|💨🐴
Clop can trot fast, too.|💨🐴
Clip, clop! Clip, clop!|🐴🐴
Clip and Clop trot up the hill.|⛰️🐴
Plop! Clip and Clop nap.|😴🐴`,
`Princess Gwen|👸|#ffd1ec
Gwen is a princess.|👸
Gwen has a pink dress.|👗
The dress has six gems.|💎
Gwen can run in the dress.|🏃‍♀️
Gwen can jump, and the gems go clink, clink!|✨
Gwen is a fun princess.|😊
Gwen sits on the swing.|🛝`,
`Fluff the Rabbit|🐰|#ffd6e8
Fluff is a rabbit.|🐰
Fluff can hop, hop, hop.|🐰
Fluff can dig in the mud.|🟤🐰
Fluff has a snack.|🥕
Crunch, crunch, crunch!|🥕
A fox is in the grass!|🦊
Fluff ran fast and hid in a log.|💨🪵
The fox ran off.|🦊💨`,
`The Pink Castle|🏰|#ffc8dd
The princess has a pink castle.|🏰
The castle has a big flag.|🚩
The castle has bricks.|🧱
The castle has a drum.|🥁
Splash! The castle has a pond.|💦
The princess likes the castle.|❤️🏰
Step in, step in!|🚪`,
`The Slow Sloth|🦥|#e6e0c8
Sloth is slow.|🦥
Sloth can grip a branch.|🌿🦥
Slip, slip, slip.|🦥
A frog hops past.|🐸
"Hop, hop!" said the frog.|🐸
"Slow, slow," said Sloth.|🦥
Sloth is not sad. Sloth likes to be slow.|😊🦥`,
`The Lost Slipper|👠|#ffe0f0
Gwen has a pink slipper.|🩰
Gwen went to a big ball.|💃
Gwen ran fast. Oh no! A slipper fell off!|😮
The slipper is on the step.|👠
Prince Chet got the slipper.|🤴
It fits Gwen! It fits!|✨
Gwen and Chet dance and clap.|💃🤴`,
`Splash the Fish|🐟|#c9eaff
Splash is a fish.|🐟
Splash can swim.|🏊
Splash can flip and flop.|🐟
A big crab is on the rock.|🦀🪨
"Snap!" said the crab.|🦀
Splash swam off fast.|💨🐟
Splash hid in the sand.|🏖️`,
`Princess Trish Can Fix It|🛠️|#ffe3a3
Trish is a princess.|👸
Trish can fix a cart.|🛒
The cart is stuck in the mud.|🟤
Trish got a stick and a plank.|🪵
Tug, tug, tug!|💪
Clink, clank! Clink, clank!|🔧
The cart is not stuck! Trish can fix it!|🎉`,
`Chuck the Chick|🐥|#fff3b0
Chuck is a chick.|🐥
Chuck can peck, peck, peck.|🌾
Chuck can chat. "Chip, chip!"|💬
Chuck has a snack.|🌽
A truck! Chuck ran fast.|🚚💨
Chuck hid in a box.|📦
The truck went past. Chuck is back with Mom.|🐔`,
`The Pink Wand|🪄|#e5dbff
Princess Bell has a wand.|🪄
Swish, swish!|✨
Zap! A frog is in the grass.|🐸
The frog is pink!|🐸💗
"Not pink!" said the frog.|🐸
Swish! The frog is green.|💚
"Thank you, Bell!" said the frog.|🐸👸`,
`The Big Crab|🦀|#ffd0c0
A crab is on the sand.|🏖️
Snap, snap, snap!|🦀
The crab can pinch.|🦀
A shell is on the sand.|🐚
The crab went in the shell.|🐚🦀
Splash! Splash!|🌊
The crab can run on the sand.|💨🦀`,
`Princess Clem and the Dragon|🐉|#d4f0c4
A dragon is on the hill.|🐉⛰️
The dragon is sad.|😢
Princess Clem runs up the hill.|🏃‍♀️
"Are you sad?" said Clem.|👸
"I have a cold," said the dragon.|🤧
Clem got a rug and a hot cup.|🧣☕
The dragon is not sad!|🐉😊`,
`Pug and the Stick|🐶|#e8d6ff
Pug is a dog.|🐶
Pug has a stick.|🪵
Pug can run with the stick.|🏃🪵
"Drop it, Pug!" said Dad.|🧔
Pug did not drop it.|🐶
Dad has a snack.|🍖
Pug let go of the stick. Good Pug!|🐶❤️`,
`The Duck Race|🦆|#d4f0c4
Six ducks sit on a log.|🪵🦆
"Quack, quack!" said Duck.|🦆
"Let us swim fast!"|🏊
Splash, splash, splash!|💦
Stan swam fast.|💨🦆
"I win!" said Stan.|🏆
The six ducks had fun.|😊`,
`A Hut for Pug|🐶|#ffe0b2
Pug has no hut.|🐶
Let us build a hut for Pug.|🔨
First, get six planks.|🪵
Next, tap, tap, tap with a hammer.|🔨
Then, put the planks on top.|🏠
Last, add a flag.|🚩
Pug can sit in the hut! Pug is glad.|🐶🏠`,
`Build a Sand Castle|🏖️|#fff0c2
Kim and Dad sit on the sand.|🏖️
First, dig in the sand.|⛏️
Next, pack the sand in a pan.|🪣
Then, flip the pan.|🔄
Tap, tap, tap!|🏖️
Last, add a flag on top.|🚩
Kim and Dad clap.|👏`,
`Build a Fort|⛺|#d4f0c4
Kim and Dad will build a fort.|⛺
First, get six sticks.|🌿
Next, stand the sticks up.|⬆️
Then, put a cloth on top.|🛖
Last, put a rug in the fort.|🟫
Kim and Dad sit in the fort.|👧🧔
It is snug!|😊`,
`The Block Tower|🧱|#ffd6a5
Ben has six blocks.|🧱
First, set a block.|🧱
Next, set a block on top.|🧱🧱
Then, stack and stack.|🧱🧱🧱
The stack is tall!|🗼
Crash! The blocks fall.|💥
Ben can stack them up, up, up!|🧱`,
`The Brick Hut|🧱|#ffc8c0
Ben the pig will build a hut.|🐷
First, get bricks.|🧱
Next, stack the bricks.|🧱🧱
Then, put mud on the bricks.|🟤
Last, add a flat top.|🏠
The hut is up!|🎉
Ben sits in the hut. It is snug.|🐷🏠`,
`Jam on a Bun|🍔|#ffd6e0
Let us fix a snack.|🥪
First, get a bun.|🍔
Next, add jam.|🍓
Then, add a plum.|🍑
Last, put the top on.|🍔
Yum, yum, yum!|😋
It is a big snack!|🍔`,
`The Sun|☀️|#fff3b0
The sun is up.|🌅
The sun is hot.|🥵
The sun is big.|☀️
The sun is a star.|⭐
The sun is far, far off.|🌌
It is a big, hot star.|☀️
Hi, sun!|👋☀️`,
`The Moon|🌙|#dcd6ff
The moon is up.|🌙
The moon is not hot.|🥶
The moon is a big rock.|🪨
The moon has dents.|🌑
The moon gets thin.|🌘
Then the moon gets big.|🌕
Hi, moon!|👋🌙`,
`Sun and Moon|🌞|#ffe8a8
Sun is up. Moon is down.|☀️
Sun is hot. Moon is not.|🌙
Sun and Moon swap.|🔄
Sun is down. Moon is up.|🌙
Sun naps. Moon is up in the dark.|🌌
The sun is back! The moon naps.|🌅
Up, down, up, down!|🔁`,
`At the Ocean|🌊|#c9eaff
The ocean is big.|🌊
Splash, splash on the sand.|💦
A crab is on a rock.|🦀
A fish can swim fast.|🐟
A shell is in the sand.|🐚
A ship is on the ocean.|🚢
The ocean is big, big, big!|🌊`,
`A Walk in the Forest|🌲|#cdeccf
We go for a walk in the forest.|🥾
We see a stump with moss.|🪵
A frog hops on a log.|🐸
Six ants went up a twig.|🐜
Shh! An elk!|🦌
The elk ran off.|💨
We had a fun walk.|😊`,
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
`Kate Learns to Cheer|🎀|#ffd6e8
Kate wants to cheer.|📣
Coach Jean shows a cheer.|👩‍🏫
"Clap, clap, jump!"|🙌
Kate claps. Kate jumps high.|🤸
Kate shakes her poms.|🎀
"Go, team, go!" Kate yells.|📣
Kate is on the team!|🎉`,
`Pyramid Day|🔺|#ffe0b2
Today the team makes a pyramid.|🔺
Jade and Fay are the bases.|🧍‍♀️
They stand in a line.|➖
Rose is the flyer.|🧍‍♀️
Rose climbs up. She holds on tight.|⬆️
The spotter stays close.|👀
The pyramid stays up! Cheers!|🎉`,
`Game Day Cheer|📣|#c9eaff
It is game day!|🏟️
The team rides the bus.|🚌
The fans wave and cheer.|👏
Kate leads the cheer.|📣
"We can win! We can win!"|🎉
The team scores!|🏆
The fans cheer and cheer.|📣`,
`Mae on the Beam|🤸|#e5dbff
Mae stands on the beam.|🤸‍♀️
The beam is high and thin.|📏
Mae holds her arms out wide.|🙆‍♀️
Step, step, step.|👣
Mae turns on one toe.|🩰
She jumps! She lands!|✨
Mae stays on the beam!|🏅`,
`Cartwheel Day|🤸‍♀️|#ffd6a5
Jane wants to do a cartwheel.|🤸‍♀️
Hands down. Feet up.|🙌
Oops! Jane falls on the mat.|😵
Jane tries again.|🔁
Hands down. Feet up. Over!|🌀
Jane lands on her feet.|🦶
"I did it!" Jane cheers.|🎉`,
`The Big Flip|🤸|#dbf0d0
Rae is scared to flip.|😨
"Take your time," says Coach Dee.|👩‍🏫
Rae takes a deep breath.|🌬️
Coach Dee stays close.|👀
Rae tucks her knees and flips.|🤸
She lands on the mat.|🧘‍♀️
Rae is brave! "I did it!"|🏅`,
`Dave the Whale|🐋|#c9eaff
Dave is a whale.|🐋
Dave can swim in the deep sea.|🌊
Dave sings a song.|🎵
"Oooo, oooo," sings Dave.|🐋
A little fish hears the song.|🐟
The fish swims by Dave.|🐟🐋
Dave and the fish are friends.|💙`,
`Princess Rose and the Goat|🐐|#ffd1dc
Princess Rose has a goat.|👸🐐
The goat is named Moe.|🐐
Moe likes to chew.|😋
Moe chews the robe!|👘
"Moe, no!" says Rose.|🙅‍♀️
Rose gives Moe a snack.|🥕
Moe is kind. Rose gives a hug.|🤗`,
`The Rain|🌧️|#d0e0f5
It is a gray day.|☁️
Drip, drop. It starts to rain.|💧
Rain, rain, rain!|🌧️
The rain stops.|☀️
Look! A rainbow!|🌈
Red, blue, green, and gold.|🌈
The rainbow stays.|😊`,
`How to Make a Kite|🪁|#bde0fe
Let us make a kite.|🪁
First, get two sticks.|🌿
Next, tape the sticks.|📏
Then, tape on the paper.|📄
Last, tie on a string.|🧵
Take the kite to the lake.|🏞️
Up, up, up it goes!|🪁`,
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
In the morning, the sun came up. The storm was gone.|🌅`,
`Cheer Tryouts|📣|#ffd6e8
Maya wanted to be on the cheer team more than anything.|🎀
But tryouts were on Friday, and she was nervous.|😬
Every day after school, Maya practiced the routine in her room.|🏠
Her big sister Lila watched and clapped.|👭
"Smile bigger," said Lila. "Cheer is about showing joy!"|😁
On Friday, Maya walked into the gym with her heart pounding.|💓
She forgot one jump, but she smiled and kept going.|🤸‍♀️
The coach said, "Welcome to the team, Maya!"|🎉`,
`The Squad's First Competition|🏆|#ffe3a3
The squad had worked hard for weeks, and today was the big competition.|🏆
Their uniforms were bright red and white, and their bows were perfect.|🎀
The first part of the routine went great.|👏
Then Zoe, the flyer, wobbled at the top of the stack.|😮
The bases held her steady, and she smiled as if nothing had happened.|🤝
At the end, the squad did not win first place.|🥈
But the judges said they showed great teamwork.|📋
On the bus home, the squad sang and said, "Next time!"|🚌`,
`Nadia and the Perfect Ten|🏅|#fff0b3
Nadia was born in Romania in 1961. She started gymnastics when she was six years old.|🤸
A coach saw her and her friend doing cartwheels on a school playground.|🤸‍♀️
Nadia trained hard and got better and better.|💪
In 1976, at the Olympic Games in Montreal, she was only fourteen.|🏟️
On the uneven bars, she did her routine without one mistake.|🤸
The judges gave her a perfect score: a ten! No gymnast had ever gotten one at the Olympics.|🔟
The scoreboard was not made to show a ten, so it showed 1.00!|📟
Nadia won three gold medals at those Games and earned seven perfect tens.|🥇`,
`How Gymnasts Stay Safe|🧤|#d4f0c4
Gymnastics looks like magic, but gymnasts also follow safety rules.|🤸
Before they start, they warm up so their muscles are ready.|🔥
They rub chalk on their hands to keep them dry and help them grip.|🤲
Thick mats on the floor soften landings.|🟦
A spotter is a coach who stands close and helps if a gymnast starts to fall.|👀
Gymnasts learn small skills first and build up to big ones.|📈
If something hurts, they tell their coach right away.|🗣️
Safe gymnasts can have fun for a long time.|😊`,
`A Sea Turtle's Journey|🐢|#c9eaff
On a warm night, a mother sea turtle crawls out of the ocean onto the sand.|🌙
She digs a deep hole with her back flippers.|🏖️
She lays about a hundred eggs in the hole and covers them with sand.|🥚
Then she goes back to the sea, and the eggs stay warm under the sand.|🌊
After about two months, the baby turtles hatch and dig their way out.|🐣
They crawl toward the sparkling ocean as fast as their little flippers can go.|🐢
Many animals try to eat them, so only a few grow up.|🦀
Years later, a grown female may swim back to the same beach to lay her own eggs.|🏖️`,
`Princess Mia and the Missing Key|🗝️|#e5dbff
Princess Mia woke up and found that the castle gate key was gone.|🏰
Without the key, no one could open the big gate for the morning market.|🚪
"I will find it," said Mia, and she looked around the great hall.|🔍
In the kitchen, the cook said she had seen something shiny in the garden.|👩‍🍳
In the garden, a little gray cat sat by the fountain, licking its paw.|🐈
The key was hanging on the cat's collar, tied with a ribbon.|🗝️
Mia gave the cat a treat, and the cat let her take the key.|🍖
The gate opened, the market began, and Mia was the hero of the morning.|🎉`,
`How Rain Happens|☔|#d0e0f5
Rain does not just fall from nowhere. It is part of a big circle called the water cycle.|☔
First, the sun warms water in oceans, lakes and puddles.|☀️
The warm water turns into a gas called vapor and rises into the air.|⬆️
High up, the air is cold, and the vapor turns back into tiny drops of water.|❄️
Millions of tiny drops gather together to make clouds.|☁️
When the drops get big and heavy, they fall as rain.|🌧️
The rain flows into streams and rivers and back to the ocean.|🏞️
Then the sun warms it again, and the circle starts over.|🔄`,
`Building a Treehouse|🌳|#cdeccf
Dad and Sam wanted to build a treehouse in the big oak tree.|🌳
First, they made a plan and drew it on paper.|📝
Next, Dad picked a strong branch, and they measured twice before cutting.|📏
Then they built the floor, and Sam held the boards while Dad used the drill.|🔨
They added walls and a roof, and Sam painted the door blue.|🎨
Last, they put up a rope ladder and a little flag.|🚩
That night, Sam and Dad climbed up to look at the stars.|⭐
"Best house ever," said Sam.|🏠`]
  };

  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const books = [];
  Object.keys(SRC).forEach(lv => SRC[lv].forEach(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const [title, cover, color] = lines[0].split("|");
    books.push({
      id: slug(title), shelf: "early", level: +lv, title, cover, color,
      pages: lines.slice(1).map(l => { const i = l.lastIndexOf("|"); return { text: l.slice(0, i), pic: l.slice(i + 1) }; })
    });
  }));

  const API = { LEVELS, books };
  root.R20Books = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
