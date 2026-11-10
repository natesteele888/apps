/* Read 20: the older-reader shelf (about grades 5 to 8). Real facts about sports, photography and fitness, plus short biographies of athletes.
   Written for this app in plain words from widely documented facts; each story ends with a three-question check.
   Format: the first line of a story is  Title|cover emoji|cover color|topic|difficulty (1 to 3) ; every other line is one page of words,
   except lines that start with =  (a word to know:  =word|meaning) and lines that start with ?  which are quiz questions:  ?Question|answer A|answer B|answer C|number of the right answer (0 is A). */
(function (root) {
  "use strict";
  const TOPICS = [
    { id: "sports", name: "Sports", icon: "⚽", sub: "How the games work, and where they came from" },
    { id: "photo", name: "Photography", icon: "📷", sub: "Light, cameras and how to take better pictures" },
    { id: "fitness", name: "Fitness", icon: "💪", sub: "How your body gets faster and stronger" },
    { id: "athletes", name: "Athletes", icon: "🏅", sub: "True stories of people who changed their sports" },
    { id: "social", name: "Social Studies", icon: "🌎", sub: "Maps, early civilizations and how governments work" },
    { id: "english", name: "English", icon: "✍️", sub: "Reading skills, vocabulary and writing, with sports examples" }
  ];

  const SRC = [
`The Curveball Mystery|⚾|#fff3b0|sports|2
In baseball, a pitcher stands 60 feet, 6 inches from home plate and throws a ball only about three inches wide. A fastball can cross that distance in less than half a second. So how can a pitch moving that fast also curve?
The answer is spin. When a pitcher throws a curveball, his fingers snap down over the front of the ball and give it a hard forward spin. A good curveball can spin more than 2,000 times every minute.
Spin changes the air around the ball. The raised seams grab the air and drag it along with the spin, so the air gets pushed one way and the ball gets pushed the other. Scientists call this the Magnus effect, after the German scientist Heinrich Magnus, who studied it in the 1850s. With topspin, the ball is pushed downward, so it dives.
An official baseball is built from a small core wrapped in yarn and covered with two pieces of leather. Those pieces are sewn together with 108 red stitches. The stitches are not just decoration. They help the ball grip the air.
A hitter has only a few tenths of a second to decide whether to swing. A curveball looks like a fastball for most of the trip, and then it drops. That is why hitting a baseball is often called one of the hardest things to do in sports.
=Magnus effect|the way spin makes a moving ball curve
=seam|the raised stitched line on a ball
=topspin|forward spin that makes a ball dive down
?How far is the pitcher's mound from home plate?|50 feet|60 feet, 6 inches|90 feet|1
?What makes a curveball curve?|A lighter ball|Spin and the air around the seams|A longer throw|1
?How many stitches does an official baseball have?|108|60|216|0`,

`Peach Baskets and Ten Feet|🏀|#ffd9a8|sports|1
In December 1891, a gym teacher named James Naismith had a problem. It was winter in Springfield, Massachusetts, and his students were bored with indoor exercises. He needed a new game that could be played inside, and he had only a short time to invent it.
Naismith nailed two peach baskets to the lower rails of the gym balcony. The rail happened to be 10 feet above the floor. That is the reason basketball hoops are still 10 feet high today, more than a hundred years later.
The first game used a soccer ball and had 13 rules. Eighteen students played, nine on each team. At first, someone had to climb a ladder to take the ball out of the basket after every score. Some years later, the bottoms of the baskets were cut out so the ball could drop through.
The earliest rules did not include dribbling. Players moved the ball by passing it. Dribbling slowly became part of the game as players figured out that bouncing the ball let them move with it.
Basketball spread quickly through schools and YMCAs. Men's basketball became an Olympic sport in 1936, and women's basketball joined the Olympics in 1976. A game invented to keep students busy on cold days is now played all over the world.
=balcony|a platform that sticks out inside a building
=invent|to make something completely new
=dribble|to bounce a ball again and again while you move
?In what month and year was basketball invented?|July 1900|December 1891|March 1925|1
?What did Naismith nail up as the first hoops?|Metal rings|Peach baskets|Wooden boxes|1
?Why are hoops 10 feet high?|The balcony rail was 10 feet up|A rule from soccer|Players were that tall|0`,

`How the Olympic Games Began|🏅|#ffe0a8|sports|2
The first Olympic Games were held in Olympia, in ancient Greece. By tradition, they began in the year 776 BC, and they were held every four years. Athletes competed to honor Zeus, the king of the Greek gods. The winners did not get gold medals. They were crowned with wreaths made from olive branches.
The earliest event was a footrace of about 200 meters. Over the years, the Games added longer races, wrestling, boxing, the long jump, the discus and the javelin. Only free Greek men were allowed to compete, and the Games lasted for hundreds of years.
Greek city-states often fought wars against each other. But they agreed to stop fighting while the Games were going on, so athletes and visitors could travel safely. This agreement is known as the Olympic truce.
The ancient Games ended, and for centuries they were forgotten. In the 1890s, a Frenchman named Pierre de Coubertin helped bring them back. The first modern Olympic Games were held in Athens, Greece, in 1896. Athletes came from a small group of nations, but the idea took off.
The Olympic flag shows five linked rings. They stand for the five parts of the world that took part when the symbol was created: the Americas, Africa, Asia, Europe and Oceania. The first Winter Olympics were held in 1924 in Chamonix, France. Today thousands of athletes from more than 200 countries and territories compete.
=truce|an agreement to stop fighting for a while
=wreath|a ring of leaves worn on the head
=revive|to bring something back to life
?Where were the ancient Olympic Games held?|Athens|Olympia|Sparta|1
?What did winners of the ancient Games receive?|Gold medals|Olive wreaths|Money|1
?In what year were the first modern Olympics held?|1896|1924|1950|0`,

`The Marathon: 26.2 Miles|🏃|#d4f0c4|sports|2
The marathon gets its name from a legend. According to the story, a Greek messenger named Pheidippides ran from the town of Marathon to Athens to announce that the Greeks had won an important battle. The story says he gave his message and then collapsed. Historians are not sure how much of it is true, but the legend stuck.
When the modern Olympics began in 1896, a long race from Marathon to Athens was added to honor the story. At first, the distance was not exactly the same from one Olympics to the next.
In 1908, the Olympics were held in London. The race began at Windsor Castle and ended in front of the royal box inside the stadium. That route measured 26 miles and 385 yards, or about 26.2 miles. The distance was made official in the 1920s, and every marathon since has used it.
Runners train for months to prepare. Many describe a moment late in the race called hitting the wall, when the body has used up much of its stored energy. Experienced runners plan their pace and eat and drink along the way to avoid it. Many say the hardest part of the marathon is mental.
In 2019, Eliud Kipchoge of Kenya ran 26.2 miles in 1 hour, 59 minutes and 40 seconds in a special event in Vienna, Austria. He was the first person to finish a marathon in under two hours. It did not count as an official world record because of the pacers and other help he had, but it showed what was possible. That pace works out to about 4 minutes and 34 seconds per mile.
=legend|a very old story that may not be completely true
=pace|how fast you move at a steady speed
=official|approved by the people who make the rules
?Who ran from Marathon to Athens in the legend?|Pheidippides|Naismith|Coubertin|0
?About how long is a marathon?|13.1 miles|26.2 miles|50 miles|1
?What did Kipchoge do in 2019?|Won the Olympics|Ran a marathon in under two hours|Set a mile record|1`,

`Faster Than a Blink|⚡|#ffe1cc|sports|2
On August 16, 2009, at the world championships in Berlin, Usain Bolt of Jamaica ran 100 meters in 9.58 seconds. That is still the fastest time ever recorded. A single blink of your eye takes about three tenths of a second, so Bolt covered about 3 meters in the time it takes to blink.
A sprinter's race starts before the first step. In a 100-meter race, runners crouch in starting blocks and push off when the starting gun fires. If a runner starts moving less than a tenth of a second after the gun, it counts as a false start, because no human can react that fast. Even the best sprinters have a reaction time of about 0.15 seconds.
Bolt reached a top speed of about 27 miles per hour somewhere in the middle of the race. Taller runners usually take fewer steps, and Bolt, who is 6 feet, 5 inches tall, covered the 100 meters in only about 41 strides. Most elite sprinters take 44 or more.
Bolt won the 100 meters and 200 meters at three Olympic Games in a row, in 2008, 2012 and 2016. He finished his career with eight Olympic gold medals. His 200-meter world record of 19.19 seconds, also set in Berlin, still stands.
Still, the fastest human is not the fastest animal. A cheetah can run up to about 60 miles per hour, more than twice as fast as Bolt at his best. But a cheetah can keep it up for only a short time, and then it must rest.
=false start|leaving the blocks before the starting gun
=stride|one long step while running
=record|the best result anyone has ever had
?What was Bolt's world record in the 100 meters?|9.58 seconds|10.5 seconds|8.9 seconds|0
?What is a false start in a sprint?|Leaving the blocks less than a tenth of a second after the gun|Falling down|Running the wrong lane|0
?Which is faster at top speed?|Bolt|A cheetah|They are the same|1`,

`The First Photograph|📷|#d6e4ff|photo|2
For most of history, if you wanted a picture of something, you needed a painter. Then, in the 1820s, a French inventor named Joseph Nicéphore Niépce wondered if light itself could make a picture.
He used a metal plate coated with bitumen, a tar-like substance that hardens when sunlight hits it. He put the plate inside a camera obscura, which is a box with a small opening that lets in light and projects the view outside onto the back wall. Then he aimed it out of an upstairs window at his home in the French countryside.
The exposure took hours. Historians still argue about whether it was eight hours or even several days. The sun moved across the sky during that time, so the buildings in the picture are lit from both sides. The photograph, made around 1826 or 1827, is called View from the Window at Le Gras. It is the oldest surviving photograph taken with a camera.
After Niépce, a painter named Louis Daguerre improved the process. In 1839, the French government announced his daguerreotype to the world. Exposures that once took hours now took minutes.
Photography became something that ordinary people could do in 1888, when George Eastman introduced the Kodak camera. It came with film already loaded. His slogan was, "You press the button, we do the rest." Today the camera in your phone can capture a picture in a fraction of a second.
=exposure|the time a camera lets light in
=bitumen|a thick, tar-like material
=camera obscura|a dark box that shows the outside view through a tiny hole
?Who made the first surviving photograph?|Niépce|Eastman|Daguerre|0
?About how long did the first exposure take?|One second|Hours|One minute|1
?What did the Kodak camera make easier?|Taking pictures|Painting|Printing books|0`,

`Aperture, Shutter, ISO|🎛️|#e5dbff|photo|3
A photograph is made of light. Every camera, from a phone to a professional model, has to control how much light reaches its sensor. It does this with three settings: aperture, shutter speed and ISO. Photographers call them the exposure triangle, because changing one affects the other two.
Aperture is the size of the opening inside the lens. It is measured in f-numbers, such as f/2 or f/8. This surprises many beginners: a smaller f-number means a bigger opening, so more light comes in. A wide opening also blurs the background, which makes a player or a person stand out.
Shutter speed is how long the sensor is exposed to light. A shutter speed of 1/1000 of a second freezes a diver in mid-air. A shutter speed of one full second turns a waterfall into a silky blur. Slow speeds let in more light but blur anything that moves.
ISO is how sensitive the camera is to light. A low number, such as ISO 100, gives a clean picture in bright sunlight. A high number, such as ISO 3200, makes pictures brighter in dark places, but it also adds grain, which photographers call noise.
Good photographers balance all three. A dim gym is a hard place to shoot basketball, because the action is fast and the light is low. So the photographer opens the aperture wide, uses a fast shutter speed to freeze the action, and raises the ISO to make up for the rest.
=aperture|the opening in a lens that lets light in
=sensor|the part inside a camera that catches the light
=noise|grainy speckles in a photo
?What does a smaller f-number mean?|A smaller opening|A bigger opening|A slower shutter|1
?Which shutter speed freezes fast action best?|One second|1/30 of a second|1/1000 of a second|2
?What is the cost of a very high ISO?|Grain, or noise|Less light|A heavier camera|0`,

`Freeze the Action|📸|#ffd6e0|photo|2
At a football game, the best moment lasts only an instant. The receiver's fingertips touch the ball. The runner leaps over the goal line. A sports photographer has to be ready for it before it happens.
The first tool is shutter speed. To freeze a running athlete, photographers often use 1/1000 of a second or faster. At 1/60 of a second, the same runner would be a blur. Sports photographers also use telephoto lenses, which work like binoculars and bring faraway action close.
Most cameras can shoot in burst mode, taking many pictures in a row while you hold down the button. Some professional cameras can take 20 or more pictures every second. A photographer then chooses the single best frame, where the ball is in sight, the face is clear and the body is at its peak.
Sometimes photographers do the opposite on purpose. In a technique called panning, they use a slower shutter speed, like 1/60 of a second, and swing the camera smoothly to follow a runner or a cyclist. If it works, the athlete stays sharp and the background streaks into lines. The picture feels fast.
The best photographers also know the sport. They study where the ball is likely to go and stand in that spot. They get low to the ground to make athletes look powerful. And they remember that the action is not the only story. A coach's face, a hug, or a player slumped on the bench can say even more.
=burst mode|taking many pictures quickly in a row
=telephoto lens|a lens that makes faraway things look close
=panning|following a moving subject with the camera
?What does a fast shutter speed do?|Freezes motion|Blurs motion|Makes the picture dark|0
?What is panning?|Zooming out|Following a moving subject with a slow shutter|Using a flash|1
?Why do photographers get low to the ground?|It makes athletes look powerful|It is safer|It is cheaper|0`,

`Seeing Like a Photographer|🖼️|#ffeccc|photo|2
Two people can stand in the same spot, point the same camera, and take very different pictures. The difference is composition, which means how you place things inside the frame.
One of the best-known guides is the rule of thirds. Imagine lines that divide your picture into three equal rows and three equal columns, like a tic-tac-toe board. Instead of putting your subject in the middle, place it on one of the lines, or where two lines cross. Pictures often feel more balanced and interesting that way. Most phones can show this grid on the screen if you turn it on in the camera settings.
Look for leading lines, such as a road, a fence, the stripes on a field or a row of lockers. These lines pull the viewer's eye toward your subject. Try framing, too. A doorway, a window or tree branches can create a frame within the frame.
Watch the background. Beginners often do not notice a pole that seems to be growing out of someone's head until they look at the picture later. Take a second to scan the edges before you press the button.
Light matters as much as anything. Photographers love golden hour, the time just after sunrise and just before sunset. The sun is low, and the light is warm and soft. At midday, the sun is overhead and makes harsh shadows. When in doubt, move closer, change your angle, and take more than one picture.
=composition|how things are arranged in a picture
=leading lines|lines that guide the viewer's eye
=golden hour|the warm light after sunrise and before sunset
?What is the rule of thirds?|Taking three photos|Placing the subject off-center on a 3 by 3 grid|Using three lenses|1
?What are leading lines?|Lines that pull the eye toward the subject|Lines on the camera|A drawing tool|0
?When is golden hour?|At noon|Near sunrise and sunset|At midnight|1`,

`Ansel Adams: Painting With Light|🏔️|#e0f2ff|photo|3
Ansel Adams was born in San Francisco in 1902. He was an energetic, restless child who had trouble sitting still in school. He taught himself to play the piano and planned to become a concert pianist.
When he was 14, his family took a trip to Yosemite National Park in California. He brought a simple box camera and took his first photographs there. He was amazed by the granite cliffs, the waterfalls and the light. He returned to Yosemite almost every year for the rest of his life.
Photographing mountains took patience and strength. Adams often hiked for miles carrying a heavy view camera, a tripod and glass plates, and he sometimes waited hours for the light to be right. He was known for black-and-white pictures with deep shadows, bright whites and a wide range of grays in between.
In the late 1930s and early 1940s, Adams and another photographer, Fred Archer, developed the Zone System. It is a method for planning how the tones of a photograph, from pure black to pure white, will look in the final print. Photographers still study it today. One of his most famous pictures, Moonrise, Hernandez, New Mexico, was taken in 1941.
Adams cared about wild places as much as he cared about photography. He worked with the Sierra Club and used his pictures to persuade people to protect national parks. He died in 1984, at the age of 82. His pictures still teach photographers a lesson: great photos are not only about the camera. They are about knowing where to stand and waiting for the right light.
=granite|a hard gray rock
=tone|how light or dark something is
=wilderness|wild land that people have not changed
?Which national park did Adams visit at age 14?|Yellowstone|Yosemite|The Grand Canyon|1
?What was the Zone System?|A way to plan the tones in a photograph|A type of lens|A park rule|0
?What did Adams use his photographs to help do?|Win races|Protect wild places|Sell cameras|1`,

`The Horse That Changed Photography|🐎|#ffe8cc|photo|3
In the 1870s, people argued about a question that sounds simple: when a horse gallops, are all four of its feet ever off the ground at the same time? Painters usually drew galloping horses with their legs stretched out front and back, like a rocking horse. But nobody could see a gallop clearly enough to be sure. The legs move too fast for the human eye.
Leland Stanford, a wealthy businessman and a former governor of California, loved horses and wanted to know the answer. He hired Eadweard Muybridge, a photographer known for his pictures of the American West, to find out with a camera.
It was a huge challenge. Cameras of the time needed long exposures, and a galloping horse would be a blur. Muybridge built much faster shutters. In 1878, at a track in Palo Alto, California, he set up a row of cameras along the track. Each camera was triggered by a thread or wire that the horse hit as it ran past.
The pictures were clear. At one moment in the stride, all four hooves were off the ground. But the legs were bunched up under the horse, not stretched out the way painters had drawn them. The horse was flying, just not the way anyone had imagined.
Muybridge went on to photograph people and animals in motion, and he invented a device that displayed his pictures one after another so they seemed to move. This was an early step toward movies. When you watch a slow-motion replay of a home run or a dunk, you are using an idea that began with a horse in California.
=gallop|a horse's fastest running pace
=shutter|the part of a camera that opens and closes to let in light
=sequence|things in a certain order
?What question did the photographs answer?|How fast horses run|Whether all four hooves leave the ground|How tall a horse is|1
?How did the cameras get triggered?|By threads or wires the horse hit|By a person's button|By a clock|0
?What did Muybridge's work lead toward?|Movies|Radio|Cars|0`,

`Why Warm Up?|🔥|#ffd8a8|fitness|1
Think about a piece of cold taffy. If you try to stretch it right out of the fridge, it is stiff and might snap. If you warm it in your hands first, it bends easily. Muscles are not taffy, but the idea is similar. Warm muscles are more flexible and ready to work.
A warm-up raises your heart rate gradually and sends more blood to your muscles. As the blood flows, your muscles warm up, and your body gets ready for harder effort. A warm-up also gets your brain and your muscles working together, so your movements feel smoother.
The best warm-ups use dynamic stretching, which means stretching while you move. Good choices are leg swings, arm circles, high knees, walking lunges and jumping jacks. Slow, held stretches, called static stretches, are better saved for after exercise, when your muscles are already warm.
A good warm-up usually takes five to ten minutes. Start easy, such as with a light jog, and then add more effort until you feel warm and a little out of breath. Many athletes also add a few movements that copy their sport, like easy throws, short sprints or practice swings.
When you finish, do not stop suddenly. A cool-down, such as a slow walk for a few minutes, helps your heart rate come down gradually. It is a simple habit that top athletes use, and it costs nothing.
=flexible|easy to bend
=dynamic|full of movement
=static|not moving
?What is dynamic stretching?|Stretching while moving|Holding a stretch for a minute|Resting|0
?About how long should a warm-up take?|30 seconds|5 to 10 minutes|An hour|1
?When are static stretches best?|Before you warm up|After exercise|Never|1`,

`How Muscles Grow|💪|#ffd1d1|fitness|2
Your muscles are made of thousands of tiny fibers. When you do hard exercise, such as sprinting, push-ups or lifting something heavy, those fibers get stressed and develop microscopic tears. This sounds bad, but it is a normal part of getting stronger.
After exercise, your body goes to work repairing the damage. It rebuilds the fibers and adds a little extra material so they can handle the same stress next time. Over weeks and months, this makes the muscles stronger. The important thing to remember is that muscles grow during recovery, not during the workout itself.
Your body needs raw material for the repair. That material is protein, which you find in foods like eggs, chicken, fish, beans, yogurt and milk. You also need energy from carbohydrates and plenty of water. A balanced diet works better than special supplements, which most young athletes do not need.
Sleep may be the most important part. During deep sleep, your body releases growth hormone, which helps repair tissue and build muscle. Athletes who skip sleep and rest often feel slower and get injured more easily.
For young people, the best way to build strength is with bodyweight exercises, such as push-ups, squats, planks and pull-ups, and to learn proper technique first. Lifting very heavy weights too early can cause injuries while your bones are still growing. If you want to use weights, ask a coach or another trained adult to teach you the right way.
=fiber|a thin, thread-like part
=protein|a nutrient that builds and repairs the body
=recovery|time for the body to heal and rest
?What happens to muscle fibers during hard exercise?|They develop tiny tears|They disappear|They turn to fat|0
?When do muscles actually grow?|During recovery|Only during the workout|While watching TV|0
?What helps young athletes build strength safely?|Heavy weights right away|Bodyweight exercises with good technique|Skipping meals|1`,

`The Hardest-Working Muscle|❤️|#ffd6e6|fitness|2
Right now, a muscle about the size of your fist is working without a break. It is your heart. It beats around 100,000 times every day and pumps blood to every part of your body, delivering oxygen your muscles and brain need.
When you are resting, most people have a heart rate between 60 and 100 beats per minute. Athletes often have a lower resting heart rate. That is because exercise makes the heart stronger, and a stronger heart can pump more blood with each beat. It does not have to beat as often to do the same job.
You can measure your own pulse. Place two fingers on the inside of your wrist or on the side of your neck. Count the beats for 15 seconds and multiply by four. Try it when you are sitting still, and then again right after you do jumping jacks for one minute. The difference shows how your heart responds to effort.
Like any muscle, the heart gets stronger when you challenge it regularly. Activities that raise your heart rate for a long time, such as running, swimming, biking and playing soccer, are good for it. Doctors recommend that kids get at least 60 minutes of physical activity every day.
Coaches sometimes estimate a person's maximum heart rate by subtracting their age from 220. For a 12-year-old, that estimate is about 208 beats per minute. It is only a rough guess, and real numbers vary from person to person. The important lesson is simple: a healthy heart is built by moving every day.
=pulse|the beat you can feel as the heart pumps blood
=resting|still and relaxed
=estimate|a careful guess
?About how many times does your heart beat in a day?|1,000|100,000|10 million|1
?How do you measure your pulse?|Count beats at the wrist or neck|Use a ruler|Check your weight|0
?How much activity do doctors recommend for kids each day?|10 minutes|At least 60 minutes|5 hours|1`,

`Sleep Is Part of the Team|😴|#dcd6ff|fitness|1
Many athletes think of training as the work they do in the gym or on the field. But training is only half of the story. Exercise puts stress on your body. Sleep is when your body repairs itself and gets stronger.
How much sleep do you need? Doctors say that kids ages 6 to 12 need about 9 to 12 hours each night, and teenagers ages 13 to 18 need about 8 to 10 hours. Many young people get much less than that, especially when homework, sports and screens fill up the evening.
Sleep affects how well you play. When you are tired, your reaction time is slower, your focus gets worse and it is harder to make quick decisions. Your mood can change too. In a study at Stanford University, college basketball players who slept more shot more accurately and ran faster.
There are some simple habits that help. Go to bed and wake up at about the same time every day, even on weekends. Turn off screens about an hour before bed, because the light and the activity keep your brain awake. Keep your room cool, dark and quiet.
The next time you plan your week, put sleep on the schedule like practice. If you want to run faster, throw farther or think more clearly, sleep is one of the easiest ways to get better. It is free, and it works for everyone.
=reaction time|how fast you respond to something
=habit|something you do again and again
=accurate|correct and exact
?How much sleep do kids ages 6 to 12 need?|4 to 5 hours|9 to 12 hours|15 hours|1
?What happens to your reaction time when you are tired?|It gets faster|It gets slower|Nothing|1
?Which habit helps you sleep?|Screens right up until bed|A regular bedtime|A bright room|1`,

`Build Your Own Circuit|🏋️|#d4f0c4|fitness|2
Public health experts say kids should get at least 60 minutes of physical activity each day. It does not have to be all at once, and it does not have to happen in a gym. One way to get a great workout in a small space is circuit training.
In a circuit, you do several different exercises one after another, with only a short rest in between. Because you move from one body part to the next, your muscles get a break while your heart rate stays up.
Here is a simple circuit with no equipment. Do push-ups, keeping your body in a straight line from your head to your heels. Do squats, with your chest up and your weight on your heels. Do a plank, holding your body steady on your forearms and toes. Do lunges, alternating your legs. Finish with jumping jacks.
Try 30 seconds of each exercise and then rest for 15 seconds. When you finish all five, take a minute to rest and then do the circuit again. Three rounds take about ten minutes. Always do a warm-up before you start.
Good form matters more than speed or the number of repetitions. If your form falls apart, take a break. It is normal for muscles to feel tired or sore. But if you feel sharp pain, stop and tell an adult. Write down how many push-ups or squats you can do each week. Watching the numbers rise is one of the best ways to stay motivated.
=repetition|doing an exercise one time, also called a rep
=form|the correct way to do a movement
=motivated|wanting to keep going
?How much activity should kids get each day?|At least 60 minutes|Five minutes|Three hours|0
?What is a circuit?|Several exercises in a row with short rests|A race track|A lifting machine|0
?What should you do if you feel sharp pain?|Stop and tell an adult|Push harder|Ignore it|0`,

`Jackie Robinson: Courage Under Pressure|⚾|#dbe7ff|athletes|3
Jackie Robinson was born on January 31, 1919, in Cairo, Georgia, and grew up in Pasadena, California. He was a remarkable all-around athlete. At UCLA, he became the first athlete in school history to earn varsity letters in four sports: baseball, basketball, football and track.
During World War II, Robinson served in the U.S. Army. After the war, he played baseball for the Kansas City Monarchs, one of the best teams in the Negro Leagues. At that time, major league baseball did not allow Black players. Many fans never saw the stars of the Negro Leagues play.
Branch Rickey, the president of the Brooklyn Dodgers, wanted to change that. He chose Robinson not only because he was a great player, but also because of his character. Rickey warned him that he would hear terrible insults and he would need the courage not to fight back. Robinson agreed.
On April 15, 1947, Robinson stepped onto the field for the Dodgers. He was the first Black player in the modern major leagues. He faced insults from fans and opponents, and even some of his own teammates at first. He kept playing, and he played brilliantly. He was named the first-ever Rookie of the Year in 1947 and won the National League's Most Valuable Player award in 1949.
Robinson was elected to the Baseball Hall of Fame in 1962. In 1997, Major League Baseball retired his number, 42, for every team. Each year on April 15, players across the league wear 42 to honor him. He showed that real strength is sometimes the ability to stay calm when everything tempts you to fight back.
=courage|being brave when something is hard or scary
=debut|a first public appearance
=retire a number|to stop anyone from wearing it again
?On what date did Robinson debut for the Dodgers?|April 15, 1947|July 4, 1939|October 1, 1960|0
?What did Branch Rickey ask Robinson to do?|Not to fight back against insults|Play every position|Join the Army|0
?What number was retired by all of Major League Baseball?|7|42|99|1`,

`Wilma Rudolph: The Fastest Woman in the World|🏅|#ffe0b2|athletes|3
Wilma Rudolph was born in 1940 in Tennessee. She was the 20th of 22 children, and she was born small and sickly. When she was four years old, she got polio, a disease that weakens the muscles. It left her left leg weak. Doctors told her family that she might never walk normally.
Her family refused to give up. Her mother took her on long bus trips, about fifty miles each way, to a hospital in Nashville for treatment, and her brothers and sisters took turns massaging her leg at home. Wilma wore a leg brace for years. By about age 12, she could walk without it.
She turned to sports. At Burt High School, she played basketball and ran track. A college track coach named Ed Temple noticed her talent. At just 16 years old, she made the 1956 Olympic team and helped the United States win a bronze medal in the 4 by 100 meter relay.
In 1960, at the Olympics in Rome, she became a star. Wilma won three gold medals: the 100 meters, the 200 meters and the 4 by 100 meter relay. She was the first American woman to win three gold medals at a single Olympics. People around the world called her the fastest woman in the world.
When she came home, her town of Clarksville, Tennessee, wanted to hold a parade for her. Wilma insisted that everyone, Black and white, be invited to the celebration. It became the first integrated event in the town's history. After she retired from running, she worked as a coach and teacher. Her story reminds us that a childhood obstacle does not decide where you end up.
=polio|a disease that can weaken the muscles
=integrated|open to people of all races together
=relay|a race where teammates take turns running
?What disease did Wilma Rudolph have as a child?|Polio|The flu|Asthma|0
?How many gold medals did she win in 1960?|One|Three|Five|1
?What did she insist on for her hometown celebration?|That everyone be invited|A smaller crowd|A race|0`,

`Jesse Owens: Four Golds in Berlin|🏃|#fff0b3|athletes|3
Jesse Owens was born James Cleveland Owens in 1913 in Alabama. When he was nine, his family moved to Cleveland, Ohio. The story goes that when a teacher asked his name, his accent made "J.C." sound like "Jesse," and the nickname stuck.
At East Technical High School in Cleveland, Owens became a champion sprinter and long jumper. He went on to Ohio State University. On May 25, 1935, at a track meet in Ann Arbor, Michigan, he did something almost unbelievable. In about 45 minutes, he set three world records and tied a fourth.
In 1936, the Olympic Games were held in Berlin, Germany. Adolf Hitler and the Nazi government wanted to use the Games to show that their race was superior to all others. Owens, who was Black, proved that idea false. He won four gold medals: the 100 meters, the 200 meters, the long jump and the 4 by 100 meter relay.
One of the best-known stories from those Games involves a German long jumper named Luz Long. According to Owens, he was close to failing to qualify in the long jump when Long offered some advice about his takeoff. Owens qualified and won the gold medal, and Long finished with the silver. The two became friends.
Back home, Owens still faced discrimination, and it was hard for him to find steady work. He later spent much of his life working with young people and speaking about sports. In 1976 he received the Presidential Medal of Freedom, the highest civilian honor in the United States. He died in 1980.
=superior|better than others
=discrimination|unfair treatment because of who someone is
=qualify|to earn a place in the final
?How many gold medals did Owens win in 1936?|Two|Four|Six|1
?At which Ohio university did Owens compete?|Ohio State|Xavier|Miami|0
?Who was Luz Long?|A German long jumper who became his friend|A coach|A judge|0`,

`Muhammad Ali: The Greatest|🥊|#ffd6d6|athletes|3
Muhammad Ali was born Cassius Marcellus Clay Jr. on January 17, 1942, in Louisville, Kentucky. When he was 12, someone stole his red bicycle. Angry, he told a police officer, Joe Martin, that he wanted to beat up the thief. Martin was also a boxing coach, and he told the boy to learn how to fight first. That day started a career.
Clay trained hard. At 18, he won the gold medal at the 1960 Olympics in Rome as a light heavyweight. In 1964, at the age of 22, he shocked the boxing world by beating Sonny Liston to become the heavyweight champion. Soon after, he announced that he had joined the Nation of Islam and changed his name to Muhammad Ali.
In 1967, Ali refused to be drafted into the U.S. Army, saying it went against his religious beliefs. He was stripped of his title and his boxing license, and he was not allowed to fight for more than three years during what should have been the best years of his career. In 1971, the Supreme Court overturned his conviction.
Ali came back to boxing. In 1974, he faced the powerful champion George Foreman in a fight in Kinshasa, Zaire, now the Democratic Republic of the Congo. The fight was nicknamed the Rumble in the Jungle. Ali leaned back on the ropes and let Foreman tire himself out, a strategy called rope-a-dope. Then, in the eighth round, he knocked Foreman out. He became the first boxer to win the heavyweight title three times.
Later, Ali was diagnosed with Parkinson's disease. In 1996, he was chosen to light the Olympic flame in Atlanta, and the whole world watched his shaking hands hold the torch. He died in 2016. He is remembered for his skill and his belief in standing up for what he believed in.
=draft|a rule that makes people join the army
=strategy|a plan for winning
=Parkinson's disease|an illness that makes movement hard to control
?At what age did Ali start boxing?|12|25|40|0
?What was the Rumble in the Jungle?|A fight against George Foreman in Zaire|A race|A basketball game|0
?How many times did he win the heavyweight title?|Once|Twice|Three times|2`,

`Michael Jordan: Learning From Failure|🏀|#ffd1d1|athletes|2
Michael Jordan was born in Brooklyn, New York, in 1963 and grew up in Wilmington, North Carolina. As a sophomore at Laney High School, he tried out for the varsity basketball team. He did not make it. He was placed on the junior varsity team instead. He was crushed, but he used the disappointment as fuel. He practiced all summer, and he also grew a few inches. The next year, he made the varsity team.
Jordan went to the University of North Carolina. In the 1982 national championship game, as a freshman, he hit a jump shot in the final seconds to beat Georgetown. It was the first sign of a player who wanted the last shot.
In 1984, the Chicago Bulls picked him third in the NBA draft. He quickly became one of the best scorers in the league and won ten scoring titles and five Most Valuable Player awards. He also was a top defender, and he was named Defensive Player of the Year in 1988.
With Jordan as the leader, the Bulls won six NBA championships, three in a row from 1991 to 1993 and again from 1996 to 1998. He was named the Finals MVP all six times.
Jordan's career had surprising turns. He retired in 1993, played minor league baseball for a season, and then returned to basketball. He has said that failure was a big part of his success. He missed thousands of shots in his career and lost hundreds of games. What he learned from each miss made him better.
=varsity|the top team at a school
=fuel|something that gives you energy to keep going
=defender|a player who stops the other team from scoring
?Where did Jordan play before the NBA?|North Carolina|Kentucky|Duke|0
?How many championships did the Bulls win with Jordan?|Three|Six|Ten|1
?What happened to Jordan as a sophomore in high school?|He did not make varsity|He won MVP|He moved to Chicago|0`,

`Roberto Clemente: More Than a Ballplayer|⚾|#e5f5d6|athletes|3
Roberto Clemente was born in 1934 in Carolina, Puerto Rico, the youngest of seven children. He loved baseball from the time he was a boy, and he played in Puerto Rico before the Pittsburgh Pirates brought him to the major leagues in 1955.
Clemente played for the Pirates for 18 seasons. He had a strong arm, and he was known for amazing throws from right field. He won 12 Gold Glove awards for his fielding. He was also a great hitter who won four batting titles.
Clemente also dealt with hard moments. As a Spanish speaker in the United States, he sometimes was misquoted by reporters, and he faced unfair treatment. He insisted on being treated with respect. In the 1971 World Series, against the Baltimore Orioles, he played brilliantly and was named the Series Most Valuable Player as the Pirates won.
On September 30, 1972, Clemente hit a double for his 3,000th career hit. It was the last regular-season hit of his career. He is one of a small group of players to reach that mark.
Clemente also gave his time to others. He ran baseball clinics for kids in Puerto Rico and gave money to families in need. When a huge earthquake hit Nicaragua in December 1972, he helped to organize relief flights. On December 31, 1972, the plane carrying supplies crashed into the sea off Puerto Rico. He was 38 years old.
The Hall of Fame waived its usual waiting period, and he was inducted in 1973, the first Latin American player to be elected. Every year, Major League Baseball gives the Roberto Clemente Award to the player who best combines great play with helping the community.
=discrimination|unfair treatment because of who someone is
=relief supplies|food and help sent to people in trouble
=induct|to officially welcome into a group or hall of fame
?How many Gold Gloves did Clemente win?|12|3|30|0
?What was his 3,000th career hit?|A double on September 30, 1972|A home run|A bunt|0
?Why was he on the plane in December 1972?|To deliver relief supplies after an earthquake|To play a game|To go on vacation|0`,

`Simone Biles: Pushing the Sport Forward|🤸|#e8d6ff|athletes|2
Simone Biles was born on March 14, 1997, in Columbus, Ohio, and grew up in Texas. She began gymnastics at age six, when she went on a daycare field trip to a gym. Her natural talent was clear, and she began to train seriously.
Biles stands under five feet tall, but she is incredibly strong and powerful. She won the all-around world championship in 2013, and she won many more world titles after that. Over her career she has won more than 30 world championship medals, more than any other gymnast in history.
At the 2016 Olympics in Rio de Janeiro, she won four gold medals, in the team event, the all-around, the vault and the floor exercise, and she also won a bronze on the balance beam. Several skills in gymnastics are named for her because she was the first to perform them in competition.
At the 2020 Olympics in Tokyo, held in 2021, Biles withdrew from several events after she lost her sense of where she was in the air, an issue gymnasts call the twisties. In gymnastics, losing track of your body in the air is very dangerous. She chose to protect her safety, and she spoke publicly about mental health. She came back to win a bronze medal on the balance beam.
At the Paris Olympics in 2024, she returned with three more gold medals, in the team event, the all-around and the vault, along with a silver on the floor. Biles has said that asking for help and caring for your mind are signs of strength. That message may matter even more than her medals.
=twisties|losing track of where you are in the air
=withdraw|to step out of a competition
=mental health|how you feel and think
?In what city was Simone Biles born?|Columbus, Ohio|Houston|Chicago|0
?What are the twisties?|Losing your sense of where you are in the air|A gymnastics move|A medal|0
?What did Biles speak about publicly?|Mental health|Her favorite food|A new rule|0`,

`Lionel Messi: Overcoming the Odds|⚽|#d6eaff|athletes|2
Lionel Messi was born on June 24, 1987, in Rosario, Argentina. He started playing soccer at the age of five, with a local club called Newell's Old Boys. He was small, but he was fast and amazingly skilled with the ball.
When he was ten, doctors learned that Messi had a growth hormone deficiency, which meant his body was not growing normally. The treatment was expensive, and his family could not afford it. A famous Argentine club was interested in him but could not pay for it. Then FC Barcelona in Spain offered to pay for his treatment if he moved there. The story goes that the first agreement was written on a napkin. Messi moved to Spain at 13.
He debuted for Barcelona's first team at age 17. He went on to become one of the best players in the history of the sport. He won the Ballon d'Or, the award for the best player in the world, a record eight times. Despite not being tall, at about 5 feet 7 inches, he is known for dribbling past defenders with the ball seeming to stick to his feet.
For years, one prize escaped him. In 2022, at the World Cup in Qatar, Argentina and France played one of the most exciting finals ever. Messi scored twice, and the game ended 3-3 after extra time. Argentina won the penalty shootout and became world champions. Messi was named the best player of the tournament.
Messi joined the American team Inter Miami in 2023. His story shows that a young player can overcome real obstacles with hard work and some help from others.
=deficiency|not having enough of something
=treatment|medicine or care for an illness
=penalty shootout|a tiebreaker made of penalty kicks
?In which country was Messi born?|Argentina|Spain|Brazil|0
?What health issue did Messi have at age ten?|A growth hormone deficiency|A broken leg|A cold|0
?What did Argentina win in 2022?|The World Cup|The Olympics|The Super Bowl|0`,

`Joe Burrow: From Athens to Cincinnati|🏈|#ffe8c2|athletes|2
Joe Burrow was born on December 10, 1996, in Ames, Iowa, and grew up in Athens, Ohio, in the southeast corner of the state. His father was a football coach at Ohio University, and Joe grew up around the game. He was a star quarterback at Athens High School.
After high school, Burrow went to Ohio State University, where he was a backup quarterback and did not get as many chances as he hoped. He did not give up. In 2018, he transferred to Louisiana State University, known as LSU, to play more.
In 2019, everything came together. Burrow threw 60 touchdown passes, the most in one season in major college football at that time, and led LSU to an undefeated season and a national championship. He won the Heisman Trophy, the award for the best player in college football.
In 2020, the Cincinnati Bengals chose him with the very first pick in the NFL draft. As a rookie, he played well, but in November he suffered a serious knee injury that ended his season. Rehabilitation is a long and difficult process, with months of exercises and slow progress. He worked at it every day.
In 2021, he returned for his second season and led the Bengals to the AFC championship. The team played in Super Bowl LVI, where it lost a close game to the Los Angeles Rams, 23 to 20. Burrow is known for staying calm in tense moments. His story shows that setbacks, like sitting on the bench or a bad injury, can lead to great things when you keep working.
=quarterback|the football player who leads the offense
=rehabilitation|exercise and care to heal after an injury
=transfer|to move to a different school
?What trophy did Burrow win at LSU?|Heisman Trophy|Super Bowl MVP|Gold Glove|0
?Which team picked him first in the 2020 draft?|Cincinnati Bengals|Cleveland Browns|Dallas Cowboys|0
?What helped him recover from his injury?|Daily rehabilitation work|Taking a year off|Switching sports|0`,
`Why Cities Began by Rivers|🌊|#c9eaff|social|2
More than ten thousand years ago, people began to farm instead of only hunting and gathering food. Farming meant they could stay in one place. The best places to farm were beside rivers, where there was plenty of water and the soil was rich.
Several of the world's earliest civilizations grew up along rivers. Mesopotamia, a name that means the land between the rivers, was between the Tigris and Euphrates in what is now Iraq. Ancient Egypt grew along the Nile. Other early civilizations grew beside the Indus River in South Asia and the Yellow River in China.
Rivers also brought problems and solutions. Every year, the Nile flooded and then drew back, leaving a layer of dark, fertile soil called silt. Egyptians built their calendar around the flood. In Mesopotamia, floods were harder to predict, so people dug canals to carry water to their fields. This system is called irrigation.
When farmers grew more food than they needed, not everyone had to farm. Some people became builders, priests, soldiers, traders or craftspeople. Cities grew, and cities needed leaders, laws and ways to keep records. Around 3000 BC, the Sumerians of Mesopotamia developed cuneiform, a kind of writing made by pressing wedge-shaped marks into clay. Egyptians wrote with hieroglyphs.
Farming, cities, laws and writing are ideas that still shape our lives. Even today, most of the world's biggest cities sit beside rivers or the sea.
=civilization|a large, organized society with cities, laws and writing
=irrigation|bringing water to crops through canals or pipes
=surplus|more of something than you need
?What does Mesopotamia mean?|The land between the rivers|The great desert|The place of kings|0
?What did the Nile leave behind after its yearly flood?|Rich, dark soil|Salt|Sand dunes|0
?What was cuneiform?|A type of writing pressed into clay|A farming tool|A type of boat|0`,

`Athens and Sparta|🏛️|#ffe3c2|social|3
Ancient Greece was not one country. It was made up of many independent city-states, each with its own government, laws and army. Two of the most famous were Athens and Sparta. They were only a few days' walk apart, but they were very different.
Athens is known as the birthplace of democracy, a word that means rule by the people. Around 508 BC, a leader named Cleisthenes made reforms that gave Athenian citizens the right to vote on laws in a public assembly. But the word citizen meant only free men who were born in Athens. Women, enslaved people and foreigners could not vote.
Athens was also a center of art, learning and ideas. Thinkers such as Socrates, Plato and Aristotle asked big questions about how people should live and how the world works. The Parthenon, a great temple, was built on a hill called the Acropolis in the 400s BC. It still stands today.
Sparta was a military society. Boys left home at about the age of seven to begin a harsh training program called the agoge. Spartan soldiers were famous across Greece. Spartan women had more freedom than women in Athens. They could own property and were expected to stay strong and healthy.
The two city-states joined forces to defeat the Persian Empire in the early 400s BC, including at the Battle of Marathon, which gave the marathon race its name. Later, Athens and Sparta fought each other in the long Peloponnesian War, and Sparta won. Even so, they met in peace at the Olympic Games.
=democracy|a system where the people vote on decisions
=citizen|a member of a country or city who has rights and duties
=philosophy|the study of big questions about life and knowledge
?What does democracy mean?|Rule by the people|Rule by one king|Rule by soldiers|0
?Who could vote in ancient Athens?|Free men who were citizens|Everyone|Only soldiers|0
?What was the agoge?|Spartan training for boys|An Athenian temple|A Greek ship|0`,

`Reading a Map Like a Pro|🗺️|#d4f0c4|social|2
Every good map has a few tools to help you. The title tells you what the map shows. A compass rose shows the directions north, east, south and west. The scale tells you how distance on the map matches real distance, such as one inch for every 100 miles. The legend, or key, explains the symbols and colors.
Mapmakers draw imaginary lines on the globe to help people find places. Lines of latitude run east and west, parallel to the equator. The equator is at 0 degrees, and latitude tells you how far north or south of it a place is. Lines of longitude run from the North Pole to the South Pole. The prime meridian, at 0 degrees longitude, passes through Greenwich, England.
These lines divide the world into hemispheres. The equator splits the planet into the Northern and Southern Hemispheres. The prime meridian and the line opposite it split it into the Eastern and Western Hemispheres. Most of the United States is in the Northern and Western Hemispheres.
There are seven continents: Africa, Antarctica, Asia, Australia, Europe, North America and South America. Some scientists group Australia and nearby islands together as Oceania. There are five oceans: the Pacific, Atlantic, Indian, Southern and Arctic. The Pacific is the largest.
Maps come in different types. A physical map shows landforms such as mountains and rivers. A political map shows borders, countries and cities. A thematic map shows one topic, like rainfall or population. Try finding Cincinnati. It sits at about 39 degrees north latitude and 84 degrees west longitude.
=latitude|distance north or south of the equator
=hemisphere|one half of the Earth
=legend|the part of a map that explains the symbols
?Which line of longitude is called the prime meridian?|0 degrees|90 degrees|180 degrees|0
?What does a map scale show?|How map distance matches real distance|The title|Directions|0
?How many oceans are there?|Three|Five|Seven|1`,

`The Silk Road|🐪|#ffe0b2|social|3
The Silk Road was not one road. It was a network of trade routes that stretched for more than 4,000 miles, linking China with lands around the Mediterranean Sea. The name was invented in the 1800s by a German geographer, because silk was one of the most valuable goods that traveled along it.
China's Han dynasty helped open the routes in the 100s BC. For a long time, the Chinese kept the secret of how silk was made. Rich people in faraway places paid huge prices for the shiny cloth.
Very few merchants traveled the whole way. Goods usually passed from trader to trader along the route, with each person making a profit. Caravans of camels carried heavy loads across deserts and mountains, and oasis towns gave travelers food, water and rest. Besides silk, traders carried spices, tea, jade, glass, horses, paper and gold.
Ideas traveled along the Silk Road too. Buddhism spread from India into China. The technology of making paper moved west. Some historians think diseases also spread along trade routes. Cities along the road grew rich and became places where many cultures, languages and religions met.
In the 1200s, a merchant from Venice named Marco Polo traveled to China and wrote a famous book about what he saw. Later, ships that sailed across the oceans became a cheaper way to move goods, and the overland routes faded. But the Silk Road shows an important idea in history: when people trade goods, they also share ideas.
=caravan|a group of traders traveling together
=dynasty|a family that rules a country for many years
=merchant|a person who buys and sells goods
?What was the Silk Road?|A network of trade routes|One paved highway|A river|0
?Which animals often carried goods across the desert?|Camels|Elephants|Penguins|0
?Besides goods, what else traveled along the Silk Road?|Ideas|Nothing else|Only soldiers|0`,

`Three Branches, One Government|🏛️|#dbe7ff|social|2
After the American Revolution, the leaders of the new country wanted to avoid a government where one person held all the power. In 1787, delegates met in Philadelphia and wrote the Constitution, the plan for the government of the United States.
The Constitution divides the government into three branches. The legislative branch, which is Congress, makes the laws. Congress has two parts: the Senate, with 100 members, and the House of Representatives, with 435. The executive branch, led by the President, carries out the laws. The judicial branch, which includes the Supreme Court and other federal courts, decides what the laws mean.
Think of a sport. One group writes the rulebook, officials enforce the rules during the game, and a review panel settles disputes. Each has a different job, and no one group controls everything.
To keep the branches balanced, the Constitution creates checks and balances. The President can veto, or reject, a bill, but Congress can override the veto with a two-thirds vote in both the House and the Senate. The Senate must approve the President's choices for judges. And the courts can decide that a law goes against the Constitution. This power, called judicial review, was established in a famous 1803 case, Marbury v. Madison.
Citizens have a part to play too. Americans can vote at age 18, serve on juries, speak out and contact their representatives. A government with limits only works when people take part.
=constitution|the written plan for how a government works
=legislative|having to do with making laws
=veto|to reject a bill so it cannot become a law
?How many branches of government does the Constitution create?|Two|Three|Five|1
?Which branch makes the laws?|Legislative|Executive|Judicial|0
?What is a veto?|Rejecting a bill|A kind of vote in court|A tax|0`,

`Finding the Main Idea|🎯|#ffe8cc|english|1
When you read, one of the most important skills is finding the main idea. The topic is what the passage is about, usually in a word or two, such as soccer. The main idea is the most important point the author makes about that topic, such as: soccer is easy to start because all you need is a ball.
Here are three ways to find it. First, read the title and the first and last sentences, because authors often put the main idea there. Second, ask yourself, What is the author mostly telling me? Third, notice words and ideas that show up again and again.
Supporting details are the facts, examples and reasons that prove the main idea. Read this paragraph. Swimming is great exercise. It works almost every muscle in your body. It is gentle on your joints. It also builds endurance, because you have to control your breathing. The main idea is the first sentence. Every other sentence is a supporting detail.
Sometimes the main idea is not written in one sentence. It might be in the middle or the end of a paragraph, or the author might want you to figure it out from the details. When an idea is not stated directly, it is called implied, and you infer it by putting the clues together.
A good way to check your understanding is to write a summary. A summary is two or three sentences in your own words that include the main idea and the most important details. Leave out opinions and small details. If you can summarize a passage, you understand it.
=topic|what a passage is about
=infer|to figure something out from clues
=summary|a short retelling of the main ideas
?What is the difference between a topic and a main idea?|The main idea is the author's key point about the topic|They are the same thing|The topic is longer|0
?What are supporting details?|Facts and examples that back up the main idea|Opinions only|The title|0
?What does a summary include?|The main idea and key details in your own words|Every detail|Only the title|0`,

`Be a Word Detective|🔍|#e5dbff|english|2
You are reading and you hit a word you do not know. Do not skip it. You can often figure it out from the context, which means the words and sentences around it. These hints are called context clues.
There are four kinds to look for. A definition clue tells you the meaning directly: A marathon, a race of 26.2 miles, is a test of endurance. A synonym clue gives another word with a similar meaning: The pitcher was dominant, or unbeatable. A contrast clue uses opposites: Unlike his sluggish teammates, Mia was full of energy. An example clue gives examples: Aquatic sports, such as swimming and diving, take place in water.
When you find a new word, follow these steps. Reread the sentence. Look at the sentences before and after it. Make a guess about the meaning. Try your guess in place of the word and see if the sentence still makes sense. If you are still unsure, check a dictionary.
Try one. The coach was frugal. She never spent money on anything that was not necessary, even at the snack bar. What does frugal mean? The second sentence is a clue. Frugal means careful about spending money.
Word parts can help too. Keep a word journal where you write each new word, the sentence you found it in, and its meaning in your own words. If you learn just three new words a week, you will know more than 150 new words by the end of the year.
=context|the words around a word that help show its meaning
=frugal|careful about spending money
=dominant|stronger or more powerful than the others
?What are context clues?|Hints in the words around an unknown word|A kind of dictionary|Punctuation marks|0
?In the example, what does frugal mean?|Careful with money|Very tall|Friendly|0
?Which of these is a step for working out a new word?|Guess, then test your guess in the sentence|Skip it|Always ask a friend|0`,

`Parts of Speech in the Locker Room|👕|#d4f0c4|english|2
Every word in a sentence has a job. The parts of speech are the names for those jobs, and sports are full of examples.
A noun names a person, place, thing or idea: coach, stadium, trophy, courage. A verb shows action or being: sprint, throw, is, seems. An adjective describes a noun: tall, sweaty, powerful. An adverb describes a verb, an adjective or another adverb, and often tells how, when or where: quickly, very, outside.
A preposition shows how a noun is related to another word, usually place or time: in, on, under, across, before. In the sentence The ball rolled under the bench, the preposition is under, and the phrase under the bench tells where. A conjunction joins words or ideas: and, but, or, because.
Every complete sentence has two main parts. The subject is who or what the sentence is about, and the predicate tells what the subject does or is. Try this: The tired runners finally crossed the finish line. The subject is the tired runners. The predicate is finally crossed the finish line. Tired is an adjective, runners is a noun, finally is an adverb, crossed is a verb and line is a noun.
A good way to practice is to take a sentence from your reading and label each word. You can also test your writing by adding details. Start with The team won. Then add an adjective, an adverb and a prepositional phrase: The determined team easily won in the final minute. Same idea, much more picture.
=noun|a word that names a person, place, thing or idea
=adverb|a word that tells how, when or where something happens
=predicate|the part of a sentence that tells what the subject does
?Which word is a verb in: The coach blew the whistle?|blew|coach|whistle|0
?What does an adjective do?|Describes a noun|Shows action|Joins two ideas|0
?In The ball rolled under the bench, what is the preposition?|under|rolled|bench|0`,

`Sports Talk: Idioms and Figures of Speech|🗣️|#ffd1d1|english|2
Have you ever been told that something came out of left field or that someone dropped the ball? These are idioms, phrases whose meanings are different from the meanings of the words. English has thousands of idioms, and many come from sports.
Out of left field means unexpected, like a baseball thrown from a spot where the batter did not expect it. A ballpark figure is a rough estimate. To drop the ball is to make a mistake or fail to do your job. A slam dunk is something that is certain to succeed. A full-court press is an all-out effort, which comes from basketball. To throw in the towel is to give up, which comes from boxing. And if someone says the ball is in your court, it is your turn to act, as in tennis.
Writers also use figurative language to make descriptions more vivid. A simile compares two things using like or as: She runs like the wind. A metaphor says one thing is another: His serve was a rocket. Hyperbole is a big exaggeration, such as I have told you a million times. Personification gives human qualities to something that is not human: The wind pushed the runners back.
When you meet an idiom, do not take it word for word. Ask yourself whether the literal meaning makes sense. If it does not, think about what the phrase might mean from the context.
Idioms can be tricky for people learning English, so be kind and explain them. Try writing a few sentences of your own using a sports idiom. If you can use it correctly, you really understand it.
=idiom|a phrase whose meaning is different from its separate words
=simile|a comparison that uses like or as
=metaphor|a comparison that says one thing is another
?What does it mean to drop the ball?|Make a mistake|Win easily|Start a game|0
?Which is a simile?|She runs like the wind|His serve was a rocket|The wind pushed the runners|0
?What does a ballpark figure mean?|A rough estimate|A famous player|A ticket price|0`,

`Roots, Prefixes and Suffixes|🌱|#d6f5e3|english|2
Many long words are built from smaller parts, and if you know the parts, you can figure out the word. The main part is the root. A prefix goes in front of the root and a suffix goes at the end.
Take the word photograph. It comes from two Greek roots: photo, which means light, and graph, which means write. A photograph is light writing, a picture drawn by light. Now look at biography. Bio means life, and graph means write, so a biography is a written story of someone's life. An autograph is a person writing their own name, because auto means self.
Here are more roots. Tele means far, and scope means to look at, so a telescope lets you see things far away. A telephoto lens makes faraway subjects look close. Aqua means water, so aquatic sports take place in the water. Even the word athlete comes from a Greek word for a contestant who competed for a prize.
Prefixes change a word's meaning. Un means not, as in unfair. Re means again, as in replay. Pre means before, as in preseason. Dis means the opposite, as in disagree. Suffixes also change meaning or the way a word works. Ful means full of, as in graceful. Less means without, as in fearless. An able ending means can be done, as in reachable. And ist means someone who does something, as in a pianist.
When you see a long word, try breaking it into parts. Cover the prefix and suffix, find the root and then put the meaning back together. It is like decoding a secret message.
=root|the main part of a word
=prefix|a word part added to the beginning
=suffix|a word part added to the end
?What does the root photo mean?|Light|Water|Far|0
?What does a biography tell about?|Someone's life|A place|A sport|0
?What does the prefix re mean?|Again|Not|Before|0`,
`Drake Maye: A Quarterback From a Family of Athletes|🏈|#dbe7ff|athletes|2
Drake Maye was born on August 30, 2002, in Charlotte, North Carolina, into a family of athletes. His father, Mark, played quarterback at the University of North Carolina. His older brother Luke played basketball there and hit a game-winning shot in the 2017 NCAA Tournament that sent the Tar Heels to the Final Four.
Maye played football and basketball at Myers Park High School in Charlotte, and he was one of the top quarterback recruits in the country. He chose to play at North Carolina, the school his family loved. After sitting behind another quarterback for a year, he got his chance in 2022.
That season, Maye lit up the college game. He threw for more than 4,000 yards and 38 touchdowns and was named the Atlantic Coast Conference Player of the Year. At six feet four inches, he could throw accurately and also run when a play broke down.
In the 2024 NFL draft, the New England Patriots chose Maye with the third overall pick. Wearing a Patriots uniform means living in the shadow of Tom Brady, who led the team to six Super Bowl wins. It is a lot of pressure for a young quarterback. Maye took over as the starter during his rookie season, playing for a team that was still rebuilding.
Maye is still early in his career, so his story is still being written. It already shows some lessons: family can shape your path, waiting your turn takes patience, and it helps to keep working when the pressure is on.
=redshirt|to sit out a season of college play to save a year of eligibility
=recruit|a high school player a college wants on its team
=rookie|a player in the first year of a pro career
?Which college did Drake Maye attend?|North Carolina|Ohio State|LSU|0
?Which team picked him third overall in 2024?|New England Patriots|Cincinnati Bengals|Seattle Seahawks|0
?Which two sports did he play in high school?|Football and basketball|Baseball and soccer|Golf and tennis|0`,

`Jaxon Smith-Njigba: Waiting for His Turn|🏈|#fff0b3|athletes|2
Jaxon Smith-Njigba, whose last name is pronounced in-JIG-buh, grew up in Rockwall, Texas, near Dallas. He was a standout wide receiver at Rockwall High School, and he became one of the most sought-after recruits in the country. He chose to leave Texas and play for the Ohio State Buckeyes in Columbus, Ohio.
At Ohio State, he had to wait. The team already had two stars at wide receiver, Garrett Wilson and Chris Olave, who both became first-round NFL picks. Smith-Njigba used his time to study and practice. He became known for running precise routes, which means cutting and turning at exactly the right spot to get open.
In 2021, he got his big chance. He caught 95 passes for 1,606 yards, which was more receiving yards in one season than any Ohio State player had ever had. In the Rose Bowl on New Year's Day 2022, he caught 15 passes for 347 yards, setting a Rose Bowl record.
The next season did not go as planned. A hamstring injury kept him out of most of the games in 2022. Rehabilitating an injury is hard work, and it can feel discouraging. Even so, NFL teams still saw his talent. The Seattle Seahawks chose him in the first round of the 2023 draft.
In Seattle, Smith-Njigba worked to earn a bigger role, and he has grown into one of the league's most productive receivers. His story shows that being patient and prepared can pay off. When the opportunity arrives, you want to be ready.
=route|the path a receiver runs to get open for a pass
=hamstring|a large muscle at the back of the thigh
=record|the best result anyone has ever had
?At which Ohio college did he play?|Ohio State|Cincinnati|Ohio University|0
?How many passes did he catch in the 2022 Rose Bowl?|15|5|30|0
?What injury slowed him down in 2022?|A hamstring injury|A broken wrist|A concussion|0`,

`Justin Jefferson: The Catch Heard Around the League|🏈|#e8d6ff|athletes|2
Justin Jefferson was born on June 16, 1999, in St. Rose, Louisiana, near New Orleans. He played at Destrehan High School. His older brother Jordan was a quarterback at Louisiana State University, known as LSU, and Justin followed him there.
At LSU, Jefferson was a solid receiver for two seasons. His big moment came in 2019, when LSU put together one of the greatest offenses in college football history. Quarterback Joe Burrow, the same Joe Burrow who now plays for the Cincinnati Bengals, threw to a group of receivers that included Jefferson and Ja'Marr Chase. Jefferson caught 111 passes for 1,540 yards and 18 touchdowns, and LSU won the national championship.
In the 2020 NFL draft, the Minnesota Vikings chose Jefferson with the 22nd pick. Some people thought teams had passed on him too many times. They were wrong. As a rookie, Jefferson caught passes for 1,400 yards, one of the best rookie seasons ever for a receiver.
In 2022, Jefferson led the league with 128 catches and 1,809 yards and was named the NFL's Offensive Player of the Year. That season he also made one of the most famous catches in recent years. Against the Buffalo Bills, on fourth down with 18 yards to go, he stretched out and pulled in the ball with one hand while a defender was all over him.
Jefferson is also known for a celebration dance called the Griddy. Fans love his joy, but his teammates and coaches talk about his work ethic. He studies defenses and practices his routes again and again. His story shows that talent plus preparation makes a star.
=offense|the team that has the ball and is trying to score
=draft|the yearly event where pro teams choose new players
=work ethic|how hard and how consistently someone works
?Which college did Jefferson play for?|LSU|Ohio State|Texas|0
?Which NFL team drafted him?|Minnesota Vikings|Seattle Seahawks|New England Patriots|0
?What award did he win in 2022?|Offensive Player of the Year|Rookie of the Year|MVP|0`,

`Mookie Betts: Small Size, Big Game|⚾|#d4f0c4|athletes|2
Markus Lynn Betts was born on October 7, 1992, in Nashville, Tennessee. Everyone calls him Mookie. He grew up playing baseball and basketball, and he was also a talented bowler. He has bowled perfect games, scoring a 300 with twelve strikes in a row.
Betts went to John Overton High School in Nashville. At about five feet nine inches, he was smaller than many top players, and some teams passed on him. In the 2011 draft, the Boston Red Sox chose him in the fifth round, which is not early. He began as a second baseman, but the team moved him to the outfield, where his speed and quick reactions were a perfect fit. He made his major league debut in 2014.
In 2018, Betts had one of the best seasons in baseball. He won the American League batting title and the Most Valuable Player award, and the Red Sox won the World Series. He also became known for his glove. He has won multiple Gold Glove awards for fielding.
In 2020, Boston traded him to the Los Angeles Dodgers, and he signed a 12-year contract worth $365 million. The same year, he helped the Dodgers win the World Series. In 2024, the Dodgers asked him to learn a brand-new position, shortstop, because the team needed him there. He worked at it, and the Dodgers won the World Series again that year.
Betts has said that he never wants to stop learning and getting better. His story shows that size does not decide how good a player can be. Speed, smarts and a willingness to try new things matter, too.
=outfield|the part of a baseball field beyond the infield
=Gold Glove|an award for the best fielder at each position
=position|the spot a player covers on the field
?Which team drafted Betts?|Boston Red Sox|Los Angeles Dodgers|Nashville Stars|0
?What other sport is Betts very good at?|Bowling|Hockey|Golf|0
?Which new position did he learn in 2024?|Shortstop|Catcher|Pitcher|0`,

`Fernando Tatis Jr.: Baseball in His Blood|⚾|#ffe0b2|athletes|3
Fernando Tatis Jr. was born on January 2, 1999, in San Pedro de Macorís, a city in the Dominican Republic that has produced many major league players. His father, Fernando Tatis Sr., was a big leaguer too. In 1999, the year Jr. was born, his dad did something no one has done before or since. On April 23, he hit two grand slams in a single inning.
Junior grew up around baseball. At 16, he signed with the Chicago White Sox. A year later, in 2016, the White Sox traded him to the San Diego Padres in a deal for a veteran pitcher. San Diego saw a rare combination of power, speed and a strong arm.
He reached the majors in 2019, when he was only 20 years old. He quickly became one of the most exciting players in the game. Tatis is a shortstop who can hit home runs, steal bases and make flashy plays in the field. In 2021, he hit 42 home runs, and the Padres signed him to a 14-year contract worth $340 million.
Then he met setbacks. Injuries to his shoulder and then his wrist kept him off the field. In 2022, Major League Baseball suspended him for 80 games for breaking its rules about banned drugs. He apologized and said he had made a mistake. Taking responsibility for a mistake is not easy, and it is part of how people grow up.
When he returned in 2023, the Padres moved him to right field. He won a Gold Glove for his play there. Tatis's story is one of talent, mistakes and a comeback, and it shows how to keep going after hard times.
=grand slam|a home run with the bases loaded, worth four runs
=suspend|to officially stop someone from playing for a time
=responsibility|owning what you did, including mistakes
?What did Tatis Sr. do on April 23, 1999?|Hit two grand slams in one inning|Pitched a perfect game|Won an MVP|0
?Which team does Tatis Jr. play for?|San Diego Padres|Boston Red Sox|Chicago White Sox|0
?What did he do after his suspension?|Returned and won a Gold Glove|Retired|Became a coach|0`,

`Jayson Tatum: Following Kobe's Example|🏀|#dbf0d0|athletes|2
Jayson Tatum was born on March 3, 1998, in St. Louis, Missouri. His father, Justin, played college basketball at Saint Louis University, so Jayson grew up around the game. His favorite player was Kobe Bryant. Tatum studied how Bryant moved, shot and worked, and he tried to copy it.
At Chaminade College Preparatory School in St. Louis, Tatum was one of the best players in the country, and he was chosen to play in the McDonald's All-American Game. He played one season at Duke University, and then he entered the NBA draft.
In 2017, the Boston Celtics chose Tatum with the third pick. As a rookie, he helped the Celtics reach the Eastern Conference Finals, only one step from the NBA Finals. He kept improving every year. By 2022, he had carried Boston all the way to the NBA Finals, but the Celtics lost to the Golden State Warriors.
Tatum did not let it stop him. In 2023, he scored 55 points in the NBA All-Star Game, a record, and won the game's Most Valuable Player award. In 2024, he and the Celtics finally won the NBA championship, defeating the Dallas Mavericks. That summer he also won an Olympic gold medal with the United States team in Paris.
In the 2025 playoffs, Tatum tore his Achilles tendon, a serious injury that meant a long recovery. Tatum is known for his scoring, his smooth shot and his fade-away jump shot, and also for his calm leadership. His journey shows how losing in the Finals can fuel a championship season.
=draft pick|a player chosen by a team in the draft
=Achilles tendon|the strong cord that connects the calf muscle to the heel
=conference|a group of teams that play each other
?Who was Tatum's favorite player growing up?|Kobe Bryant|Michael Jordan|Larry Bird|0
?Which team did he win a championship with?|Boston Celtics|Dallas Mavericks|Golden State Warriors|0
?What happened to him in the 2025 playoffs?|He tore his Achilles tendon|He retired|He won MVP|0`,

`Damian Lillard: The Man From Oakland|🏀|#ffd6d6|athletes|2
Damian Lillard, known as Dame, was born on July 15, 1990, in Oakland, California. He has said that growing up in Oakland shaped his toughness. Few big colleges recruited him, though. He chose Weber State, a small school in Ogden, Utah, where he could play right away.
At Weber State, Lillard kept improving. In his senior year, he averaged about 24.5 points per game, one of the highest averages in the country. Scouts took notice, and in the 2012 NBA draft, the Portland Trail Blazers chose him with the sixth pick. In 2013, he was named Rookie of the Year.
Lillard became known for shooting from far away and for making big shots at the end of games. Fans called it Dame Time. On April 23, 2019, in the playoffs, he hit a shot from about 37 feet away at the buzzer to beat the Oklahoma City Thunder and win the series, and he waved goodbye to the crowd as the ball went in. In February 2023, he scored 71 points in a single game.
In 2021, he won an Olympic gold medal with the United States team in Tokyo. In 2023, he was traded to the Milwaukee Bucks, hoping to win a championship. In 2025, he tore his Achilles tendon, a serious injury that meant a long recovery.
Off the court, Lillard is a rapper who performs under the name Dame D.O.L.L.A. His story is for anyone who was overlooked. He did not go to a famous school, but he outworked people and became one of the best guards of his generation.
=overlooked|not noticed or not chosen
=buzzer beater|a shot made just as the clock runs out
=guard|a basketball player who handles the ball and shoots from outside
?Where did Lillard go to college?|Weber State|Duke|Kentucky|0
?What was the distance of his 2019 buzzer beater?|About 37 feet|About 5 feet|About 90 feet|0
?How many points did he score in the 2023 game against Houston?|71|35|100|0`,

`Ancient Egypt: Gift of the Nile|🔺|#ffe8b8|social|2
The Greek historian Herodotus called Egypt the gift of the Nile. Almost all Egyptians lived along the river, in a thin green strip surrounded by desert. The desert protected Egypt from invaders, and the Nile gave it water, food and a highway for boats. Around 3100 BC, Upper and Lower Egypt were joined into one kingdom.
The ruler of Egypt was the pharaoh, who was believed to be a god in human form. Egyptians believed in an afterlife, and they built great tombs for their pharaohs. The Great Pyramid of Giza was built for the pharaoh Khufu about 4,500 years ago. It was almost 480 feet tall when it was finished, and it was the tallest human-made structure in the world for thousands of years. Historians now believe it was built by thousands of skilled, paid workers, not by slaves.
To protect the body for the afterlife, Egyptians used mummification. It took about 70 days. Workers removed the organs, dried the body with a salt called natron and wrapped it in linen. The organs were stored in special jars.
Egyptians wrote in hieroglyphs, a system of picture symbols. Scribes wrote on papyrus, a paper-like material made from reeds. For many centuries, nobody could read hieroglyphs. Then, in 1799, French soldiers found the Rosetta Stone, which had the same message in hieroglyphs, a second Egyptian script and Greek. A scholar named Jean-François Champollion used the Greek to crack the code in 1822.
Egyptian society had layers. At the top was the pharaoh, then officials and priests, then scribes and craftspeople, and at the bottom were the farmers, who were the majority. Egyptians also made a 365-day calendar and used geometry to measure farmland after floods.
=pharaoh|the king of ancient Egypt
=mummification|preserving a body so it lasts a very long time
=scribe|a person trained to read and write
?What did Herodotus call Egypt?|The gift of the Nile|The land of sand|The great empire|0
?What did the Rosetta Stone help scholars do?|Read hieroglyphs|Build pyramids|Measure the Nile|0
?Who was the pharaoh?|The ruler of Egypt|A priest|A farmer|0`,

`Rome: From Republic to Empire|🏛️|#ffd8c2|social|3
According to legend, Rome was founded in 753 BC by Romulus, who named the city after himself. For its first two and a half centuries, Rome was ruled by kings. In 509 BC, the Romans threw out their last king and created a republic. The word comes from the Latin res publica, which means a public matter.
In the Roman Republic, citizens elected officials called consuls to lead for one year, and a council called the Senate gave advice. At first, only wealthy families called patricians held power. Ordinary citizens, known as plebeians, demanded a voice. They gained their own officials, called tribunes, and around 451 BC, the laws were written down on the Twelve Tables so that everyone could see them.
Rome conquered Italy and then the lands around the Mediterranean Sea. It fought three wars against the city of Carthage, including one in which the general Hannibal marched elephants across the Alps. Rome also built roads, tens of thousands of miles of them, which helped move soldiers, goods and messages. This is where we get the saying, All roads lead to Rome.
By the first century BC, powerful generals were fighting each other. One of them, Julius Caesar, became a ruler for life. In 44 BC, a group of senators who feared he wanted to be king assassinated him on the Ides of March. After years of civil war, his adopted heir Octavian became the first emperor in 27 BC and took the name Augustus. The republic was over.
The empire brought about two centuries of peace and trade called the Pax Romana. Romans built aqueducts, arches and the Colosseum, which opened in AD 80 and held about 50,000 people. In AD 476, the western half of the empire fell. Its influence lives on in the Latin roots of English, Spanish, French and Italian, in Roman ideas about law and in the Senate of the United States.
=republic|a government where citizens elect their leaders
=senate|a council of leaders who advise or make laws
=aqueduct|a bridge-like structure that carries water
?What does the word republic come from?|res publica, a public matter|A king's name|A Greek city|0
?Who became the first Roman emperor?|Augustus|Julius Caesar|Hannibal|0
?In what year did the western empire fall?|AD 476|44 BC|AD 80|0`,

`Why Places Are Different|🌦️|#d4f0e8|social|2
Geography is the study of the Earth and the people who live on it. Physical geography looks at landforms, water and climate. Human geography looks at people, cultures and cities and how they use the land. It is also important to know the difference between weather and climate. Weather is what is happening outside today. Climate is the typical pattern of weather in a place over many years.
Why are climates so different? One reason is latitude. Places near the equator get more direct sunlight, so they are warmer. Places near the poles get slanted sunlight, so they are colder. Elevation matters too. The higher up you go, the colder it gets, by about 3.5 degrees Fahrenheit for every 1,000 feet. Mountains can have snow even in hot regions.
Nearness to water also matters. Oceans and big lakes heat and cool slowly, so places near them often have milder temperatures. Ocean currents can move warm or cold water around the world. The warm Gulf Stream is one reason Western Europe is warmer than other places at the same latitude. Mountains can also block rain, creating a dry area on the far side called a rain shadow.
These differences create regions such as rainforests, deserts, grasslands and tundra. The Sahara in Africa is the largest hot desert on Earth. Antarctica is a desert too, because it gets very little precipitation, even though it is covered in ice.
Geography shapes how people live. Greece's mountains and islands separated people into small city-states that traded by sea. In Ohio, which sits at a mid-latitude and is far from the ocean, there are four distinct seasons, and towns near Lake Erie can get heavy lake-effect snow. When you wonder why a place is the way it is, ask what the land, water and weather have to do with it.
=climate|the usual weather of a place over many years
=elevation|the height of land above sea level
=precipitation|water falling as rain, snow, sleet or hail
?What is the difference between weather and climate?|Climate is the long-term pattern|They are the same|Weather lasts years|0
?Why are places near the equator warm?|They get more direct sunlight|They are low|They have no water|0
?What is the largest hot desert on Earth?|The Sahara|The Gobi|The Mojave|0`,

`Needs, Wants and Trading Cards|💰|#fff0b3|social|2
Economics is the study of how people make choices about money, goods and resources. It starts with the difference between needs and wants. Needs are things you must have to live, such as food, water, clothing and shelter. Wants are things you would like to have but can live without, such as a new video game or a pair of cleats.
The trouble is that resources are limited, but people's wants never end. This is called scarcity. Because of scarcity, everyone has to make choices. Whenever you choose one thing, you give up another. The most valuable thing you give up is called the opportunity cost. If you spend your fifty dollars on cleats, the opportunity cost might be the concert ticket you could have bought. Time has opportunity costs too. An hour spent gaming is an hour not spent at practice.
Prices depend on supply and demand. Supply is how many of something are available. Demand is how many people want it. Think about sports cards. If a company prints millions of copies of a card, the supply is huge, and each card is worth little. If a card is rare and many people want it, its price goes up. One famous baseball card, the T206 Honus Wagner, sold for more than seven million dollars in 2022 because so few exist and so many collectors wanted one.
Most of us do not make everything we use. Instead, people specialize in a job they do well and trade for the rest. Long ago, people used barter, trading goods directly. Money makes trade easier because everyone accepts it.
A budget is a plan for your money. Income is the money you receive. Expenses are the money you spend. Whatever is left is savings. A smart habit is to save first and spend what is left. Saving a little every week adds up over time.
=scarcity|not having enough resources to satisfy everyone's wants
=opportunity cost|the next best thing you give up when you make a choice
=demand|how much people want something
?What is a need?|Something you must have to live|Something you want|A rare card|0
?What happens to price when something is rare and many people want it?|It goes up|It goes down|It stays at zero|0
?What is opportunity cost?|What you give up when you choose|The price on the tag|A kind of tax|0`,

`Ancient China: Dynasties and the Great Wall|🐉|#ffd6d6|social|3
Early Chinese civilization began along the Yellow River, also called the Huang He, and later spread to the Yangtze River. China was ruled by dynasties, families of kings and emperors whose rule passed from parent to child. One early dynasty, the Shang, began around 1600 BC. The philosopher Confucius, who lived about 2,500 years ago, taught about respect for family, the value of education and the importance of good leaders. His ideas shaped Chinese society for centuries.
In 221 BC, a ruler named Qin Shi Huang brought the warring states together and became the first emperor of a united China. He standardized writing, money and weights and measures so that the whole country could trade and communicate. He built roads and canals. He also had walls joined together to defend the northern border. The Great Wall seen by tourists today was mostly built much later, by the Ming dynasty between the 1300s and 1600s. Counting all its branches, the wall is more than 13,000 miles long.
Qin Shi Huang's tomb holds one of the greatest discoveries in history. In 1974, farmers digging a well near the city of Xi'an found pieces of a clay soldier. Archaeologists have since uncovered thousands of life-size terracotta soldiers, horses and chariots buried to guard the emperor in the afterlife. The faces of the soldiers are said to be all different.
The Han dynasty, which ruled from 206 BC to AD 220, expanded China and opened the Silk Road trade routes. Chinese inventors came up with paper, the compass, gunpowder and printing, which are called the Four Great Inventions. They changed the world.
Chinese is one of the oldest writing systems still in use. China's history shows how a large, long-lasting civilization can build on ideas from many generations.
=dynasty|a family that rules a country for many years
=emperor|the ruler of an empire
=terracotta|a hard, brownish-red baked clay
?Who was the first emperor of a united China?|Qin Shi Huang|Confucius|Marco Polo|0
?What was discovered near Xi'an in 1974?|Terracotta soldiers|The Great Wall|A river|0
?Which of these was one of the Four Great Inventions?|Paper|Electricity|The telephone|0`,

`Hammurabi's Code: Rules in Stone|🪨|#e5dbff|social|2
About 3,800 years ago, a king named Hammurabi ruled the city of Babylon in Mesopotamia. He wanted to bring order to his growing kingdom. He had a set of laws carved onto a tall black stone pillar, called a stele. It was set up in public so that people could see it. The pillar was discovered in 1901 in what is now Iran, and it is in a museum in Paris today.
The code has 282 laws, written in cuneiform. They cover trade, farming, family life, wages, buildings and injuries. One law, for example, says that if a builder constructs a house badly and it falls down and kills the owner, the builder can be punished. Another sets the wages for workers.
The code is famous for the idea of an eye for an eye, which means that a punishment should match the harm done. In some ways, that was an improvement over a world in which people took revenge without limits. But the laws were not equal. The punishment could be different depending on whether someone was a noble, a commoner or an enslaved person.
Why does it matter that laws are written down? When rules are written and public, everyone can know what they are. Judges have to follow the same standard instead of making up a rule each time. The Romans carved their Twelve Tables for the same reason. In sports, the rulebook plays the same role. Players, coaches and referees all use the same set of rules.
Modern ideas of justice go further than Hammurabi's. In the United States, people are innocent until proven guilty, and the law is supposed to apply equally to everyone. When you read about an old law, compare it with today and ask what has stayed the same and what has changed.
=code|an organized set of laws or rules
=stele|a tall carved stone slab used as a monument
=justice|fair treatment under the law
?How many laws were in Hammurabi's Code?|282|10|1,000|0
?What was the code carved into?|A stone pillar|A wooden door|A clay cup|0
?Why does it matter for laws to be written down?|Everyone can know the rules|Only kings can read them|It makes them longer|0`
  ];

  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out = [];
  SRC.forEach(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const [title, cover, color, topic, diff] = lines[0].split("|");
    const pages = [], quiz = [], gloss = [];
    lines.slice(1).forEach(l => {
      if (l[0] === "=") { const p = l.slice(1).split("|"); gloss.push({ w: p[0], d: p[1] }); }
      else if (l[0] === "?") { const p = l.slice(1).split("|"); quiz.push({ q: p[0], a: p.slice(1, -1), ok: +p[p.length - 1] }); }
      else pages.push({ text: l, pic: "" });
    });
    out.push({ id: slug(title), shelf: "older", level: 0, topic, diff: +diff, title, cover, color, pages, quiz, gloss });
  });
  if (root.R20Books) { root.R20Books.TOPICS = TOPICS; out.forEach(b => root.R20Books.books.push(b)); }
  if (typeof module !== "undefined" && module.exports) module.exports = { TOPICS, books: out };
})(typeof window !== "undefined" ? window : globalThis);
