# Mafia · Night Table

**Play: https://2ab5.github.io/mafia/** · Also here: **[Pen Fight](https://2ab5.github.io/mafia/penfight/)** for 2 to 5 players, **[Pictionary](https://2ab5.github.io/mafia/pictionary/)** for 4 to 12, and **[Badminton](https://2ab5.github.io/mafia/badminton/)** for 2 to 4.

A party game of lies for 4 to 8 players. Everyone gets a secret role on their own phone. By night the Mafia strikes; by day the town argues, accuses and votes. No accounts and no installs.

## How to play with friends

1. One person opens the link, enters a name, picks a face and taps **Create a new room**.
2. Everyone else joins in any of three ways:
   - tap the shared invite link
   - scan the QR code
   - open the page and type the 4-letter room code
3. Once 4 or more players are seated, the host sets the table rules and taps **Deal the roles**.
4. Each player taps their face-down card to see their role in private.
5. Play in the same room or over a voice call. **The host must keep the page open**, because the host's phone runs the game for everyone.

No internet? Choose **Play on one device** and pass a single phone around the table.

## Roles

| Role | At night |
| --- | --- |
| Mafia | Picks one player to eliminate. With two Mafia, they see each other's picks and can whisper; a split vote is broken at random. |
| Doctor | Protects one player. Self-protection is allowed, but not the same player two nights in a row. |
| Police | Learns whether one player is Mafia. |
| Prankster | Blocks one player's night action. Plays for the town. |
| Civilian | Taps Sleep, so nobody can tell who has a power. |

- **Day:** the night's victim is revealed, then the town talks and votes. A player is voted out only with more votes than any other option. Skips and missing votes count together, and ties send nobody out.
- **Win:** the town wins when every Mafia member is out. The Mafia wins once it matches the town in numbers.
- **Host options:**
  - 1 or 2 Mafia (Auto gives 1 for 4–5 players and 2 for 6–8)
  - turn the Doctor, Police and Prankster on or off
  - reveal a player's role, their side, or nothing when they are out
  - optional timers for night, talk and voting

## How it works

- **The host runs the game.** It's one static page with no game server. The host's browser holds the whole game, and each player's phone gets a direct peer-to-peer connection to it through [PeerJS](https://peerjs.com).
- **Roles stay private.** The host sends each player only their own private view, so roles never travel to anyone else's phone.
- **Signalling server.** The public PeerJS server is only used to introduce the phones to each other.
- **Reconnects.** If a player's phone sleeps or they reload the page, they rejoin the same seat automatically. If the host reloads, the game picks up where it left off and everyone reconnects.
- **Network limits.** A few strict networks, such as some office or campus Wi-Fi, block direct connections. If someone can't join, they should switch between Wi-Fi and mobile data.

## Develop

```
npm install          # test-only dependencies: local PeerJS server, express, Playwright
npm run build        # src/ + vendor/ -> index.html (single self-contained page)
npm test             # rules engine: unit tests + 10,500 simulated games
npm run test:e2e     # real WebRTC games across many browser tabs
```

| Path | What it holds |
| --- | --- |
| `src/engine.js` | Pure game rules, tested separately |
| `src/net.js` | Rooms, host referee, reconnects |
| `src/ui.js` | Screens, announcements, chat, one-device mode |
| `src/core.js` | Shared helpers |
| `src/style.css` | Page styles |
| `vendor/` | PeerJS and qrcode-generator (both MIT) |

To test against your own signalling server, open the page with `?peer=host:port`.

Inspired by [meet244/Mafia](https://github.com/meet244/Mafia).

---

# Pen Fight

**Play: https://2ab5.github.io/mafia/penfight/**

The last-bench classic, online for 2 to 5 friends. Everyone has a pen on the same wooden desk. On your turn you flick your pen, and the aim is to knock everyone else's pen off the desk without sending your own over the edge. The last pen on the desk wins the round, and the first player to reach the target number of rounds wins the match.

**Teams:** with 3 or more players, the host can switch to Blue vs Red (2v1, 2v2 or 3v2). Teammates sit apart, turns alternate between teams, and a team wins the round when no opponent pen is left on the desk. Knocking off your own teammate counts against you.

- **Rooms:** create a room and share the 4-letter code, the invite link or the QR code, just like Mafia. Everyone plays on their own phone.
- **Controls:** press on your glowing pen, pull back like a slingshot, and let go. A faint ghost pen shows exactly where yours will stop if it hits nothing, and it turns red if you'd fly off the desk. Grab near the middle to shoot straight, or near an end to make the pen spin.
- **Physics:**
  - Pens are round capsules that slide with real desk friction. A full flick goes about 4 pen lengths and stops in about a second.
  - Pushed lengthwise a pen grips, but pushed from the side a round pen rolls, so a broadside hit sends it much further than an end-on one. A hexagonal pencil never rolls.
  - The desk grows with the number of players: 7×10.5 for a duel, 7.5×11.25 for 3, and 8×12 for 4–5. Pens start angled so the opening flick can't decide the round.
- **Pens:** seven types, all balanced by bot duels so each one wins about half its matches. They differ in reach, grip (how much they roll), bounce and size.
  - Blue ballpoint: the all-rounder
  - Red ballpoint: longest flick, rolls easily
  - Black gel: rubber grip
  - Fat marker: short and controlled
  - Pencil: never rolls
  - Highlighter: ricochet king
  - Fountain pen: steady, barely bounces
- **All pens are open:** pick any pen in your pencil case. Your desk style (Oak, Walnut, Exam hall, Birch), flick style ("pull back" slingshot or "push forward") and replay setting are saved in your browser on that device.
- **Computer players:**
  - Practice alone against 1 to 4 bots, or let the host add bots to an online room to fill empty seats.
  - There are three levels: Easy, Normal and Hard. The host taps a bot's badge in the lobby to change its level.
  - Bots aren't predictable. Each one tries dozens of shots in a quick simulation, picks among the good ones with some randomness, and then has a slightly shaky hand. Easy bots take more risks and miss more often.
- **Instant replays:** whenever a pen goes off the desk, everyone sees the shot again in slow motion, with the camera zoomed on the action. Tap to skip, or use "Replay last shot" at any time. Replays can be turned off in the pencil case.
- **Video clips:**
  - Tap **🎬 Save clip** under the desk to turn the last shot into a short portrait video. It includes the slow-motion, the zoom and the caption, for example "Karan knocks off Riya!".
  - When a match ends, **Make highlight reel** strings together the four best knock-offs and ends on the final scores and awards.
  - The videos are made right in your browser (MP4 where the browser supports it, otherwise WebM) and can be shared to WhatsApp or downloaded.
- **Match summary:** when a match ends, everyone gets a table under the desk with each player's shots, hits (shots that touched another pen), knock-offs and falls. It also gives a few awards, such as 🎯 Sharpshooter, 🛡️ Survivor, 💥 Double knock, 💪 Full power and 🙈 Oops.
- **Spectators:**
  - Anyone with the code or link can tap **Watch** instead of Join to follow the match live without a seat. A seated player can also switch to "Just watch instead" in the lobby.
  - An 👁 counter at the top shows how many people are watching; tap it to see their names.
  - Viewers can send reactions, which float across the top of the desk with their name. When a match ends, a viewer can tap "Play next match" to join the rematch if a seat is free.
  - Someone who opens the link while a match is on, or finds the desk full, watches until a seat opens.
- **What everyone sees:** the shooter's aim arrow appears live on every screen, and the shot plays out on all phones at once. You can send reactions (😂 😱 🔥 👏 😤 💀) during play.
- **Host options:** free-for-all or teams, first to 1, 2, 3 or 5 rounds, and a turn timer (off, 20, 30 or 45 seconds). Offline players' turns are skipped automatically, and the host can skip a turn or remove someone who left.
- **One device:** 2 to 5 players can pass one phone around or share a laptop, with teams available for 3 or more.

### How it works

- The host's browser runs the physics with [planck.js](https://piqnt.com/planck.js/) (a Box2D port) and streams the pen positions to every player about 30 times a second.
- Players only send their flicks: where they grabbed the pen and how hard they pulled.
- The connections between phones use the same PeerJS rooms as Mafia, and players reconnect automatically if they drop.

| Path | What it holds |
| --- | --- |
| `penfight/src/game.js` | Desk physics, match rules and the computer player, tested in Node |
| `penfight/src/net.js` | Rooms, the host-run game loop, bot turns and replay recording |
| `penfight/src/settings.js` | Desk, flick and replay settings (browser storage) |
| `penfight/src/ui.js` | Desk renderer, flick controls and screens |
| `penfight/src/clips.js` | Replay clips and highlight reels (video made in the browser) |
| `penfight/index.html` | The built page (`node penfight/build.js`) |

# Pictionary

**Play: https://2ab5.github.io/mafia/pictionary/**

Team draw-and-guess for 4 to 12 friends, each on their own phone. There are two teams, Blue and Red. On each turn one player draws while their teammates guess, and **the other team chooses the word**.

- **Setting the word:**
  - The other team types the word or phrase, picks a category (Food, Movie, Place and so on, or their own) and can add a hint. If they need ideas, they can tap a suggestion from about 340 words: everyday things, Bollywood and Indian life, and hard phrases.
  - Anyone on that team can send the word. Their chat starts on **Team only** so they can decide in private.
  - If nobody sends a word in time, the game picks one.
- **Guessing:**
  - Guessers see the category and one blank per letter. The setters' hint unlocks a third of the way in, and a few letters appear near the end (the host can turn letters off).
  - Spelling slips like "pani-puri" or "panipuri" still count. A near miss gets a private "really close!".
  - Guessers never receive the word until the reveal; the host's phone keeps it.
- **Scoring and who wins:**
  - A correct guess scores 50 to 100 points for the drawing team: 50 plus 50 × the share of time left, so a guess halfway through is worth 75.
  - If nobody gets it, the team that set the word scores 40. A skipped turn scores nothing.
  - Everyone draws once per round. With uneven teams the smaller team's players draw again, so both teams get the same number of turns (2 × rounds × the bigger team's size).
  - **The team with the most points after the last turn wins**, and equal points is a tie. The game also ends early if a team drops below 2 players or the host ends it; the score at that point decides. The per-player points in the end table are just for fun.
  - The drawer can pass on one unfair word in the first 15 seconds, and the setters then pick another.
- **Chat:** the setting team can tease and mislead in the chat, but any message that contains the word is blocked, and only the sender sees it. The drawer can't chat, only react.
- **Demo game (no friends needed):** tap **Play a demo game** to play 4 turns on your own phone, with you and a robot teammate against two robots.
  - The robots draw from 28 hand-made sketches (sun, kite, samosa, chai, diya, cricket and more), stroke by stroke with a slightly shaky hand, so you can guess while they draw.
  - They set words for you and tease in the chat. Your robot teammate helps on the team chat, and picks a word for you if time is running out.
  - When you draw, your teammate tries a few wrong guesses from the same category first. It only "gets it" after you've drawn something, and sometimes not at all.
  - When it's your turn to set a word for a robot, you choose from the words the robots know how to draw.
- **Drawing:** 12 colours, 4 brush sizes, eraser, fill bucket, undo and clear. Everyone renders the same list of strokes, so the picture matches on every screen. A phone that reloads or reconnects mid-turn gets the whole drawing back.
- **End of game:** team scores, a per-player table (points, correct guesses, drawings guessed, stumps), awards like ⚡ Quickest guess, 🎨 Best artist and 🧩 Word master, and a gallery of every drawing with its word. Each drawing can be downloaded, or all of them saved as one image.
- **Also:**
  - Rooms, QR invites, reconnects and spectators (👁 Watch) work like Pen Fight.
  - The host picks 1 to 4 rounds, the drawing time (60 to 120 s) and the word-picking time.
  - Dark theme by default, with a ☀️/🌙 toggle that each phone remembers. On a computer the chat sits beside the board.

| Path | What it holds |
| --- | --- |
| `pictionary/src/game.js` | Turns, word rules, guess matching, hints, scoring, tested in Node |
| `pictionary/src/words.js` | Suggestion word packs |
| `pictionary/src/net.js` | Rooms, the host's game clock, per-player views that hide the word, chat routing |
| `pictionary/src/draw.js` | Drawing board, stroke sync and the chat panel |
| `pictionary/src/sketch.js` | The robots' sketch library (strokes and fills) |
| `pictionary/src/bots.js` | Robot players for the demo: setting words, drawing, guessing |
| `pictionary/src/ui.js` | Screens |
| `pictionary/index.html` | The built page (`node pictionary/build.js`) |

# Badminton

**Play: https://2ab5.github.io/mafia/badminton/**

Top-down online badminton for 2 to 4 players: 1 v 1, 1 v 2 or 2 v 2. Anyone else can watch and wait in the lobby for the next game. You can also practise against computer players (Easy, Normal or Hard), and the host can add bots to fill empty spots.

- **Physics:** the shuttle has real drag (it falls at about 6.7 m/s, like a feather shuttle), so clears float high and die deep, while smashes are fast and steep. The host's phone runs the shuttle 120 times a second and streams it to everyone. Your own player moves instantly on your screen, and a slightly late swing still connects, which covers network delay.
- **Shots:** Clear (a lift when the shuttle is low), Drop (a net shot near the net), and Smash (a drive at chest height, a push when low). The direction you're pushing as you hit aims the shot left or right, short or deep. Shots on your left are backhands, a little weaker. Clean contact close to your body gives a **Perfect!** shot that's faster and more accurate.
- **Serves:** Clear = forehand high serve, Drop = backhand short serve, Smash = backhand flick serve. You serve from the right on an even score, into the diagonal box, and short serves must pass the short service line.
- **Height meter:** a gauge beside the court shows how high the shuttle is. 🟢 is the smash zone (2 m and up, a jump smash above 2.5 m), 🟡 is for drives, drops and clears, and 🔴 is too low (lift it). The buttons relabel themselves, and the Smash button warns ⚠ when a smash would go into the net. Smashing from too low, or from deep without enough height, really can hit the tape.
- **Energy:** running, jumping and smashing drain it, and standing still recovers it. Tired players run slower and smash softer. The solo player in 1 v 2 is a little quicker and recovers faster.
- **Scoring:** rally points, first to 10 (5, 15 or 21 can be picked), win by 2, with 15 as the cap (target + 5).
- **Controls settings:** touch joystick sensitivity (Low = smooth, Medium, High = quick), with easing so movement starts and stops smoothly. On a computer you can rebind every key: click an action in Settings & controls (or ⚙ Controls in a game), then press a key. Taken keys swap, choices are remembered, and Reset keys restores WASD + J K L.
- **Touch screens:** during a game the page can't zoom, scroll or select text, so double taps and long presses on an iPad or phone don't get in the way.
- **Screens:** on a portrait phone the court runs up the screen with your side at the bottom, joystick on the left and shot buttons on the right. On a landscape phone, an iPad or a computer the court turns sideways with your side on the left. On a computer, use WASD or the arrow keys, plus J, K and L.
- **Also:** a landing guide (an ✕ where the shuttle will come down, switchable), a reach ring that lights up when you can hit, smash speeds in km/h, match stats and awards, reactions, a dark or light theme, and reconnects.

| Path | What it holds |
| --- | --- |
| `badminton/src/game.js` | Shuttle physics, shots, serves, rules, scoring, energy and the computer players, tested in Node |
| `badminton/src/net.js` | Rooms, the host's 120 Hz game loop, frame streaming and hit lag compensation |
| `badminton/src/court.js` | Smoothing, local movement, controls and the court renderer with the height meter |
| `badminton/src/ui.js` | Screens |
| `badminton/index.html` | The built page (`node badminton/build.js`) |

