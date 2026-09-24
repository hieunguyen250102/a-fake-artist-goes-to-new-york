/**
 * One table: membership, the round state machine, and the clock.
 * Every rule decision happens here; clients only ever send intents.
 *
 * Time-driven things (timeouts, bots, players who dropped) run in `tick()`,
 * which the server calls a few times a second. Both the clock and the random
 * source are injectable so the test suite can play whole games instantly.
 */

import {
  AVATAR_COUNT,
  MAX_PLAYERS,
  MAX_STROKE_NUMBERS,
  PEN_COLORS,
  answerMatches,
  buildTurnOrder,
  isCaught,
  minPlayersFor,
  nextQmSeat,
  parseAlts,
  sanitizePoints,
  scoreRound,
  tallyVotes,
  winnersOf,
} from '../../shared/engine';
import { WORD_BANK, pick, wordsFor } from '../../shared/words';
import type {
  Artwork,
  ChatMessage,
  GameState,
  Phase,
  PrivateState,
  PublicPlayer,
  RoundResult,
  Settings,
  SetupInput,
  Stroke,
} from '../../shared/types';
import { botStroke } from './bot';

/** a dropped player keeps their turn this long before it is skipped */
export const GRACE_MS = 12_000;
/** the host's powers pass on after this long away */
const HOST_GRACE_MS = 30_000;
export const SETUP_MS = 90_000;
export const REVEAL_MS = 20_000;
export const VOTE_COUNTDOWN_MS = 3_600;
export const VOTE_MS = 45_000;
export const GUESS_MS = 50_000;
export const RESULT_MS = 25_000;
/** bot lines are streamed a couple of points at a time, so they look hand-drawn */
const BOT_POINTS_PER_TICK = 3;

export interface Player {
  id: string;
  name: string;
  avatar: number;
  color: number;
  isBot: boolean;
  connected: boolean;
  socketId?: string;
  disconnectedAt?: number;
  score: number;
  inRound: boolean;
  seen: boolean;
  left: boolean;
}

/** What a tick produced, for the server to send out. */
export interface TickOutput {
  changed: boolean;
  live: { event: 'live:begin' | 'live:pts' | 'live:end'; data: unknown }[];
}

export class Room {
  code: string;
  players: Player[] = [];
  hostId = '';
  phase: Phase = 'lobby';
  settings: Settings = { qmMode: 'rotate', target: 5, turnSeconds: 40 };

  round = 0;
  qmId: string | null = null;
  category: string | null = null;
  fakeId: string | null = null;
  turnOrder: string[] = [];
  turnIndex = 0;
  strokes: Stroke[] = [];
  live: Stroke | null = null;
  liveDone = false;
  phaseStartedAt: number;
  deadline: number | null = null;
  votingOpensAt: number | null = null;
  votes: Record<string, string> = {};
  result: RoundResult | null = null;
  gallery: Artwork[] = [];
  winnerIds: string[] = [];

  chat: ChatMessage[] = [];
  lastActivity: number;

  private title = '';
  private alts: string[] = [];
  private qmSeat = -1;
  private chatSeq = 0;
  /** system lines waiting to be pushed to clients */
  private outbox: ChatMessage[] = [];
  /** when the next bot decision is due (QM setup, drawing, guessing) */
  private botAt = 0;
  private botVoteAt = new Map<string, number>();
  private botLine: { points: number[]; shown: number } | null = null;

  constructor(
    code: string,
    private rng: () => number = Math.random,
    private clock: () => number = Date.now,
  ) {
    this.code = code;
    this.phaseStartedAt = clock();
    this.lastActivity = clock();
  }

  /* ------------------------------------------------------------ lookups */

  find(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  get roundPlayers(): Player[] {
    return this.players.filter((p) => p.inRound);
  }

  /** everyone drawing this round (the fake included), minus the QM */
  get artists(): Player[] {
    return this.players.filter((p) => p.inRound && p.id !== this.qmId);
  }

  get totalTurns(): number {
    return this.turnOrder.length * 2;
  }

  get drawerId(): string | null {
    if (this.phase !== 'drawing' || !this.turnOrder.length) return null;
    return this.turnOrder[this.turnIndex % this.turnOrder.length];
  }

  /** gone for good, or dropped for longer than the grace period */
  private away(p: Player | undefined, now = this.clock()): boolean {
    if (!p) return true;
    if (p.isBot) return false;
    if (p.left) return true;
    return !p.connected && now - (p.disconnectedAt ?? now) > GRACE_MS;
  }

  /* --------------------------------------------------------- membership */

  addPlayer(p: { id: string; name: string; avatar: number; isBot?: boolean; socketId?: string }): Player | null {
    if (this.players.length >= MAX_PLAYERS) return null;
    const taken = new Set(this.players.map((x) => x.color));
    const free = PEN_COLORS.map((_, i) => i).filter((i) => !taken.has(i));
    const player: Player = {
      id: p.id,
      name: p.name,
      avatar: ((p.avatar % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT,
      color: free.length ? pick(free, this.rng) : 0,
      isBot: !!p.isBot,
      connected: true,
      socketId: p.socketId,
      score: 0,
      // someone arriving mid-round watches until the next one starts
      inRound: this.phase === 'lobby',
      seen: false,
      left: false,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    if (this.phase === 'lobby') this.system(`${player.name} vào phòng`);
    else this.system(`${player.name} vào xem — sẽ chơi từ vòng sau`);
    this.touch();
    return player;
  }

  /** Leaving the lobby removes you; leaving mid-game keeps your seat until the round ends. */
  removePlayer(id: string): void {
    const p = this.find(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.phase === 'gameEnd' || !p.inRound) {
      this.players = this.players.filter((x) => x.id !== id);
      this.system(`${p.name} rời phòng`);
    } else {
      p.left = true;
      p.connected = false;
      p.socketId = undefined;
      this.system(`${p.name} đã rời bàn`);
    }
    if (this.hostId === id) this.passHost();
    this.touch();
  }

  private passHost(): void {
    const next = this.players.find((x) => !x.isBot && !x.left && x.connected) ?? this.players.find((x) => !x.isBot && !x.left);
    this.hostId = next ? next.id : '';
  }

  setConnected(id: string, connected: boolean, socketId?: string): void {
    const p = this.find(id);
    if (!p) return;
    p.connected = connected;
    p.socketId = connected ? socketId : undefined;
    p.disconnectedAt = connected ? undefined : this.clock();
    if (connected) p.left = false;
    this.touch();
  }

  setColor(id: string, color: number): string | null {
    const p = this.find(id);
    if (!p) return 'Không có trong phòng';
    if (!Number.isInteger(color) || color < 0 || color >= PEN_COLORS.length) return 'Màu không hợp lệ';
    if (this.phase !== 'lobby' && this.phase !== 'result' && this.phase !== 'gameEnd') return 'Đổi màu bút giữa các vòng nhé';
    if (this.players.some((x) => x.id !== id && x.color === color)) return 'Màu này có người dùng rồi';
    p.color = color;
    this.touch();
    return null;
  }

  updateSettings(raw: Partial<Settings>): string | null {
    if (this.phase !== 'lobby') return 'Chỉ đổi luật khi đang ở phòng chờ';
    const s = { ...this.settings };
    if (raw.qmMode === 'rotate' || raw.qmMode === 'auto') s.qmMode = raw.qmMode;
    if (typeof raw.target === 'number' && [3, 5, 7, 10].includes(raw.target)) s.target = raw.target;
    if (typeof raw.turnSeconds === 'number' && [20, 30, 40, 60, 90].includes(raw.turnSeconds)) s.turnSeconds = raw.turnSeconds;
    this.settings = s;
    this.touch();
    return null;
  }

  /* --------------------------------------------------------------- game */

  start(): string | null {
    if (this.phase !== 'lobby') return 'Ván đã bắt đầu';
    const need = minPlayersFor(this.settings.qmMode);
    if (this.players.length < need) return `Cần ít nhất ${need} người`;
    for (const p of this.players) p.score = 0;
    this.round = 0;
    this.qmSeat = -1;
    this.gallery = [];
    this.winnerIds = [];
    this.system(`Bắt đầu ván — ai đạt ${this.settings.target} điểm trước sẽ thắng`);
    this.beginRound();
    return null;
  }

  private setPhase(phase: Phase, deadline: number | null): void {
    this.phase = phase;
    this.phaseStartedAt = this.clock();
    this.deadline = deadline;
    this.touch();
  }

  private beginRound(): void {
    // people who walked out are gone for good now; late arrivals join in
    const leaving = this.players.filter((p) => p.left);
    if (leaving.length) {
      this.players = this.players.filter((p) => !p.left);
      if (!this.find(this.hostId)) this.passHost();
    }
    for (const p of this.players) {
      p.inRound = true;
      p.seen = false;
    }

    const need = minPlayersFor(this.settings.qmMode);
    if (this.players.length < need) {
      this.system(`Không đủ người để chơi tiếp (cần ${need}) — quay về phòng chờ`);
      this.toLobby();
      return;
    }

    this.round += 1;
    this.strokes = [];
    this.live = null;
    this.liveDone = false;
    this.votes = {};
    this.result = null;
    this.fakeId = null;
    this.category = null;
    this.title = '';
    this.alts = [];
    this.turnOrder = [];
    this.turnIndex = 0;
    this.votingOpensAt = null;
    this.botLine = null;
    this.botVoteAt.clear();

    const now = this.clock();
    if (this.settings.qmMode === 'rotate') {
      this.qmSeat = nextQmSeat(this.players.length, this.qmSeat, this.rng);
      this.qmId = this.players[this.qmSeat].id;
    } else {
      this.qmId = null;
    }
    const qm = this.qmId ? this.find(this.qmId) : undefined;

    this.setPhase('setup', now + SETUP_MS);
    this.botAt = now + 1200 + this.rng() * 800;
    this.system(qm ? `Vòng ${this.round} — ${qm.name} ra đề` : `Vòng ${this.round} — máy ra đề, mọi người cùng vẽ`);
  }

  /** The QM's form: category, title, optional extra answers and first artist. */
  submitSetup(playerId: string, input: SetupInput): string | null {
    if (this.phase !== 'setup') return 'Không phải lúc ra đề';
    if (playerId !== this.qmId) return 'Chỉ người ra đề mới được đặt đề';
    const category = typeof input?.category === 'string' ? input.category.replace(/\s+/g, ' ').trim() : '';
    const title = typeof input?.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
    if (!category || category.length > 30) return 'Chủ đề từ 1 đến 30 ký tự';
    if (!title || title.length > 40) return 'Tên tranh từ 1 đến 40 ký tự';
    const firstId = typeof input.firstId === 'string' && this.artists.some((a) => a.id === input.firstId) ? input.firstId : null;
    this.deal(category, title, parseAlts(input.alts), firstId);
    return null;
  }

  private autoSetup(reason?: string): void {
    const cat = pick(WORD_BANK, this.rng);
    if (reason) this.system(reason);
    this.deal(cat.name, pick(cat.words, this.rng), [], null);
  }

  /** Deal the title cards: one X, the rest the title. */
  private deal(category: string, title: string, alts: string[], firstId: string | null): void {
    const artists = this.artists;
    this.category = category;
    this.title = title;
    this.alts = alts;
    this.fakeId = pick(artists, this.rng).id;
    this.turnOrder = buildTurnOrder(
      this.roundPlayers.map((p) => p.id),
      this.qmId,
      firstId,
      this.rng,
    );
    for (const p of this.players) p.seen = p.isBot || p.id === this.qmId || !p.inRound;
    this.setPhase('reveal', this.clock() + REVEAL_MS);
    this.system(`Chủ đề: ${category}. Mỗi hoạ sĩ lật thẻ của mình — đừng để lộ!`);
  }

  markSeen(playerId: string): string | null {
    if (this.phase !== 'reveal') return null;
    const p = this.find(playerId);
    if (!p || !p.inRound) return null;
    p.seen = true;
    this.touch();
    if (this.everyoneSeen()) this.startDrawing();
    return null;
  }

  private everyoneSeen(): boolean {
    return this.artists.every((p) => p.seen || this.away(p));
  }

  private startDrawing(): void {
    this.turnIndex = 0;
    this.setPhase('drawing', null);
    this.beginTurn();
  }

  private beginTurn(): void {
    const now = this.clock();
    this.live = null;
    this.liveDone = false;
    this.botLine = null;
    this.deadline = now + this.settings.turnSeconds * 1000;
    this.botAt = now + 700 + this.rng() * 1100;
    this.touch();
  }

  /* ------------------------------------------------------ live drawing */

  private canDraw(playerId: string): Player | null {
    if (this.phase !== 'drawing' || this.drawerId !== playerId) return null;
    const p = this.find(playerId);
    return p && !p.left ? p : null;
  }

  liveBegin(playerId: string): Stroke | null {
    const p = this.canDraw(playerId);
    if (!p) return null;
    this.live = { playerId, color: p.color, points: [] };
    this.liveDone = false;
    this.touch();
    return this.live;
  }

  /** Append streamed points; returns what was accepted, to relay to the table. */
  livePoints(playerId: string, raw: unknown): number[] | null {
    if (!this.canDraw(playerId) || !this.live || this.liveDone) return null;
    const room = MAX_STROKE_NUMBERS - this.live.points.length;
    if (room <= 0) return null;
    const pts = sanitizePoints(raw, 800);
    if (!pts || !pts.length) return null;
    const accepted = pts.slice(0, room - (room % 2));
    this.live.points.push(...accepted);
    return accepted;
  }

  liveEnd(playerId: string): boolean {
    if (!this.canDraw(playerId) || !this.live) return false;
    if (!this.live.points.length) {
      this.live = null;
      return false;
    }
    this.liveDone = true;
    return true;
  }

  liveClear(playerId: string): boolean {
    if (!this.canDraw(playerId)) return false;
    this.live = null;
    this.liveDone = false;
    return true;
  }

  commit(playerId: string): string | null {
    if (!this.canDraw(playerId)) return 'Chưa tới lượt bạn';
    if (!this.live || this.live.points.length < 2) return 'Bạn chưa vẽ gì';
    this.commitLive();
    return null;
  }

  private commitLive(): void {
    if (this.live && this.live.points.length >= 2) {
      // a single tap is a dot: repeat the point so it renders with a round cap
      if (this.live.points.length === 2) this.live.points.push(this.live.points[0], this.live.points[1]);
      this.strokes.push(this.live);
    }
    this.advanceTurn();
  }

  private skipTurn(reason: string): void {
    const p = this.drawerId ? this.find(this.drawerId) : undefined;
    if (p) this.system(`${p.name} ${reason}`);
    this.advanceTurn();
  }

  private advanceTurn(): void {
    this.live = null;
    this.liveDone = false;
    this.botLine = null;
    this.turnIndex += 1;
    if (this.turnIndex >= this.totalTurns) this.openVoting();
    else this.beginTurn();
  }

  /* ------------------------------------------------------------ voting */

  private openVoting(): void {
    const now = this.clock();
    this.votes = {};
    this.votingOpensAt = now + VOTE_COUNTDOWN_MS;
    this.setPhase('voting', this.votingOpensAt + VOTE_MS);
    this.botVoteAt.clear();
    for (const p of this.artists) {
      if (p.isBot) this.botVoteAt.set(p.id, this.votingOpensAt + 1200 + this.rng() * 5000);
    }
    this.system('Hết hai vòng vẽ! 3, 2, 1… chỉ vào hoạ sĩ dởm!');
  }

  vote(voterId: string, targetId: string): string | null {
    if (this.phase !== 'voting') return 'Chưa tới lúc chỉ tay';
    if (this.clock() < (this.votingOpensAt ?? 0) - 400) return 'Đợi đếm ngược xong đã';
    const artists = this.artists;
    const voter = artists.find((p) => p.id === voterId);
    if (!voter || voter.left) return 'Người ra đề không chỉ tay';
    if (voterId === targetId) return 'Không chỉ vào chính mình được';
    if (!artists.some((p) => p.id === targetId)) return 'Chỉ được chỉ vào hoạ sĩ';
    this.votes[voterId] = targetId;
    this.touch();
    if (this.allVoted()) this.closeVoting();
    return null;
  }

  private allVoted(): boolean {
    const voters = this.artists.filter((p) => !this.away(p));
    return voters.length > 0 && voters.every((p) => this.votes[p.id]);
  }

  private closeVoting(): void {
    const artists = this.artists;
    const tally = tallyVotes(this.votes, artists.map((p) => p.id));
    const fake = this.find(this.fakeId!)!;
    const caught = isCaught(tally, fake.id);
    if (!caught) {
      this.finishRound(tally, false, null, null);
      return;
    }
    this.system(`${fake.name} bị chỉ nhiều nhất — và đúng là hoạ sĩ dởm! Còn một cơ hội đoán tên bức tranh…`);
    this.pendingTally = tally;
    this.setPhase('guess', this.clock() + GUESS_MS);
    this.botAt = this.clock() + 2500 + this.rng() * 2500;
  }

  /** kept between closing the vote and the fake's guess */
  private pendingTally: Record<string, number> = {};

  guess(playerId: string, raw: unknown): string | null {
    if (this.phase !== 'guess') return 'Không phải lúc đoán';
    if (playerId !== this.fakeId) return 'Chỉ hoạ sĩ dởm được đoán';
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (!text) return 'Hãy nhập tên bức tranh';
    this.finishRound(this.pendingTally, true, text, answerMatches(this.title, this.alts, text));
    return null;
  }

  private finishRound(
    tally: Record<string, number>,
    caught: boolean,
    guess: string | null,
    guessCorrect: boolean | null,
  ): void {
    const fakeId = this.fakeId!;
    const artistIds = this.artists.map((p) => p.id);
    const { winner, deltas } = scoreRound({ qmId: this.qmId, fakeId, artistIds, caught, guessCorrect });
    for (const [id, d] of Object.entries(deltas)) {
      const p = this.find(id);
      if (p) p.score += d;
    }
    const fake = this.find(fakeId);
    this.result = {
      round: this.round,
      fakeId,
      qmId: this.qmId,
      category: this.category ?? '',
      title: this.title,
      votes: { ...this.votes },
      tally,
      caught,
      guess,
      guessCorrect,
      winner,
      deltas,
    };
    this.gallery.push({
      round: this.round,
      category: this.category ?? '',
      title: this.title,
      fakeId,
      fakeName: fake?.name ?? '?',
      winner,
      strokes: this.strokes,
    });
    this.setPhase('result', this.clock() + RESULT_MS);

    const who = fake?.name ?? 'Hoạ sĩ dởm';
    if (!caught) this.system(`${who} thoát! Bức tranh là «${this.title}». Hoạ sĩ dởm${this.qmId ? ' và người ra đề' : ''} +2.`);
    else if (guessCorrect) this.system(`${who} đoán đúng «${this.title}»! Hoạ sĩ dởm${this.qmId ? ' và người ra đề' : ''} +2.`);
    else this.system(`${who} đoán ${guess ? `«${guess}»` : 'không kịp'} — sai! Bức tranh là «${this.title}». Các hoạ sĩ +1.`);
  }

  /** From the score screen to the next round, or to the finale. */
  next(): string | null {
    if (this.phase !== 'result') return 'Chưa xong vòng này';
    const winners = winnersOf(
      this.players.filter((p) => !p.left),
      this.settings.target,
    );
    if (winners.length) {
      this.winnerIds = winners;
      this.setPhase('gameEnd', null);
      const names = winners.map((id) => this.find(id)?.name).join(', ');
      this.system(`${names} thắng chung cuộc!`);
      return null;
    }
    this.beginRound();
    return null;
  }

  resetToLobby(): void {
    this.players = this.players.filter((p) => !p.left);
    for (const p of this.players) p.score = 0;
    this.gallery = [];
    this.winnerIds = [];
    this.round = 0;
    this.toLobby();
  }

  private toLobby(): void {
    for (const p of this.players) {
      p.inRound = true;
      p.seen = false;
    }
    this.qmId = null;
    this.fakeId = null;
    this.category = null;
    this.strokes = [];
    this.live = null;
    this.result = null;
    this.votingOpensAt = null;
    this.setPhase('lobby', null);
  }

  /* -------------------------------------------------------------- clock */

  /**
   * Runs whatever the clock says is due: bot moves, timeouts, seats whose
   * owner dropped. Returns what changed so the server can tell the table.
   */
  tick(): TickOutput {
    const now = this.clock();
    const out: TickOutput = { changed: false, live: [] };
    const before = `${this.phase}:${this.turnIndex}:${this.hostId}:${Object.keys(this.votes).length}`;

    const host = this.find(this.hostId);
    if (host && !host.connected && now - (host.disconnectedAt ?? now) > HOST_GRACE_MS) {
      const other = this.players.find((p) => !p.isBot && p.connected && !p.left);
      if (other) {
        this.hostId = other.id;
        this.system(`${other.name} giờ là chủ phòng`);
      }
    }

    switch (this.phase) {
      case 'setup': {
        const qm = this.qmId ? this.find(this.qmId) : undefined;
        if (!qm || qm.isBot) {
          if (now >= this.botAt) this.autoSetup();
        } else if (this.away(qm, now)) {
          this.autoSetup(`${qm.name} vắng mặt — máy ra đề giúp`);
        } else if (this.deadline && now >= this.deadline) {
          this.autoSetup(`${qm.name} hết giờ — máy ra đề giúp`);
        }
        break;
      }

      case 'reveal':
        if (this.everyoneSeen() || (this.deadline && now >= this.deadline)) this.startDrawing();
        break;

      case 'drawing': {
        const drawer = this.drawerId ? this.find(this.drawerId) : undefined;
        if (!drawer) {
          this.advanceTurn();
        } else if (drawer.isBot) {
          this.tickBotDrawing(drawer, now, out);
        } else if (this.away(drawer, now)) {
          if (this.live && this.live.points.length >= 2) this.commitLive();
          else this.skipTurn('vắng mặt — bỏ lượt');
        } else if (this.deadline && now >= this.deadline) {
          // time's up: whatever is on the paper counts as the mark
          if (this.live && this.live.points.length >= 2) this.commitLive();
          else this.skipTurn('hết giờ — bỏ lượt');
        }
        break;
      }

      case 'voting': {
        for (const [id, at] of this.botVoteAt) {
          if (now < at || this.phase !== 'voting') continue;
          this.botVoteAt.delete(id);
          const choices = this.artists.filter((p) => p.id !== id);
          if (choices.length) this.vote(id, pick(choices, this.rng).id);
        }
        if (this.phase === 'voting' && (this.allVoted() || (this.deadline && now >= this.deadline))) this.closeVoting();
        break;
      }

      case 'guess': {
        const fake = this.fakeId ? this.find(this.fakeId) : undefined;
        if (fake?.isBot) {
          if (now >= this.botAt) {
            const known = wordsFor(this.category ?? '');
            this.guess(fake.id, known.length ? pick(known, this.rng) : 'Không biết');
          }
        } else if (this.away(fake, now) || (this.deadline && now >= this.deadline)) {
          this.finishRound(this.pendingTally, true, null, false);
        }
        break;
      }

      case 'result':
        if (this.deadline && now >= this.deadline) this.next();
        break;
    }

    const after = `${this.phase}:${this.turnIndex}:${this.hostId}:${Object.keys(this.votes).length}`;
    out.changed = before !== after || out.live.some((e) => e.event === 'live:begin');
    return out;
  }

  private tickBotDrawing(bot: Player, now: number, out: TickOutput): void {
    if (!this.botLine) {
      if (now < this.botAt) return;
      this.botLine = { points: botStroke(this.strokes, this.rng), shown: 0 };
      this.live = { playerId: bot.id, color: bot.color, points: [] };
      out.live.push({ event: 'live:begin', data: { playerId: bot.id, color: bot.color } });
      return;
    }
    const line = this.botLine;
    if (line.shown < line.points.length) {
      const chunk = line.points.slice(line.shown, line.shown + BOT_POINTS_PER_TICK * 2);
      line.shown += chunk.length;
      this.live!.points.push(...chunk);
      out.live.push({ event: 'live:pts', data: { pts: chunk } });
      if (line.shown >= line.points.length) {
        this.liveDone = true;
        out.live.push({ event: 'live:end', data: {} });
        this.botAt = now + 500;
      }
      return;
    }
    if (now >= this.botAt) this.commitLive();
  }

  /* --------------------------------------------------------------- chat */

  addChat(playerId: string, raw: string): ChatMessage | null {
    const p = this.find(playerId);
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!p || !text) return null;
    const msg: ChatMessage = {
      id: ++this.chatSeq,
      playerId: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      text,
      at: this.clock(),
    };
    this.pushChat(msg);
    this.touch();
    return msg;
  }

  private system(text: string): void {
    const msg: ChatMessage = { id: ++this.chatSeq, playerId: '', name: '', avatar: 0, color: 0, text, at: this.clock(), system: true };
    this.pushChat(msg);
    this.outbox.push(msg);
  }

  private pushChat(msg: ChatMessage): void {
    this.chat.push(msg);
    if (this.chat.length > 80) this.chat.shift();
  }

  /** Announcements made since the last call, for the server to broadcast. */
  drainSystem(): ChatMessage[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /* ----------------------------------------------------------- snapshots */

  touch(): void {
    this.lastActivity = this.clock();
  }

  publicState(): GameState {
    const finished = this.phase === 'result' || this.phase === 'gameEnd';
    const players: PublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      isBot: p.isBot,
      connected: p.connected,
      score: p.score,
      inRound: p.inRound,
      seen: p.seen,
      voted: this.phase === 'voting' ? !!this.votes[p.id] : false,
      left: p.left,
    }));
    return {
      roomCode: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      players,
      round: this.round,
      qmId: this.qmId,
      category: this.phase === 'setup' ? null : this.category,
      turnOrder: this.turnOrder,
      turnIndex: this.turnIndex,
      strokes: this.strokes,
      live: this.live,
      liveDone: this.liveDone,
      phaseStartedAt: this.phaseStartedAt,
      deadline: this.deadline,
      votingOpensAt: this.phase === 'voting' ? this.votingOpensAt : null,
      guessFakeId: this.phase === 'guess' ? this.fakeId : null,
      votes: this.phase === 'guess' || finished ? this.votes : null,
      result: finished ? this.result : null,
      gallery: this.phase === 'gameEnd' ? this.gallery : [],
      winnerIds: this.winnerIds,
      now: this.clock(),
    };
  }

  privateState(playerId: string): PrivateState {
    const p = this.find(playerId);
    const myVote = this.phase === 'voting' ? (this.votes[playerId] ?? null) : null;
    const dealt = !!this.fakeId && this.phase !== 'lobby';
    if (!p || !p.inRound || this.phase === 'lobby' || this.phase === 'gameEnd') {
      return { role: 'watch', title: null, fakeId: null, myVote };
    }
    if (playerId === this.qmId) {
      return { role: 'qm', title: dealt ? this.title : null, fakeId: dealt ? this.fakeId : null, myVote };
    }
    if (dealt && playerId === this.fakeId) return { role: 'fake', title: null, fakeId: null, myVote };
    return { role: 'artist', title: dealt ? this.title : null, fakeId: null, myVote };
  }
}
