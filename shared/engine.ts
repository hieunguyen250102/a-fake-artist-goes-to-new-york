/**
 * The rules as pure functions — no I/O, no clocks. The server uses them to
 * referee; the client imports the same constants so both sides agree.
 */

/** Drawing paper, in canvas units (4:3 like the pad in the box). */
export const CANVAS_W = 1000;
export const CANVAS_H = 750;

export const MAX_PLAYERS = 12;
/** fewer than three artists and the vote means nothing */
export const MIN_ARTISTS = 3;
/** one mark can be long, but not unbounded (flat x,y numbers) */
export const MAX_STROKE_NUMBERS = 4000;

export const AVATAR_COUNT = 10;

/** The 12 markers from the box — saturated like real felt tips, never fluorescent. */
export const PEN_COLORS: { hex: string; name: string }[] = [
  { hex: '#d7443e', name: 'Đỏ' },
  { hex: '#ea7a2a', name: 'Cam' },
  { hex: '#dca22a', name: 'Vàng' },
  { hex: '#86b83c', name: 'Xanh mạ' },
  { hex: '#2d9658', name: 'Xanh lá' },
  { hex: '#1f9a9c', name: 'Ngọc' },
  { hex: '#3a8fd3', name: 'Da trời' },
  { hex: '#2f58b5', name: 'Xanh dương' },
  { hex: '#433f95', name: 'Chàm' },
  { hex: '#8a4db2', name: 'Tím' },
  { hex: '#d0478a', name: 'Hồng' },
  { hex: '#86573a', name: 'Nâu' },
];

export function minPlayersFor(mode: 'rotate' | 'auto'): number {
  return mode === 'rotate' ? MIN_ARTISTS + 1 : MIN_ARTISTS;
}

/* ---------------------------------------------------------------- seating */

/**
 * The next Question Master: the player to the left (next seat) of the last
 * one. `prevSeat` is -1 for the very first round, which picks at random.
 */
export function nextQmSeat(playerCount: number, prevSeat: number, rng: () => number): number {
  if (playerCount <= 0) return -1;
  if (prevSeat < 0) return Math.floor(rng() * playerCount);
  return (prevSeat + 1) % playerCount;
}

/**
 * One lap of the drawing order: every artist clockwise from the first one.
 * `seatIds` is everybody playing this round in seat order, QM included.
 */
export function buildTurnOrder(
  seatIds: string[],
  qmId: string | null,
  firstId: string | null | undefined,
  rng: () => number,
): string[] {
  const artists = seatIds.filter((id) => id !== qmId);
  if (!artists.length) return [];
  let start = firstId ? artists.indexOf(firstId) : -1;
  if (start < 0) start = Math.floor(rng() * artists.length);
  return [...artists.slice(start), ...artists.slice(0, start)];
}

/* ----------------------------------------------------------------- voting */

export function tallyVotes(votes: Record<string, string>, candidates: string[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const id of candidates) tally[id] = 0;
  for (const target of Object.values(votes)) {
    if (target in tally) tally[target] += 1;
  }
  return tally;
}

/**
 * Caught means pointed at the most, and alone at the top. A tie — or nobody
 * voting at all — lets the fake off the hook.
 */
export function isCaught(tally: Record<string, number>, fakeId: string): boolean {
  const counts = Object.values(tally);
  const max = counts.length ? Math.max(...counts) : 0;
  if (max === 0) return false;
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  return top.length === 1 && top[0] === fakeId;
}

/* ---------------------------------------------------------------- scoring */

export interface ScoreInput {
  qmId: string | null;
  fakeId: string;
  artistIds: string[];
  caught: boolean;
  guessCorrect: boolean | null;
}

/**
 * Fake not caught, or caught but names the painting: fake and QM +2 each.
 * Caught and wrong: every real artist +1 (the fake and the QM get nothing).
 */
export function scoreRound({ qmId, fakeId, artistIds, caught, guessCorrect }: ScoreInput): {
  winner: 'fake' | 'artists';
  deltas: Record<string, number>;
} {
  const deltas: Record<string, number> = {};
  if (!caught || guessCorrect) {
    deltas[fakeId] = 2;
    if (qmId) deltas[qmId] = 2;
    return { winner: 'fake', deltas };
  }
  for (const id of artistIds) if (id !== fakeId) deltas[id] = 1;
  return { winner: 'artists', deltas };
}

/** Everyone at or past the target with the top score wins (ties share it). */
export function winnersOf(scores: { id: string; score: number }[], target: number): string[] {
  const reached = scores.filter((s) => s.score >= target);
  if (!reached.length) return [];
  const best = Math.max(...reached.map((s) => s.score));
  return reached.filter((s) => s.score === best).map((s) => s.id);
}

/* ---------------------------------------------------------------- answers */

/** Vietnamese counting words that often lead a noun: "con mèo" = "mèo". */
// Only words that never start a real title once accents are gone — "người"
// or "cô" would turn "Người nhện" into "nhện" and "Cờ" into nothing.
const CLASSIFIERS = new Set(['con', 'cai', 'chiec', 'qua', 'trai', 'cay', 'ngoi', 'toa', 'buc', 'tam', 'quyen', 'the', 'a', 'an']);

/** Lowercase, drop accents and punctuation: "Hươu cao cổ!" → "huou cao co". */
export function foldText(s: string): string {
  return s
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function answerForms(s: string): string[] {
  const words = foldText(s).split(' ').filter(Boolean);
  if (!words.length) return [];
  const forms = [words.join('')];
  if (words.length > 1 && CLASSIFIERS.has(words[0])) forms.push(words.slice(1).join(''));
  return forms;
}

/** Split the QM's "also accept" field. */
export function parseAlts(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Forgiving about accents, case, spacing and a leading classifier, strict
 * about the word itself: "con meo" matches "Mèo", "chó" does not.
 */
export function answerMatches(title: string, alts: string[], guess: string): boolean {
  const g = answerForms(guess);
  if (!g.length) return false;
  const accepted = new Set([title, ...alts].flatMap(answerForms));
  return g.some((f) => accepted.has(f));
}

/* ---------------------------------------------------------------- strokes */

/** Clamp and round a batch of streamed points; null if it is not a point list. */
export function sanitizePoints(raw: unknown, maxNumbers: number): number[] | null {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > maxNumbers) return null;
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const x = Number(raw[i]);
    const y = Number(raw[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push(Math.round(Math.min(CANVAS_W, Math.max(0, x))), Math.round(Math.min(CANVAS_H, Math.max(0, y))));
  }
  return out;
}
