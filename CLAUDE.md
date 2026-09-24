# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A realtime online version of the Oink Games party game *A Fake Artist Goes to New York*. All UI text is in Vietnamese; the rulebook it implements is `rule_fakeartist_e.pdf`. The layout, auth and deploy setup are modelled on the sibling project `../scout`. When adding infrastructure, check how Scout does it first.

## Commands

```bash
npm install && npm run install:all   # root (concurrently, nodemailer for the Vercel fn) + server + client
npm run dev                          # server :4000 (tsx watch) + client :5173 (vite)
npm test                             # server/test/sim.ts: pure-rule checks + 150 seeded bot games on a fake clock
npm run typecheck                    # tsc for server and client
npm run build                        # tsup server → server/dist, vite client → client/dist
npx tsx server/test/e2e.ts           # a full game over real sockets; needs `npm run dev:server` running
```

There is no single-test runner. `sim.ts` is one script that exits on the first failed assertion, and the seeded PRNG makes a failing game replayable. Without a mail provider configured, the dev server returns the login code in the `/auth/request` response (`devCode`), which is how both tests log in. `/auth/request` is rate-limited to 12 codes per IP per hour in memory, so repeated e2e runs need a dev-server restart.

## Architecture

- **`shared/`** holds the rules as pure functions (`engine.ts`), the wire types (`types.ts`) and the Vietnamese title bank (`words.ts`). The server imports it by relative path; the client imports it through the `@shared` alias (vite + tsconfig).
- **The server is the referee.** `server/src/room.ts` (`Room`) is the whole state machine: `lobby → setup → reveal → drawing → voting → (guess) → result → … → gameEnd`. Clients only send intents (`setup:submit`, `draw:*`, `vote:cast`, `guess:submit`…), and `index.ts` maps socket events to `Room` methods, which return an error string or `null`.
- **Time lives in `Room.tick()`**, not in scattered timers. `index.ts` runs one 80 ms interval over all non-lobby rooms. `tick()` handles deadlines, bot moves (including streaming bot lines a few points at a time), players past `GRACE_MS`, and host hand-off, and returns live events to relay plus a `changed` flag. The clock and RNG are constructor-injected, which is how `sim.ts` plays games instantly.
- **Secrets.** `publicState()` must never contain the title, and must name the fake only via `guessFakeId` (guess phase) or `result` (after the round). `privateState(id)` is sent per socket: only the QM gets `fakeId`, the fake gets `title: null`. `sim.ts` and `e2e.ts` both assert this, so keep them passing when touching snapshots.
- **Drawing protocol.** The drawer's client sends `draw:begin`, batched `draw:pts` (flat `[x,y,…]` in 1000×750 canvas units, flushed every 60 ms), `draw:end`, then `draw:commit` or `draw:redo`. The server relays points to the rest of the room as `live:*` events without a full state broadcast, and the full `state` goes out only on commit or turn change. On the client, the drawer's own line lives in a ref in `GameScreen.tsx`, and remote lines are in `remoteLive` in `App.tsx`.
- **System chat.** `Room.system()` queues announcements that `index.ts` drains and emits as `chat:msg` after each broadcast. Joins also arrive in `chat:history`, so the client dedupes chat by `id`.
- **Auth** (`server/src/auth.ts`, copied from Scout): email → 6-digit code → HMAC-signed stateless token. The socket handshake passes the token, and only emails in `HOST_EMAILS` get `canHost` (an empty list lets anyone host). Mail goes out via the Vercel function `api/send-code.js`, because Render's free plan blocks SMTP.
- **Deploy.** The client goes to Vercel (`vercel.json`, env `VITE_SERVER_URL`) and the server to Render (`render.yaml`). Rooms live only in memory.

## Game rules as implemented

- The fake is **caught** only when they alone have the most votes. A tie, or no votes at all, means they escape (`isCaught`).
- Scoring (`scoreRound`): if the fake escapes, or is caught but names the title, the fake gets +2 and the QM gets +2. If the fake is caught and guesses wrong, every real artist gets +1. In `auto` QM mode (the server sets the title) there is no QM, so only the fake scores.
- Guesses match with accents, case, spacing and a leading Vietnamese classifier (`con`, `cái`, `quả`…) ignored, plus the QM's optional alternate answers (`answerMatches`). Don't add classifiers that can start a real word: `người` would turn "Người nhện" into "nhện".
- The QM rotates to the next seat each round. Players who join mid-round watch (`inRound: false`) until the next round, and players who leave mid-round are flagged `left` and removed at the next `beginRound`.

## UI conventions

- The look is a light "sketchbook" theme: warm paper, ink, and muted rose/cobalt from the point chips. The user asked for **no neon or glow**, so use the theme tokens in `client/src/index.css` (`paper`, `ink`, `rose`, `cobalt`…) instead of new bright colours.
- Every game component (avatars, title cards, markers, chips, logo) is hand-drawn SVG in `components/Art.tsx`. There are no raster assets.
- Framer Motion handles animation, and overlays for each phase are in `components/Phases.tsx`.
