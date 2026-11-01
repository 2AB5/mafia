# Mafia · Night Table

**Play: https://2ab5.github.io/mafia/**

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
