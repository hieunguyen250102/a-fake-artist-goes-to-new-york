/**
 * Rule checks plus whole games played on a fake clock.
 *   npm test            (from the repo root)
 * Exits non-zero on the first failed assertion.
 */

import assert from 'node:assert/strict';
import {
  answerMatches,
  buildTurnOrder,
  foldText,
  isCaught,
  nextQmSeat,
  parseAlts,
  sanitizePoints,
  scoreRound,
  tallyVotes,
  winnersOf,
} from '../../shared/engine';
import { GRACE_MS, Room } from '../src/room';
import type { GameState } from '../../shared/types';

let checks = 0;
function ok(cond: unknown, msg: string): void {
  checks++;
  assert.ok(cond, msg);
}
function eq<T>(a: T, b: T, msg: string): void {
  checks++;
  assert.deepEqual(a, b, msg);
}

/** Small seeded PRNG so failures can be replayed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ pure rules */

function rules(): void {
  // caught = alone at the top
  ok(isCaught({ a: 3, b: 1, f: 0 }, 'a'), 'most votes alone is caught');
  ok(!isCaught({ a: 2, b: 2, f: 0 }, 'a'), 'a tie at the top is not caught');
  ok(!isCaught({ a: 0, b: 0 }, 'a'), 'no votes is not caught');
  ok(!isCaught({ a: 1, b: 3 }, 'a'), 'someone else on top: not caught');

  eq(tallyVotes({ x: 'a', y: 'a', z: 'b', q: 'ghost' }, ['a', 'b', 'c']), { a: 2, b: 1, c: 0 }, 'tally ignores non-candidates');

  eq(
    scoreRound({ qmId: 'q', fakeId: 'f', artistIds: ['a', 'b', 'f'], caught: false, guessCorrect: null }),
    { winner: 'fake', deltas: { f: 2, q: 2 } },
    'escape: fake and QM +2',
  );
  eq(
    scoreRound({ qmId: 'q', fakeId: 'f', artistIds: ['a', 'b', 'f'], caught: true, guessCorrect: true }),
    { winner: 'fake', deltas: { f: 2, q: 2 } },
    'caught but right: fake and QM +2',
  );
  eq(
    scoreRound({ qmId: 'q', fakeId: 'f', artistIds: ['a', 'b', 'f'], caught: true, guessCorrect: false }),
    { winner: 'artists', deltas: { a: 1, b: 1 } },
    'caught and wrong: each real artist +1',
  );
  eq(
    scoreRound({ qmId: null, fakeId: 'f', artistIds: ['a', 'f'], caught: false, guessCorrect: null }),
    { winner: 'fake', deltas: { f: 2 } },
    'no human QM: only the fake scores',
  );

  eq(winnersOf([{ id: 'a', score: 5 }, { id: 'b', score: 6 }, { id: 'c', score: 4 }], 5), ['b'], 'highest past the target wins');
  eq(winnersOf([{ id: 'a', score: 5 }, { id: 'b', score: 5 }], 5), ['a', 'b'], 'ties share the win');
  eq(winnersOf([{ id: 'a', score: 4 }], 5), [], 'nobody there yet');

  // answers
  eq(foldText('Hươu cao cổ!'), 'huou cao co', 'fold drops accents and punctuation');
  eq(foldText('Đồng hồ'), 'dong ho', 'fold handles đ');
  ok(answerMatches('Con mèo', [], 'meo'), 'classifier and accents are optional');
  ok(answerMatches('Mèo', [], 'con mèo'), 'classifier on the guess side');
  ok(answerMatches('Sư tử', [], '  SU   TU '), 'case and spacing');
  ok(!answerMatches('Con mèo', [], 'con chó'), 'a different animal is wrong');
  ok(!answerMatches('Người nhện', [], 'nhện'), '"người" is part of the word, not a classifier');
  ok(answerMatches('Xe máy', ['xe gắn máy', 'motor'], 'Motor'), 'alternatives count');
  ok(!answerMatches('Sư tử', [], ''), 'empty guess is wrong');
  eq(parseAlts('a, b ;c\n d,,'), ['a', 'b', 'c', 'd'], 'alts split on , ; and newlines');

  // seating
  const rng = mulberry32(1);
  eq(nextQmSeat(5, 4, rng), 0, 'QM passes to the left and wraps');
  eq(nextQmSeat(5, 1, rng), 2, 'QM passes to the left');
  eq(buildTurnOrder(['a', 'q', 'b', 'c'], 'q', 'b', rng), ['b', 'c', 'a'], 'clockwise from the chosen first artist, QM skipped');
  const order = buildTurnOrder(['a', 'b', 'c'], null, null, rng);
  eq([...order].sort(), ['a', 'b', 'c'], 'random start still has everyone once');

  eq(sanitizePoints([1, 2, 3], 10), null, 'odd point lists are rejected');
  eq(sanitizePoints([-5, 9999, 10.4, 20.6], 10), [0, 750, 10, 21], 'points are clamped and rounded');
  eq(sanitizePoints(['x', 1], 10), null, 'non-numbers are rejected');
}

/* ---------------------------------------------------------- full games */

interface Sim {
  room: Room;
  clock: { now: number };
  rng: () => number;
}

function makeRoom(seed: number): Sim {
  const clock = { now: 1_000_000 };
  const rng = mulberry32(seed);
  const room = new Room('TEST', rng, () => clock.now);
  return { room, clock, rng };
}

const SECRET = 'Kỳ lân tím';

/** Nothing public may reveal the title or the fake before the round ends. */
function checkNoLeak(room: Room, title: string): void {
  const s: GameState = room.publicState();
  const secretPhase = ['setup', 'reveal', 'drawing', 'voting'].includes(s.phase);
  if (secretPhase || s.phase === 'guess') {
    ok(!JSON.stringify(s).includes(title), `title leaked in public state during ${s.phase}`);
    ok(s.result === null, 'no result before the round ends');
  }
  if (secretPhase) ok(s.guessFakeId === null, 'fake not named before the vote');
  for (const p of room.players) {
    const priv = room.privateState(p.id);
    if (p.id === room.qmId) continue;
    ok(priv.fakeId === null, 'only the QM knows who the fake is');
    if (p.id === room.fakeId && s.phase !== 'result') ok(priv.title === null, 'the fake never sees the title');
  }
}

/**
 * Plays a game where `humans` seats act through the same methods the socket
 * handlers call, and the rest are bots. Returns rounds played.
 */
function playGame(seed: number, humans: number, bots: number, mode: 'rotate' | 'auto'): number {
  const { room, clock, rng } = makeRoom(seed);
  for (let i = 0; i < humans; i++) room.addPlayer({ id: `h${i}`, name: `Human ${i}`, avatar: i });
  for (let i = 0; i < bots; i++) room.addPlayer({ id: `b${i}`, name: `Bot ${i}`, avatar: i, isBot: true });
  room.updateSettings({ qmMode: mode, target: 5, turnSeconds: 20 });
  const colors = new Set(room.players.map((p) => p.color));
  eq(colors.size, room.players.length, 'every player gets their own marker');

  eq(room.start(), null, 'game starts');
  let lastQmSeat = -1;
  let setupSeen = 0;
  let rounds = 0;
  const scores = new Map(room.players.map((p) => [p.id, 0]));

  for (let steps = 0; steps < 200_000 && room.phase !== 'gameEnd'; steps++) {
    const phase = room.phase;

    if (phase === 'setup' && room.round > setupSeen) {
      setupSeen = room.round;
      if (mode === 'rotate') {
        const seat = room.players.findIndex((p) => p.id === room.qmId);
        if (lastQmSeat >= 0) eq(seat, (lastQmSeat + 1) % room.players.length, 'QM rotates to the left');
        lastQmSeat = seat;
        ok(!!room.qmId, 'rotate mode has a QM');
      } else {
        eq(room.qmId, null, 'auto mode has no QM');
      }
      const qm = room.qmId ? room.find(room.qmId) : undefined;
      if (qm && !qm.isBot) {
        eq(room.submitSetup('not-qm', { category: 'x', title: 'y' }), 'Chỉ người ra đề mới được đặt đề', 'only the QM sets the title');
        eq(room.submitSetup(qm.id, { category: 'Động vật', title: SECRET, alts: 'unicorn' }), null, 'QM sets the title');
      }
    }

    if (phase === 'reveal') {
      ok(!!room.fakeId && room.artists.some((a) => a.id === room.fakeId), 'the fake is one of the artists');
      ok(room.fakeId !== room.qmId, 'the QM is never the fake');
      eq(room.turnOrder.length, room.artists.length, 'one lap has every artist once');
      for (const p of room.artists) if (!p.isBot) room.markSeen(p.id);
    }

    if (room.phase === 'drawing') {
      const id = room.drawerId!;
      const p = room.find(id)!;
      if (!p.isBot) {
        // a mark streamed in two batches, then confirmed
        eq(room.commit('someone-else'), 'Chưa tới lượt bạn', 'only the drawer can commit');
        ok(room.liveBegin(id), 'drawer can start a line');
        ok(room.livePoints(id, [100, 100, 150, 120]), 'points accepted');
        ok(room.livePoints(id, [200, 160]), 'more points accepted');
        ok(room.liveEnd(id), 'line ends');
        if (rng() < 0.3) {
          ok(room.liveClear(id), 'redo clears the line');
          room.liveBegin(id);
          room.livePoints(id, [300, 300, 320, 330]);
          room.liveEnd(id);
        }
        const before = room.strokes.length;
        eq(room.commit(id), null, 'commit');
        eq(room.strokes.length, before + 1, 'one mark per turn');
      }
    }

    if (room.phase === 'voting' && clock.now >= (room.votingOpensAt ?? 0)) {
      for (const p of room.artists) {
        if (p.isBot || room.votes[p.id] || room.phase !== 'voting') continue;
        const others = room.artists.filter((x) => x.id !== p.id);
        eq(room.vote(p.id, p.id), 'Không chỉ vào chính mình được', 'cannot vote for yourself');
        // humans find the fake half the time
        const target = rng() < 0.5 && p.id !== room.fakeId ? room.fakeId! : others[Math.floor(rng() * others.length)].id;
        room.vote(p.id, target);
      }
    }

    if (room.phase === 'guess') {
      const fake = room.find(room.fakeId!)!;
      if (!fake.isBot) room.guess(fake.id, rng() < 0.5 ? SECRET.toUpperCase() : 'con ngựa');
    }

    checkNoLeak(room, SECRET);

    if (room.phase === 'result' && room.result && room.result.round > rounds) {
      rounds = room.result.round;
      const r = room.result;
      eq(room.strokes.length <= room.totalTurns, true, 'at most two marks per artist');
      eq(r.caught, isCaught(r.tally, r.fakeId), 'caught matches the tally');
      if (r.caught && r.guess && r.title === SECRET) eq(r.guessCorrect, r.guess === SECRET.toUpperCase(), 'guess judged right');
      const expected = scoreRound({
        qmId: r.qmId,
        fakeId: r.fakeId,
        artistIds: room.artists.map((a) => a.id),
        caught: r.caught,
        guessCorrect: r.guessCorrect,
      });
      eq(r.deltas, expected.deltas, 'deltas follow the scoring table');
      for (const [id, d] of Object.entries(r.deltas)) scores.set(id, (scores.get(id) ?? 0) + d);
      for (const p of room.players) eq(p.score, scores.get(p.id), 'running score adds up');
      ok(!JSON.stringify(room.publicState()).includes('"gallery":[{'), 'gallery stays private until the end');
      room.next();
      continue;
    }

    clock.now += 100;
    room.tick();
  }

  eq(room.phase, 'gameEnd', `game ${seed} finished`);
  const best = Math.max(...room.players.map((p) => p.score));
  ok(best >= 5, 'someone reached the target');
  for (const id of room.winnerIds) eq(room.find(id)!.score, best, 'winners have the top score');
  eq(room.publicState().gallery.length, rounds, 'one painting per round in the gallery');
  return rounds;
}

/* ---------------------------------------------------------- edge cases */

function edgeCases(): void {
  // not enough players
  {
    const { room } = makeRoom(3);
    room.addPlayer({ id: 'a', name: 'A', avatar: 0 });
    room.addPlayer({ id: 'b', name: 'B', avatar: 0 });
    room.addPlayer({ id: 'c', name: 'C', avatar: 0 });
    ok(room.start()?.includes('4'), 'rotate mode needs 4 players');
    room.updateSettings({ qmMode: 'auto' });
    eq(room.start(), null, 'auto mode starts with 3');
  }

  // a dropped drawer loses the turn after the grace period, and the host moves on
  {
    const { room, clock } = makeRoom(5);
    for (const id of ['a', 'b', 'c', 'd']) room.addPlayer({ id, name: id.toUpperCase(), avatar: 0 });
    room.updateSettings({ qmMode: 'auto' });
    room.start();
    clock.now += 3000;
    room.tick();
    eq(room.phase, 'reveal', 'server set the title');
    for (const p of room.artists) room.markSeen(p.id);
    eq(room.phase, 'drawing', 'everyone saw their card');
    const drawer = room.drawerId!;
    room.setConnected(drawer, false);
    clock.now += GRACE_MS - 1000;
    room.tick();
    eq(room.drawerId, drawer, 'still their turn inside the grace period');
    clock.now += 2000;
    room.tick();
    ok(room.drawerId !== drawer, 'turn skipped once the grace period is over');

    room.setConnected('a', false);
    clock.now += 31_000;
    room.tick();
    ok(room.hostId !== 'a' || room.find('a')!.connected, 'host passes on after 30s away');
  }

  // someone who arrives mid-round watches, then plays the next round
  {
    const { room, clock } = makeRoom(8);
    for (const id of ['a', 'b', 'c', 'd']) room.addPlayer({ id, name: id, avatar: 0, isBot: id !== 'a' });
    room.start();
    room.addPlayer({ id: 'late', name: 'Late', avatar: 0 });
    eq(room.find('late')!.inRound, false, 'late arrival watches');
    eq(room.privateState('late').role, 'watch', 'watchers get no card');
    for (let i = 0; i < 20_000 && room.phase !== 'result'; i++) {
      if (room.phase === 'setup' && room.qmId === 'a') room.submitSetup('a', { category: 'X', title: 'Y' });
      if (room.phase === 'reveal') room.markSeen('a');
      if (room.phase === 'drawing' && room.drawerId === 'a') {
        room.liveBegin('a');
        room.livePoints('a', [1, 1]);
        room.liveEnd('a');
        room.commit('a');
      }
      if (room.phase === 'voting' && room.qmId !== 'a' && clock.now >= room.votingOpensAt!) {
        room.vote('a', room.artists.find((p) => p.id !== 'a')!.id);
      }
      if (room.phase === 'guess' && room.fakeId === 'a') room.guess('a', 'Y');
      clock.now += 100;
      room.tick();
    }
    ok(!room.turnOrder.includes('late'), 'watchers do not draw');
    room.next();
    if (room.phase === 'setup') eq(room.find('late')!.inRound, true, 'late arrival plays the next round');
  }

  // a player who leaves mid-round is skipped, then removed
  {
    const { room, clock } = makeRoom(11);
    for (const id of ['a', 'b', 'c', 'd', 'e']) room.addPlayer({ id, name: id, avatar: 0, isBot: id !== 'a' });
    room.updateSettings({ qmMode: 'auto' });
    room.start();
    room.removePlayer('a');
    eq(room.find('a')?.left, true, 'mid-game leave keeps the seat for now');
    for (let i = 0; i < 20_000 && room.phase !== 'result'; i++) {
      clock.now += 100;
      room.tick();
    }
    eq(room.phase, 'result', 'round finishes without them');
    room.next();
    eq(room.find('a'), undefined, 'removed when the next round starts');
  }

  // a tie at the top lets the fake escape
  {
    const { room, clock } = makeRoom(17);
    for (const id of ['a', 'b', 'c', 'd']) room.addPlayer({ id, name: id, avatar: 0 });
    room.updateSettings({ qmMode: 'auto' });
    room.start();
    clock.now += 3000;
    room.tick();
    for (const p of room.artists) room.markSeen(p.id);
    while (room.phase === 'drawing') {
      const id = room.drawerId!;
      room.liveBegin(id);
      room.livePoints(id, [10, 10]);
      room.liveEnd(id);
      room.commit(id);
    }
    clock.now = room.votingOpensAt!;
    const fake = room.fakeId!;
    const others = room.artists.map((p) => p.id).filter((id) => id !== fake);
    room.vote(others[0], fake);
    room.vote(others[1], fake);
    room.vote(fake, others[0]);
    room.vote(others[2], others[0]);
    // fake 2, others[0] 2 → tie
    eq(room.phase, 'result', 'a tie goes straight to the result');
    eq(room.result!.caught, false, 'tie at the top: not caught');
    eq(room.find(fake)!.score, 2, 'escaped fake scores 2');
  }
}

/* ------------------------------------------------------------------ run */

rules();
edgeCases();

let games = 0;
let totalRounds = 0;
for (let seed = 1; seed <= 150; seed++) {
  const rng = mulberry32(seed * 7919);
  const mode = seed % 3 === 0 ? 'auto' : 'rotate';
  const total = 4 + Math.floor(rng() * 9); // 4..12
  const humans = Math.floor(rng() * (total + 1));
  totalRounds += playGame(seed, humans, total - humans, mode);
  games++;
}

console.log(`✓ ${checks.toLocaleString()} checks passed — ${games} games, ${totalRounds} rounds`);
