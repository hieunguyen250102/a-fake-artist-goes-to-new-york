/**
 * End-to-end over real sockets: several signed-in players and a bot play a
 * whole game against a running dev server (no mail provider configured, so
 * login codes come back in the response).
 *
 *   npm run dev:server            (in one terminal)
 *   npx tsx server/test/e2e.ts    (in another; SERVER=http://… to point elsewhere)
 */

import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, GameState, PrivateState } from '../../shared/types';

const SERVER = process.env.SERVER ?? 'http://localhost:4000';
const TITLE = 'Hươu cao cổ';

interface Client {
  name: string;
  id: string;
  socket: Socket;
  state?: GameState;
  priv?: PrivateState;
  livePts: number;
  chat: ChatMessage[];
}

async function login(email: string): Promise<{ token: string; id: string }> {
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${SERVER}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json() as Promise<any>;
  };
  const req = await post('/auth/request', { email });
  assert.ok(req.ok && req.devCode, `dev login for ${email}: ${JSON.stringify(req)}`);
  const ver = await post('/auth/verify', { email, code: req.devCode, challenge: req.challenge });
  assert.ok(ver.ok, `verify ${email}`);
  return { token: ver.token, id: ver.user.id };
}

async function connect(name: string, email: string): Promise<Client> {
  const { token, id } = await login(email);
  const socket = io(SERVER, { auth: { token }, transports: ['websocket'] });
  const c: Client = { name, id, socket, livePts: 0, chat: [] };
  socket.on('state', (s: GameState) => (c.state = s));
  socket.on('private', (p: PrivateState) => (c.priv = p));
  socket.on('live:pts', ({ pts }: { pts: number[] }) => (c.livePts += pts.length));
  socket.on('chat:msg', (m: ChatMessage) => c.chat.push(m));
  socket.on('errorMsg', ({ message }: { message: string }) => console.log(`  [${name}] server says: ${message}`));
  await new Promise<void>((r) => socket.once('connect', () => r()));
  return c;
}

function emitAck<T>(c: Client, event: string, payload: unknown): Promise<T> {
  return new Promise((r) => c.socket.emit(event, payload, r));
}

async function until(label: string, cond: () => boolean, ms = 20000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function main() {
  const health = (await (await fetch(`${SERVER}/health`)).json()) as { ok: boolean };
  assert.equal(health.ok, true, 'server is up');

  const stamp = Date.now().toString(36);
  const players = await Promise.all(
    ['An', 'Bình', 'Chi', 'Dũng'].map((n, i) => connect(n, `e2e-${i}-${stamp}@example.com`)),
  );
  const [host, ...guests] = players;

  const created = await emitAck<{ roomCode?: string; error?: string }>(host, 'room:create', { name: host.name, avatar: 0 });
  assert.ok(created.roomCode, `room created: ${JSON.stringify(created)}`);
  const code = created.roomCode!;
  for (const g of guests) {
    const res = await emitAck<{ roomCode?: string }>(g, 'room:join', { roomCode: code.toLowerCase(), name: g.name, avatar: 3 });
    assert.equal(res.roomCode, code, `${g.name} joined`);
  }
  host.socket.emit('room:addBot');
  await until('5 players in lobby', () => host.state?.players.length === 5);
  console.log(`✓ room ${code}: 4 people + 1 bot`);

  // chat reaches everyone
  guests[0].socket.emit('chat:send', { text: 'Xin chào cả nhà!' });
  await until('chat delivered', () => players.every((p) => p.chat.some((m) => m.text === 'Xin chào cả nhà!')));
  console.log('✓ chat is realtime');

  // colours must be unique
  const taken = host.state!.players.find((p) => p.id === guests[1].id)!.color;
  host.socket.emit('room:color', { color: taken });
  await new Promise((r) => setTimeout(r, 200));
  assert.notEqual(host.state!.players.find((p) => p.id === host.id)!.color, taken, 'cannot take a used marker');

  host.socket.emit('room:settings', { target: 3, turnSeconds: 20 });
  host.socket.emit('game:start');

  let rounds = 0;
  const deadline = Date.now() + 5 * 60_000;
  while (host.state?.phase !== 'gameEnd') {
    if (Date.now() > deadline) throw new Error('game took too long');
    const s = host.state!;
    const phase = s.phase;

    if (phase === 'setup') {
      const qm = players.find((p) => p.id === s.qmId);
      if (qm) {
        qm.socket.emit('setup:submit', { category: 'Động vật', title: TITLE, alts: 'huou' });
        await until('cards dealt', () => host.state!.phase !== 'setup');
        // secrets: nobody but the QM knows the fake; the fake never sees the title
        const fakeId = qm.priv!.fakeId;
        assert.ok(fakeId, 'QM knows who the fake is');
        for (const p of players) {
          await until(`${p.name} private`, () => !!p.priv && p.priv.role !== 'watch' || p.id === qm.id);
          assert.ok(!JSON.stringify(p.state).includes(TITLE), 'title is not in anyone’s public state');
          if (p.id !== qm.id) assert.equal(p.priv!.fakeId, null, 'only the QM knows the fake');
          if (p.id === fakeId) assert.equal(p.priv!.title, null, 'the fake has no title');
          else if (p.id !== qm.id) assert.equal(p.priv!.title, TITLE, 'artists see the title');
        }
      } else {
        await until('bot QM deals', () => host.state!.phase !== 'setup');
      }
      continue;
    }

    if (phase === 'reveal') {
      for (const p of players) p.socket.emit('reveal:seen');
      await until('drawing starts', () => host.state!.phase !== 'reveal');
      continue;
    }

    if (phase === 'drawing') {
      const drawerId = s.turnOrder[s.turnIndex % s.turnOrder.length];
      const drawer = players.find((p) => p.id === drawerId);
      const turn = s.turnIndex;
      if (drawer) {
        const others = players.filter((p) => p !== drawer);
        const before = others.map((o) => o.livePts);
        drawer.socket.emit('draw:begin');
        drawer.socket.emit('draw:pts', { pts: [100 + turn * 20, 200, 150, 230, 200, 260] });
        drawer.socket.emit('draw:pts', { pts: [260, 280, 300, 300] });
        drawer.socket.emit('draw:end');
        await until('points streamed to the table', () => others.every((o, i) => o.livePts - before[i] >= 10));
        drawer.socket.emit('draw:commit');
      }
      await until('next turn', () => host.state!.turnIndex !== turn || host.state!.phase !== 'drawing');
      continue;
    }

    if (phase === 'voting') {
      // let the "3, 2, 1, point!" countdown finish
      await new Promise((r) => setTimeout(r, Math.max(0, (s.votingOpensAt ?? 0) - s.now) + 200));
      const artists = s.players.filter((p) => p.inRound && p.id !== s.qmId);
      const qm = players.find((p) => p.id === s.qmId);
      const fakeId = qm?.priv?.fakeId ?? null;
      for (const p of players) {
        if (p.id === s.qmId) continue;
        // everyone who knows points at the fake when there is a human QM to tell us; otherwise at the next artist
        const target =
          fakeId && fakeId !== p.id ? fakeId : artists[(artists.findIndex((a) => a.id === p.id) + 1) % artists.length].id;
        p.socket.emit('vote:cast', { targetId: target });
      }
      await until('vote closes', () => host.state!.phase !== 'voting', 60000);
      continue;
    }

    if (phase === 'guess') {
      const fake = players.find((p) => p.id === s.guessFakeId);
      if (fake) fake.socket.emit('guess:submit', { text: rounds % 2 ? 'hươu' : 'con mèo' });
      await until('guess resolved', () => host.state!.phase !== 'guess', 60000);
      continue;
    }

    if (phase === 'result') {
      const r = s.result!;
      rounds++;
      console.log(
        `✓ round ${r.round}: fake ${s.players.find((p) => p.id === r.fakeId)?.name}, ${r.caught ? 'caught' : 'escaped'}` +
          `${r.guess ? `, guessed «${r.guess}» ${r.guessCorrect ? '✔' : '✘'}` : ''} → ${r.winner} win · scores ${s.players.map((p) => `${p.name}:${p.score}`).join(' ')}`,
      );
      assert.equal(s.gallery.length, 0, 'gallery waits for the end');
      host.socket.emit('round:next');
      await until('next round', () => host.state!.phase !== 'result');
      continue;
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  const end = host.state!;
  assert.ok(end.winnerIds.length > 0, 'there is a winner');
  assert.equal(end.gallery.length, rounds, 'every round is in the gallery');
  console.log(`✓ game over after ${rounds} rounds — winner: ${end.players.filter((p) => end.winnerIds.includes(p.id)).map((p) => p.name).join(', ')}`);

  // reconnect: drop a socket and come back into the same seat
  const g = guests[2];
  g.socket.disconnect();
  await until('seat shows offline', () => host.state!.players.find((p) => p.id === g.id)?.connected === false);
  g.socket.connect();
  await new Promise<void>((r) => g.socket.once('connect', () => r()));
  const again = await emitAck<{ roomCode?: string }>(g, 'room:join', { roomCode: code, name: g.name, avatar: 3 });
  assert.equal(again.roomCode, code, 'rejoined');
  await until('seat back online', () => host.state!.players.find((p) => p.id === g.id)?.connected === true);
  console.log('✓ reconnect keeps the seat');

  host.socket.emit('game:restart');
  await until('back to lobby', () => host.state!.phase === 'lobby');
  console.log('✓ restart returns to the lobby');

  for (const p of players) p.socket.disconnect();
  console.log('All e2e checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('✘', err);
  process.exit(1);
});
