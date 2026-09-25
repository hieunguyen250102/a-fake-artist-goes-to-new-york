/**
 * Realtime server — Express + Socket.IO.
 * Deploys as a single always-on web service (Render, Fly, Railway…).
 */

import './env';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';

import { Room } from './room';
import { authError, authHandler, originPolicy, socketAuth } from 'oink-kit/server';
import { auth, type User } from './auth';
import { AVATAR_COUNT, MAX_PLAYERS } from '../../shared/engine';
import type { SetupInput, Settings } from '../../shared/types';

const PORT = Number(process.env.PORT) || 4000;
/** CLIENT_ORIGIN: comma list, `*` wildcards allowed (https://game-*.vercel.app); empty = any. */
const origins = originPolicy(process.env.CLIENT_ORIGIN);

const app = express();
// Render (and most hosts) sit behind a proxy; the rate limits need the real client IP.
app.set('trust proxy', 1);
app.use(cors({ origin: origins.corsOrigin }));
app.use(express.json({ limit: '4kb' }));
// POST /auth/request {email}, POST /auth/verify {email, code, challenge}
app.use(authHandler(auth));

const rooms = new Map<string, Room>();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    sockets: io.engine.clientsCount,
    // false means HOST_EMAILS is unset and *anyone* who logs in can open a table
    hostRestricted: auth.hostingIsRestricted(),
    // what CLIENT_ORIGIN resolved to, so a CORS mismatch can be spotted from outside
    allowedOrigins: origins.origins,
    uptime: process.uptime(),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: origins.corsOrigin, methods: ['GET', 'POST'] },
  pingInterval: 20000,
  pingTimeout: 25000,
  // a long marker line arrives in small batches; nothing legitimate is bigger
  maxHttpBufferSize: 64 * 1024,
});

/* ------------------------------------------------------------------ utils */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes

function newCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 14) : '';
  return n || 'Hoạ sĩ';
}

function cleanAvatar(avatar: unknown): number {
  const a = Number(avatar);
  return Number.isInteger(a) && a >= 0 && a < AVATAR_COUNT ? a : 0;
}

const BOT_NAMES = ['Picasso', 'Monet', 'Frida', 'Van Gogh', 'Dalí', 'Warhol', 'Matisse', 'Klimt', 'Hokusai', 'Banksy', 'Miró'];

/** The public snapshot to the whole table, and each seat its own secrets. */
function broadcast(room: Room): void {
  io.to(room.code).emit('state', room.publicState());
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('private', room.privateState(p.id));
  }
  flushSystem(room);
}

function flushSystem(room: Room): void {
  for (const msg of room.drainSystem()) io.to(room.code).emit('chat:msg', msg);
}

/*
 * One clock for every table. Timeouts, bots and dropped players are all
 * handled inside Room.tick(); here we only relay what it produced.
 */
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase === 'lobby') continue;
    const out = room.tick();
    for (const e of out.live) io.to(room.code).emit(e.event, e.data);
    if (out.changed) broadcast(room);
    else flushSystem(room);
  }
}, 80).unref();

/** Rooms nobody has touched for an hour are swept away. */
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [code, room] of rooms) {
      const anyoneHome = room.players.some((p) => p.connected && !p.isBot);
      if (!anyoneHome && room.lastActivity < cutoff) rooms.delete(code);
    }
  },
  5 * 60 * 1000,
).unref();

/* ---------------------------------------------------------------- sockets */

type Ack<T> = (res: T) => void;

/** Anyone may connect, but only a signed-in socket gets a seat. */
io.use(socketAuth(auth));

io.on('connection', (socket: Socket) => {
  const user: User | null = socket.data.user;
  let joinedCode: string | null = null;
  let playerId: string | null = null;
  const chatTimes: number[] = [];

  socket.emit('session', { user });

  const fail = (msg: string) => socket.emit('errorMsg', { message: msg });

  /** The same account open in two tabs: only the newest one owns the seat. */
  const ownsSeat = (room: Room) => !!playerId && room.find(playerId)?.socketId === socket.id;

  /** The room this socket sits in, if it still owns its seat there. */
  const myRoom = (): Room | null => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    return room && ownsSeat(room) ? room : null;
  };

  /** Run a rule check; report the error to this player or tell the table. */
  const act = (room: Room, err: string | null) => {
    if (err) fail(err);
    else broadcast(room);
  };

  const enter = (room: Room, pid: string, ack?: Ack<unknown>) => {
    socket.join(room.code);
    joinedCode = room.code;
    playerId = pid;
    ack?.({ roomCode: room.code });
    socket.emit('chat:history', room.chat);
    broadcast(room);
  };

  socket.on('room:create', ({ name, avatar }: { name: string; avatar: number }, ack?: Ack<unknown>) => {
    const denied = authError(user, { host: true });
    if (denied || !user) return ack?.({ error: denied });
    const code = newCode();
    const room = new Room(code);
    rooms.set(code, room);
    const player = room.addPlayer({ id: user.id, name: cleanName(name), avatar: cleanAvatar(avatar), socketId: socket.id });
    if (!player) return ack?.({ error: 'Không tạo được phòng' });
    enter(room, user.id, ack);
  });

  socket.on(
    'room:join',
    ({ roomCode, name, avatar }: { roomCode: string; name: string; avatar: number }, ack?: Ack<unknown>) => {
      const denied = authError(user);
      if (denied || !user) return ack?.({ error: denied });
      const code = (typeof roomCode === 'string' ? roomCode : '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return ack?.({ error: 'Không tìm thấy phòng' });

      if (room.find(user.id)) {
        // Back into a seat we already own — works mid-game too.
        room.setConnected(user.id, true, socket.id);
      } else if (!room.addPlayer({ id: user.id, name: cleanName(name), avatar: cleanAvatar(avatar), socketId: socket.id })) {
        return ack?.({ error: `Phòng đã đủ ${MAX_PLAYERS} người` });
      }
      enter(room, user.id, ack);
    },
  );

  socket.on('room:addBot', () => {
    const room = myRoom();
    if (!room || room.hostId !== playerId) return;
    if (room.phase !== 'lobby') return fail('Chỉ thêm bot ở phòng chờ');
    const used = new Set(room.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.players.length}`;
    const bot = room.addPlayer({
      id: `bot-${Math.random().toString(36).slice(2, 9)}`,
      name,
      avatar: Math.floor(Math.random() * AVATAR_COUNT),
      isBot: true,
    });
    if (!bot) return fail(`Phòng đã đủ ${MAX_PLAYERS} người`);
    broadcast(room);
  });

  socket.on('room:kick', ({ id }: { id: string }) => {
    const room = myRoom();
    if (!room || room.hostId !== playerId || room.phase !== 'lobby' || id === playerId) return;
    const target = room.find(id);
    if (!target) return;
    if (target.socketId) io.to(target.socketId).emit('kicked');
    room.removePlayer(id);
    broadcast(room);
  });

  socket.on('room:color', ({ color }: { color: number }) => {
    const room = myRoom();
    if (!room || !playerId) return;
    act(room, room.setColor(playerId, color));
  });

  socket.on('room:settings', (settings: Partial<Settings>) => {
    const room = myRoom();
    if (!room) return;
    if (room.hostId !== playerId) return fail('Chỉ chủ phòng mới đổi được luật');
    act(room, room.updateSettings(settings ?? {}));
  });

  socket.on('game:start', () => {
    const room = myRoom();
    if (!room) return;
    if (room.hostId !== playerId) return fail('Chỉ chủ phòng mới bắt đầu được');
    act(room, room.start());
  });

  socket.on('setup:submit', (input: SetupInput) => {
    const room = myRoom();
    if (!room || !playerId) return;
    act(room, room.submitSetup(playerId, input));
  });

  socket.on('reveal:seen', () => {
    const room = myRoom();
    if (!room || !playerId) return;
    room.markSeen(playerId);
    broadcast(room);
  });

  /* Drawing is streamed: begin → points… → end, then commit (or redo).
     Points go straight to the other sockets; the full state only on commit. */

  socket.on('draw:begin', () => {
    const room = myRoom();
    if (!room || !playerId) return;
    const live = room.liveBegin(playerId);
    if (live) socket.to(room.code).emit('live:begin', { playerId: live.playerId, color: live.color });
  });

  socket.on('draw:pts', ({ pts }: { pts: number[] }) => {
    const room = myRoom();
    if (!room || !playerId) return;
    const accepted = room.livePoints(playerId, pts);
    if (accepted) socket.to(room.code).emit('live:pts', { pts: accepted });
  });

  socket.on('draw:end', () => {
    const room = myRoom();
    if (!room || !playerId) return;
    if (room.liveEnd(playerId)) socket.to(room.code).emit('live:end', {});
    else socket.to(room.code).emit('live:clear', {});
  });

  socket.on('draw:redo', () => {
    const room = myRoom();
    if (!room || !playerId) return;
    if (room.liveClear(playerId)) socket.to(room.code).emit('live:clear', {});
  });

  socket.on('draw:commit', () => {
    const room = myRoom();
    if (!room || !playerId) return;
    act(room, room.commit(playerId));
  });

  socket.on('vote:cast', ({ targetId }: { targetId: string }) => {
    const room = myRoom();
    if (!room || !playerId) return;
    act(room, room.vote(playerId, targetId));
  });

  socket.on('guess:submit', ({ text }: { text: string }) => {
    const room = myRoom();
    if (!room || !playerId) return;
    act(room, room.guess(playerId, text));
  });

  socket.on('round:next', () => {
    const room = myRoom();
    if (!room) return;
    if (room.hostId !== playerId) return fail('Chờ chủ phòng tiếp tục');
    act(room, room.next());
  });

  socket.on('game:restart', () => {
    const room = myRoom();
    if (!room || room.hostId !== playerId) return;
    room.resetToLobby();
    broadcast(room);
  });

  socket.on('chat:send', ({ text }: { text: string }) => {
    const room = myRoom();
    if (!room || !playerId || typeof text !== 'string') return;
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > 5000) chatTimes.shift();
    if (chatTimes.length >= 5) return fail('Bạn chat nhanh quá, chậm lại chút');
    const msg = room.addChat(playerId, text);
    if (!msg) return;
    chatTimes.push(now);
    io.to(room.code).emit('chat:msg', msg);
  });

  socket.on('room:leave', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (room && playerId && ownsSeat(room)) {
      room.removePlayer(playerId);
      broadcast(room);
    }
    if (room) socket.leave(room.code);
    joinedCode = null;
  });

  socket.on('disconnect', () => {
    const room = joinedCode ? rooms.get(joinedCode) : null;
    if (!room || !playerId || !ownsSeat(room)) return;
    // In the lobby a seat is cheap; mid-game it waits for its owner.
    if (room.phase === 'lobby') room.removePlayer(playerId);
    else room.setConnected(playerId, false);
    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log(`Fake Artist server listening on :${PORT}`);
});
