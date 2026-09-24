/**
 * Wire types shared by the server (the referee) and the client.
 * Anything secret — the title, who the fake is — lives only in PrivateState
 * until the round is over.
 */

export type Phase = 'lobby' | 'setup' | 'reveal' | 'drawing' | 'voting' | 'guess' | 'result' | 'gameEnd';

/** rotate = the rulebook (players take turns as Question Master); auto = the server sets the title */
export type QmMode = 'rotate' | 'auto';

export interface Settings {
  qmMode: QmMode;
  /** points needed to win (the rulebook says 5) */
  target: number;
  /** seconds each artist gets for one mark */
  turnSeconds: number;
}

/** One marker line. Points are a flat [x0, y0, x1, y1, …] list in canvas units. */
export interface Stroke {
  playerId: string;
  color: number;
  points: number[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  /** index into PEN_COLORS — every player owns one marker */
  color: number;
  isBot: boolean;
  connected: boolean;
  score: number;
  /** false for someone who joined mid-round: they watch until the next one */
  inRound: boolean;
  /** reveal phase: has looked at their title card */
  seen: boolean;
  /** voting phase: has pointed at someone (not at whom) */
  voted: boolean;
  /** walked out mid-game; skipped, and removed when the round ends */
  left: boolean;
}

export interface RoundResult {
  round: number;
  fakeId: string;
  qmId: string | null;
  category: string;
  title: string;
  /** voter → the player they pointed at */
  votes: Record<string, string>;
  /** player → votes received */
  tally: Record<string, number>;
  caught: boolean;
  guess: string | null;
  guessCorrect: boolean | null;
  winner: 'fake' | 'artists';
  deltas: Record<string, number>;
}

/** A finished painting, kept for the gallery at the end of the game. */
export interface Artwork {
  round: number;
  category: string;
  title: string;
  fakeId: string;
  fakeName: string;
  winner: 'fake' | 'artists';
  strokes: Stroke[];
}

export interface GameState {
  roomCode: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  round: number;
  qmId: string | null;
  /** announced when the cards are dealt */
  category: string | null;
  /** artists in drawing order for one lap; the table goes round twice */
  turnOrder: string[];
  turnIndex: number;
  strokes: Stroke[];
  /** the mark being drawn right now, streamed as it happens */
  live: Stroke | null;
  /** the live mark is finished and waiting for its author to confirm it */
  liveDone: boolean;
  phaseStartedAt: number;
  /** when the current phase (or turn) times out, server clock */
  deadline: number | null;
  /** voting phase: the "3, 2, 1, point!" countdown ends here */
  votingOpensAt: number | null;
  /** guess phase: the fake has been caught and must name the painting */
  guessFakeId: string | null;
  /** who pointed at whom — public once the vote closes */
  votes: Record<string, string> | null;
  result: RoundResult | null;
  /** only filled in at the end of the game */
  gallery: Artwork[];
  winnerIds: string[];
  /** server clock when this snapshot was taken, to line up countdowns */
  now: number;
}

export type Role = 'qm' | 'artist' | 'fake' | 'watch';

export interface PrivateState {
  role: Role;
  /** the secret title — null for the fake (and before the cards are dealt) */
  title: string | null;
  /** only the Question Master knows who got the X */
  fakeId: string | null;
  myVote: string | null;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  avatar: number;
  color: number;
  text: string;
  at: number;
  /** table announcements (round start, results) rather than a person talking */
  system?: boolean;
}

export interface SetupInput {
  category: string;
  title: string;
  /** other answers the fake may give, comma-separated */
  alts?: string;
  /** who draws first; empty = random */
  firstId?: string | null;
}
