# Mafia

A social deduction party game for 4 to 8 players. The whole game is one HTML file with no dependencies.

- **Online table.** When the page is published as a Claude artifact, a host opens a table and friends join from the shared link on their own phones. Roles stay secret, night actions happen simultaneously, and there is voting plus table chat, a private Mafia whisper and a ghost chat.
- **One device.** Pass a single phone or laptop around the table. This works anywhere, including when you open `index.html` straight from disk or host it on GitHub Pages.

## Rules

| Role | Night action |
| --- | --- |
| Mafia | The team picks one player to eliminate. A split vote is broken at random. |
| Doctor | Protects one player. Self-protection is allowed, but not the same player two nights in a row. |
| Police | Learns whether one player is Mafia. |
| Prankster | Blocks one player's night action. |
| Civilian | Sleeps. Everyone taps a button at night, so nobody can tell who has a power. |

- **Day.** The night's result is announced, then everyone discusses and votes. A player is voted out only if they get more votes than any other option. Skips and abstentions count together, and a tie sends nobody out.
- **Win.** Town wins when no Mafia are left. Mafia wins when it has as many players left as the town.
- **Setup by player count.** 4–5 players get 1 Mafia; 6–8 get 2. The host can change the Mafia count, turn the Doctor, Police and Prankster on or off, choose what is revealed when someone is out (role, team or nothing), and set phase timers.

## Develop

```
npm run build      # src/ -> index.html and dist/mafia.html
npm test           # rules engine: unit tests + 10,500 simulated games
npm run test:e2e   # multi-tab browser games against a mock shared store (needs Playwright)
```

- `src/engine.js` holds the pure game rules.
- `src/app1.js` holds the online sync and host logic.
- `src/app2.js` holds the screens.
- `src/shell.html` holds the page styles.

## How online play works

The host's browser tab is the referee. It keeps the full game state and writes one private view per player. Players only write their own actions. The artifact's database access rules stop players from reading each other's roles or actions. Share the artifact with players as **Contributor**, because anyone with Editor access can read everything. The host tab must stay open during a game. If the host reloads, the game resumes.

Inspired by [meet244/Mafia](https://github.com/meet244/Mafia).
