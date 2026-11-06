# Mafia · Night Table

**Play: https://2ab5.github.io/mafia/** · Also here: **[Pen Fight](https://2ab5.github.io/mafia/penfight/)** for 2 to 5 players.

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
- **Physics:** a full flick slides about 4 pen lengths and stops dead in about a second, because pens use sliding friction like a real desk. The desk grows with the number of players: 6×9 for a duel, 7×10.5 for 3, and 8×12 for 4–5. Pens near an edge are in danger, while the middle of the big desk is safe.
- **What everyone sees:** the shooter's aim arrow appears live on every screen, and the shot plays out on all phones at once. You can send reactions (😂 😱 🔥 👏 😤 💀) during play.
- **Host options:** free-for-all or teams, first to 1, 2, 3 or 5 rounds, and a turn timer (off, 20, 30 or 45 seconds). Offline players' turns are skipped automatically, and the host can skip a turn or remove someone who left.
- **One device:** 2 to 5 players can pass one phone around or share a laptop, with teams available for 3 or more.

### How it works

- The host's browser runs the physics with [planck.js](https://piqnt.com/planck.js/) (a Box2D port) and streams the pen positions to every player about 30 times a second.
- Players only send their flicks: where they grabbed the pen and how hard they pulled.
- The connections between phones use the same PeerJS rooms as Mafia, and players reconnect automatically if they drop.

| Path | What it holds |
| --- | --- |
| `penfight/src/game.js` | Desk physics and match rules, tested in Node |
| `penfight/src/net.js` | Rooms and the host-run game loop |
| `penfight/src/ui.js` | Desk renderer, flick controls and screens |
| `penfight/index.html` | The built page (`node penfight/build.js`) |
