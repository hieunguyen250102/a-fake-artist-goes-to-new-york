/**
 * Everyone at the table in seat order. A seat shows who is drawing, who set
 * the title, who has voted, how many fingers point at them, their score as
 * chips, and their latest chat line as a bubble.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState, PublicPlayer } from '@shared/types';
import { Avatar, ChipRow, Marker, penHex, type Mood } from './Art';
import { PointingHand } from './Bits';

interface SeatProps {
  player: PublicPlayer;
  isYou: boolean;
  isQm: boolean;
  isDrawer: boolean;
  /** position in the drawing order, 1-based; 0 when not drawing */
  order: number;
  mood: Mood;
  votable: boolean;
  chosen: boolean;
  /** fingers pointed at this seat once the vote is public */
  tally: number | null;
  showVoted: boolean;
  delta: number | null;
  bubble: string | null;
  onVote?: () => void;
}

const Seat = memo(function Seat({
  player,
  isYou,
  isQm,
  isDrawer,
  order,
  mood,
  votable,
  chosen,
  tally,
  showVoted,
  delta,
  bubble,
  onVote,
}: SeatProps) {
  const hex = penHex(player.color);
  const dim = !player.connected && !player.isBot;

  const body = (
    <>
      <div className="relative">
        {/* drawing: a ring in their marker colour and a bobbing pen */}
        <AnimatePresence>
          {isDrawer && (
            <motion.span
              className="absolute -inset-1 rounded-full"
              style={{ border: `3px solid ${hex}` }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [1, 1.08, 1], opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ scale: { duration: 1.2, repeat: Infinity }, opacity: { duration: 0.2 } }}
            />
          )}
        </AnimatePresence>
        {chosen && <span className="absolute -inset-1 rounded-full border-[3px] border-cobalt" />}

        <motion.div
          animate={isDrawer ? { y: [0, -3, 0] } : { y: 0 }}
          transition={isDrawer ? { duration: 0.8, repeat: Infinity } : undefined}
          className="rounded-full bg-paper-2"
        >
          <Avatar index={player.avatar} color={player.color} size={48} mood={mood} dim={dim || player.left} />
        </motion.div>

        {isDrawer && (
          <motion.span
            className="absolute -right-3 -top-4"
            animate={{ rotate: [20, 36, 20], y: [0, 2, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            <Marker color={player.color} size={11} capOff />
          </motion.span>
        )}

        {isQm && (
          <span className="absolute -left-2 -top-1 rounded-md bg-rose px-1 text-[9px] font-extrabold leading-4 text-white shadow-[0_1px_0_#a5365a]">
            RA ĐỀ
          </span>
        )}
        {!isQm && order > 0 && !isDrawer && (
          <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-paper-3 text-[9px] font-bold text-ink-2">
            {order}
          </span>
        )}

        <AnimatePresence>
          {showVoted && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-sage text-[11px] font-bold text-white ring-2 ring-paper-2"
              aria-label="Đã chỉ tay"
            >
              ✓
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {tally !== null && tally > 0 && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.1 }}
              className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-ink px-1 text-xs font-extrabold text-paper-2 ring-2 ring-paper-2"
              aria-label={`${tally} người chỉ`}
            >
              {tally}
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {chosen && (
            <motion.span
              className="absolute -left-7 top-3"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: [0, 4, 0], opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ x: { duration: 0.7, repeat: Infinity }, opacity: { duration: 0.15 } }}
            >
              <PointingHand size={26} color="#2f7fc1" />
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {delta !== null && delta > 0 && (
            <motion.span
              className="display absolute left-1/2 top-0 -translate-x-1/2 text-lg font-extrabold"
              style={{ color: delta === 2 ? '#c8466f' : '#2f7fc1' }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: -28, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.2, delay: 1.4 }}
            >
              +{delta}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-1 w-[76px] text-center">
        <div className={`truncate text-xs font-bold leading-tight ${isYou ? 'text-rose' : 'text-ink'}`}>
          {player.name}
          {isYou && ' (bạn)'}
        </div>
        <div className="mt-0.5 flex h-4 items-center justify-center gap-1">
          {!player.inRound ? (
            <span className="text-[9px] font-semibold uppercase text-ink-3">đang xem</span>
          ) : dim ? (
            <span className="text-[9px] font-semibold uppercase text-ink-3">{player.left ? 'đã rời' : 'mất mạng…'}</span>
          ) : (
            <>
              <ChipRow score={player.score} size={13} max={4} />
              <span className="text-[11px] font-bold tabular-nums text-ink-2">{player.score}</span>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {bubble && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-none absolute left-1/2 top-12 z-20 w-max max-w-[9rem] -translate-x-1/2 break-words rounded-xl border border-ink/10 bg-white px-2 py-1 text-center text-[11px] leading-snug text-ink shadow-md"
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (votable) {
    return (
      <motion.button
        type="button"
        onClick={onVote}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.94 }}
        className={`relative flex shrink-0 flex-col items-center rounded-2xl px-1.5 pb-1.5 pt-2 transition ${
          chosen ? 'bg-cobalt-soft' : 'bg-white/70 ring-1 ring-ink/10 hover:bg-white'
        }`}
        aria-label={`Chỉ vào ${player.name}`}
        aria-pressed={chosen}
      >
        {body}
      </motion.button>
    );
  }
  return <div className="relative flex shrink-0 flex-col items-center px-1.5 pb-1.5 pt-2">{body}</div>;
});

interface Props {
  state: GameState;
  youId: string;
  /** the player you are pointing at, while voting */
  myVote: string | null;
  canVote: boolean;
  onVote: (id: string) => void;
  bubbles: Record<string, string>;
}

export function Seats({ state, youId, myVote, canVote, onVote, bubbles }: Props) {
  const drawerId = state.phase === 'drawing' && state.turnOrder.length ? state.turnOrder[state.turnIndex % state.turnOrder.length] : null;
  const votes = state.votes;
  const tally: Record<string, number> = {};
  if (votes) for (const t of Object.values(votes)) tally[t] = (tally[t] ?? 0) + 1;
  const result = state.result;
  const fakeId = result?.fakeId ?? state.guessFakeId;

  const moodOf = (p: PublicPlayer): Mood => {
    if (result) {
      if (p.id === result.fakeId) return result.caught && !result.guessCorrect ? 'shock' : 'sly';
      return (result.deltas[p.id] ?? 0) > 0 ? 'happy' : 'calm';
    }
    if (p.id === fakeId) return 'shock';
    if (p.id === drawerId) return 'happy';
    return 'calm';
  };

  return (
    <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:justify-center lg:overflow-visible">
      {state.players.map((p) => {
        const isArtist = p.inRound && p.id !== state.qmId;
        return (
          <Seat
            key={p.id}
            player={p}
            isYou={p.id === youId}
            isQm={p.id === state.qmId && state.phase !== 'lobby'}
            isDrawer={p.id === drawerId}
            order={state.phase === 'drawing' ? state.turnOrder.indexOf(p.id) + 1 : 0}
            mood={moodOf(p)}
            votable={canVote && isArtist && p.id !== youId}
            chosen={myVote === p.id}
            tally={votes ? (tally[p.id] ?? 0) : null}
            showVoted={state.phase === 'voting' && p.voted}
            delta={result ? (result.deltas[p.id] ?? null) : null}
            bubble={bubbles[p.id] ?? null}
            onVote={() => onVote(p.id)}
          />
        );
      })}
    </div>
  );
}
