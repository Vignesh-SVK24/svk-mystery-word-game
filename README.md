# 🔮 Mystery Word Game

> **Multiplayer local-LAN social-deduction word game** — 4 to 10 players on the same Wi-Fi.

---

## What is it?

Players secretly get one of three roles every round:
- 🔪 **Killer (1)** — Receives a riddle/sentence that *hints at* a hidden word. Must mislead others.
- 🔍 **Detective (0 or 1)** — Can **Kick** a suspect or **Pass** to advance the round (requires ≥5 players + host enabled).
- 👤 **Guests (rest)** — Receive the same secret word as **scrambled letter tiles** and must unscramble it.

Players chat publicly, call votes, and try to identify the Killer.

**Win conditions:**
- 🎉 **Guests + Detective win** — Killer is kicked.
- 💀 **Killer wins** — Alive players drop to 3.

---

## Quick Start (Host)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+ installed.

### 2. Install dependencies
```bash
cd mystery_word_game
npm install
```

### 3. Start the server
```bash
npm start
```

You'll see output like:
```
╔══════════════════════════════════════════════╗
║        🔮 MYSTERY WORD GAME SERVER 🔮        ║
╠══════════════════════════════════════════════╣
║  Local:   http://localhost:3000              ║
║  LAN:     http://192.168.1.25:3000           ║
╚══════════════════════════════════════════════╝
```
A **QR code** is also printed — scan it from a phone on the same Wi-Fi!

---

## How to Play on LAN

| Role | What to do |
|------|------------|
| **Host** | Run `npm start`, share the IP / QR code with friends |
| **Players** | Open `http://<HOST_IP>:3000` in any browser |
| **Mobile** | Scan QR code or type the IP into your phone browser |

> All players must be on the **same Wi-Fi network**.

---

## Testing with Multiple Tabs (Local)

Open 4+ browser tabs at `http://localhost:3000` to simulate multiple players.

---

## Configuration (Host in Lobby)

| Setting | Options |
|---------|---------|
| **Detective** | Toggle on/off (requires ≥5 players) |
| **Difficulty** | 😊 Easy / 🔥 Medium / 💀 Hard |
| **Round Timer** | 30–180 seconds |

---

## Run Unit Tests

```bash
npm test
```

Tests cover:
- **Vote logic** — majority, ties, double-vote prevention, detective kick
- **Scramble** — Fisher-Yates correctness, letter preservation, distribution
- **Roles** — killer count, detective conditions, game-start requirements, fairness

---

## Project Structure

```
mystery_word_game/
├── server.js              # Entry point: Express + Socket.io
├── package.json
├── src/
│   ├── gameManager.js     # Lobby, roles, rounds, win conditions
│   ├── voteManager.js     # Vote logic, majority, detective kick
│   ├── wordBank.js        # Word selection, scramble, clue generation
│   └── sessionManager.js  # Reconnection tokens (60s expiry)
├── data/
│   └── words.json         # 45 words, 3 difficulties, clue templates
├── public/
│   ├── index.html         # Single-page app (5 screens + 3 modals)
│   ├── styles.css         # Dark neon theme, animations, responsive
│   └── game.js            # Client logic, socket.io, UI updates
└── test/
    ├── vote.test.js
    ├── scramble.test.js
    └── roles.test.js
```

---

## Gameplay Flow

```
1. Host starts server → shares IP
2. Players join lobby → enter names, toggle ready
3. Host sets config (Detective, difficulty, timer)
4. Host clicks "Start Game"
5. Each player sees private Role Reveal screen:
   • Guests → scrambled tiles + text input
   • Killer → clue card (sentence/riddle)
   • Detective → suspect list with Kick / Pass
6. In-Round: public chat + timer
7. Anyone can "Call Vote" → all vote yes/no
   Detective can Kick unilaterally OR Pass
8. Kick result shown → roles revealed on kick
9. Win? → Game End screen    No? → New round
```

---

## Reconnection

If you disconnect mid-game, the server keeps your session for **60 seconds**. Simply refresh the page — the same session token (stored in `localStorage`) will restore your role and private payload automatically.

---

## Customization

Edit `data/words.json` to add more words and clues. Format:
```json
{
  "easy": [
    { "word": "your_word", "clues": ["Clue 1", "Clue 2"] }
  ]
}
```
