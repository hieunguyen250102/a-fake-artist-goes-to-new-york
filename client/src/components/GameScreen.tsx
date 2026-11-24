/**
 * The table during a game: seats along the top, the shared pad in the
 * middle, what you can do right now underneath, your card and the chat on
 * the side (a drawer on phones). Also streams your own marker line.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MAX_STROKE_NUMBERS } from '@shared/engine';
import type { GameState, PrivateState, SetupInput, Stroke } from '@shared/types';
import { Canvas, type DrawInput } from './Canvas';
import { Seats } from './Seats';
import { MyCard } from './MyCard';
import { ChatBox, type ChatItem } from './Chat';
import { IconButton, PointingHand, Timer } from './Bits';
import { Logo, Marker, penHex } from './Art';
import { GameEnd, GuessPanel, RevealOverlay, ResultOverlay, SetupPanel, VoteCountdown, WaitingForQm } from './Phases';
import { sfx } from '../lib/sound';
import { serverTime } from '../lib/clock';

/** how long a chat line hangs over its author's seat */
const BUBBLE_MS = 6000;
/** skip points closer than this (canvas units) — keeps lines light */
const MIN_STEP = 3;

interface Props {
  state: GameState;
  priv: PrivateState;
  youId: string;
  remoteLive: Stroke | null;
  chat: ChatItem[];
  muted: boolean;
  send: (event: string, payload?: unknown) => void;
  onSendChat: (text: string) => void;
  onToggleMute: () => void;
  onShowRules: () => void;
  onLeave: () => void;
}

export function GameScreen({ state, priv, youId, remoteLive, chat, muted, send, onSendChat, onToggleMute, onShowRules, onLeave }: Props) {
  const me = state.players.find((p) => p.id === youId)!;
  const isHost = state.hostId === youId;
  const drawerId = state.phase === 'drawing' && state.turnOrder.length ? state.turnOrder[state.turnIndex % state.turnOrder.length] : null;
  const myTurn = drawerId === youId;
  const lap = Math.floor(state.turnIndex / Math.max(1, state.turnOrder.length)) + 1;
  const drawer = state.players.find((p) => p.id === drawerId);
  const isArtist = me.inRound && state.qmId !== youId;

  /* -------------------------------------------------------- your line */

  const [mine, setMine] = useState<number[] | null>(null);
  const [mineDone, setMineDone] = useState(false);
  /** the line as drawn so far — a ref, so pointer events never wait on a render */
  const mineRef = useRef<number[] | null>(null);
  /** points drawn but not yet sent */
  const pending = useRef<number[]>([]);
  /** a queued repaint of your line */
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  const turnKey = `${state.round}:${state.phase}:${state.turnIndex}`;

  // A new turn starts clean — unless a reload caught us mid-line, then pick it back up.
  useEffect(() => {
    const own = state.live && state.live.playerId === youId ? state.live : null;
    mineRef.current = own && own.points.length ? [...own.points] : null;
    setMine(mineRef.current);
    setMineDone(own ? state.liveDone : false);
    pending.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  const flush = useCallback(() => {
    if (!pending.current.length) return;
    send('draw:pts', { pts: pending.current });
    pending.current = [];
  }, [send]);

  useEffect(() => {
    if (!myTurn) return;
    const t = setInterval(flush, 60);
    return () => clearInterval(t);
  }, [myTurn, flush]);

  const input: DrawInput | null =
    myTurn && !mineDone
      ? {
          onBegin: (x, y) => {
            const pt = [Math.round(x), Math.round(y)];
            send('draw:begin');
            pending.current = [...pt];
            mineRef.current = pt;
            setMine(pt);
            sfx.stroke();
          },
          onMove: (x, y) => {
            const cur = mineRef.current;
            if (!cur || cur.length >= MAX_STROKE_NUMBERS) return;
            if (Math.hypot(x - cur[cur.length - 2], y - cur[cur.length - 1]) < MIN_STEP) return;
            const pt = [Math.round(x), Math.round(y)];
            cur.push(...pt);
            pending.current.push(...pt);
            // one render per frame, not per point — phones send a lot of points
            if (frame.current === null) {
              frame.current = requestAnimationFrame(() => {
                frame.current = null;
                if (mineRef.current) setMine(mineRef.current.slice());
              });
            }
          },
          onEnd: () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            if (mineRef.current) setMine(mineRef.current.slice());
            flush();
            send('draw:end');
            setMineDone(true);
          },
        }
      : null;

  const redo = () => {
    sfx.tap();
    send('draw:redo');
    mineRef.current = null;
    setMine(null);
    setMineDone(false);
  };
  const commit = () => {
    flush();
    sfx.commit();
    send('draw:commit');
  };

  const live: Stroke | null = myTurn ? (mine ? { playerId: youId, color: me.color, points: mine } : null) : remoteLive;

  /* ----------------------------------------------------- notifications */

  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    if (!myTurn) return;
    sfx.turn();
    setBanner(lap === 1 ? 'Đến lượt bạn! Vẽ một nét' : 'Vòng 2 — nét cuối của bạn!');
    const t = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(t);
  }, [myTurn, turnKey, lap]);

  // someone else starts a line: a soft scratch of felt on paper
  const lastRemote = useRef<string | null>(null);
  useEffect(() => {
    const key = remoteLive ? `${turnKey}:${remoteLive.playerId}` : null;
    if (key && key !== lastRemote.current) sfx.stroke();
    lastRemote.current = key;
  }, [remoteLive, turnKey]);

  /* --------------------------------------------------------- chat bits */

  const [chatOpen, setChatOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(chat.length);
  useEffect(() => {
    if (chatOpen) setSeenChat(chat.length);
  }, [chatOpen, chat.length]);
  const unread = Math.max(0, chat.filter((m) => !m.system).length - chat.slice(0, seenChat).filter((m) => !m.system).length);

  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const bubbles: Record<string, string> = {};
  for (const m of chat) if (!m.system && m.recvAt && Date.now() - m.recvAt < BUBBLE_MS) bubbles[m.playerId] = m.text;

  /* ------------------------------------------------------------ voting */

  const canVote = state.phase === 'voting' && isArtist && !me.left && serverTime() >= (state.votingOpensAt ?? 0) - 300;
  const vote = (id: string) => {
    sfx.vote();
    send('vote:cast', { targetId: id });
  };

  /* ------------------------------------------------------------ status */

  const votedCount = state.players.filter((p) => p.voted).length;
  const voterCount = state.players.filter((p) => p.inRound && p.id !== state.qmId && !p.left).length;
  const seenCount = state.players.filter((p) => p.inRound && p.id !== state.qmId && p.seen).length;
  const guessFake = state.players.find((p) => p.id === state.guessFakeId);
  const myVoteName = state.players.find((p) => p.id === priv.myVote)?.name;

  let status: React.ReactNode = null;
  switch (state.phase) {
    case 'setup':
      status = state.qmId === youId ? 'Bạn đang ra đề…' : 'Chờ ra đề…';
      break;
    case 'reveal':
      status = `Các hoạ sĩ đang xem thẻ (${seenCount}/${voterCount})`;
      break;
    case 'drawing':
      status = myTurn ? (
        mineDone ? (
          <span>Ưng nét này chưa?</span>
        ) : (
          <span>
            <b>Lượt bạn</b> — vẽ <b>một nét liền</b>, nhấc bút là xong
          </span>
        )
      ) : (
        <span>
          <b style={{ color: 'inherit' }}>{drawer?.name}</b> đang vẽ…
        </span>
      );
      break;
    case 'voting':
      status = !isArtist ? (
        `Các hoạ sĩ đang chỉ tay (${votedCount}/${voterCount})`
      ) : priv.myVote ? (
        <span>
          Bạn chỉ vào <b>{myVoteName}</b> — đổi được tới khi mọi người chỉ xong ({votedCount}/{voterCount})
        </span>
      ) : (
        <span>
          <b>Chạm vào người</b> bạn nghi là hoạ sĩ dởm ({votedCount}/{voterCount})
        </span>
      );
      break;
    case 'guess':
      status =
        state.guessFakeId === youId ? (
          'Đoán tên bức tranh đi!'
        ) : (
          <span>
            <b className="text-rose">{guessFake?.name}</b> bị bắt! Đang đoán tên bức tranh…
          </span>
        );
      break;
    case 'result':
      status = 'Kết quả vòng này';
      break;
  }

  const confirmLeave = () => {
    if (state.phase === 'gameEnd' || window.confirm('Rời bàn giữa ván? Lượt của bạn sẽ bị bỏ qua.')) onLeave();
  };

  /* ------------------------------------------------------------ layout */

  const strokesDone = state.phase === 'drawing' ? state.turnIndex : state.strokes.length;
  const totalTurns = state.turnOrder.length * 2;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-2 px-3 py-2 sm:px-4 lg:grid lg:h-dvh lg:grid-cols-[1fr_320px] lg:grid-rows-[auto_1fr] lg:gap-x-4">
      {/* top bar */}
      <header className="flex items-center gap-2 lg:col-span-2">
        <Logo compact />
        <div className="ml-1 hidden min-w-0 items-center gap-2 text-xs text-ink-2 sm:flex">
          <span className="rounded-full bg-paper-3 px-2 py-0.5 font-semibold">Vòng {state.round}</span>
          {state.category && (
            <span className="truncate rounded-full bg-white px-2 py-0.5 ring-1 ring-ink/10">
              Chủ đề: <b className="text-ink">{state.category}</b>
            </span>
          )}
          <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-ink/10">
            Bàn <b className="tracking-widest text-ink">{state.roomCode}</b>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton onClick={onToggleMute} label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}>
            {muted ? '🔇' : '🔊'}
          </IconButton>
          <IconButton onClick={onShowRules} label="Luật chơi">
            <span className="display text-base font-extrabold">?</span>
          </IconButton>
          <IconButton onClick={confirmLeave} label="Rời bàn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
            </svg>
          </IconButton>
        </div>
      </header>

      {/* main column */}
      <main className="flex min-h-0 flex-col gap-2">
        {/* mobile: round + category */}
        <div className="flex items-center gap-2 text-xs text-ink-2 sm:hidden">
          <span className="rounded-full bg-paper-3 px-2 py-0.5 font-semibold">Vòng {state.round}</span>
          {state.category && (
            <span className="truncate">
              Chủ đề: <b className="text-ink">{state.category}</b>
            </span>
          )}
          <span className="ml-auto tracking-widest">{state.roomCode}</span>
        </div>

        <Seats state={state} youId={youId} myVote={priv.myVote} canVote={canVote} onVote={vote} bubbles={bubbles} />

        <div className="relative flex min-h-0 flex-1 items-start justify-center">
          <div className="relative w-full" style={{ maxWidth: 'min(100%, calc((100dvh - 250px) * 4 / 3))' }}>
            <Canvas
              strokes={state.strokes}
              live={live}
              showPen={!myTurn}
              input={input}
              emptyHint={state.phase === 'drawing' ? (myTurn ? 'Nét đầu tiên là của bạn!' : `${drawer?.name ?? ''} sẽ vẽ nét đầu tiên…`) : undefined}
            />

            {/* the QM is thinking */}
            <AnimatePresence>
              {state.phase === 'setup' && state.qmId !== youId && (
                <motion.div
                  className="absolute inset-0 grid place-items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <WaitingForQm state={state} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* "your turn" */}
            <AnimatePresence>
              {banner && (
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center"
                  initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
                  animate={{ scale: 1, opacity: 1, rotate: -2 }}
                  exit={{ scale: 1.1, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                >
                  <div className="display flex items-center gap-2 rounded-2xl bg-ink px-5 py-2 text-xl font-extrabold text-paper-2 shadow-[0_4px_0_#000]">
                    <Marker color={me.color} size={12} capOff />
                    {banner}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* what you can do now */}
        <div className="panel flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2">
          {state.phase === 'drawing' && (
            <div className="flex items-center gap-1" aria-label={`Nét ${strokesDone}/${totalTurns}`}>
              {Array.from({ length: totalTurns }, (_, i) => {
                const who = state.players.find((p) => p.id === state.turnOrder[i % state.turnOrder.length]);
                const done = i < state.turnIndex;
                const now = i === state.turnIndex;
                return (
                  <motion.span
                    key={i}
                    className="block h-2.5 rounded-full"
                    animate={{ width: now ? 18 : 8, opacity: done || now ? 1 : 0.3 }}
                    style={{ background: who ? penHex(who.color) : '#ccc' }}
                    title={who?.name}
                  />
                );
              })}
            </div>
          )}
          {state.phase === 'voting' && isArtist && !priv.myVote && (
            <motion.span animate={{ x: [0, 6, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>
              <PointingHand size={26} color="#2f7fc1" />
            </motion.span>
          )}
          <div className="min-w-0 flex-1 text-sm text-ink">{status}</div>

          {myTurn && mineDone && (
            <motion.div className="flex gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <button type="button" onClick={redo} className="btn btn-ghost !py-1.5 text-sm">
                Vẽ lại
              </button>
              <button type="button" onClick={commit} className="btn btn-rose !py-1.5 text-sm">
                Xong nét này ✓
              </button>
            </motion.div>
          )}
          {state.phase !== 'result' && state.phase !== 'gameEnd' && state.phase !== 'setup' && (
            <Timer deadline={state.deadline} tick={myTurn || (state.phase === 'voting' && isArtist && !priv.myVote)} />
          )}

          {/* phones: your card sits here, the chat is one tap away */}
          <div className="flex w-full items-center gap-2 lg:hidden">
            <div className="min-w-0 flex-1">
              <MyCard state={state} priv={priv} myColor={me.color} compact />
            </div>
            <button type="button" onClick={() => setChatOpen(true)} className="btn btn-ghost relative shrink-0 !py-1.5 text-sm">
              💬 Chat
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* side column (desktop) */}
      <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
        <div className="panel rounded-2xl p-3">
          <MyCard state={state} priv={priv} myColor={me.color} />
        </div>
        <div className="panel flex min-h-0 flex-1 flex-col rounded-2xl p-3">
          <h2 className="display text-sm font-bold">Trò chuyện</h2>
          <ChatBox messages={chat} youId={youId} onSend={onSendChat} className="mt-1 flex-1" />
        </div>
      </aside>

      {/* chat drawer (phones) */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="fixed inset-0 z-30 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/30" onClick={() => setChatOpen(false)} />
            <motion.div
              className="panel absolute inset-x-0 bottom-0 flex h-[70dvh] flex-col rounded-t-3xl p-4"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ink/15" />
              <div className="flex items-center justify-between">
                <h2 className="display font-bold">Trò chuyện</h2>
                <button type="button" onClick={() => setChatOpen(false)} className="text-sm text-ink-2">
                  Đóng
                </button>
              </div>
              <ChatBox messages={chat} youId={youId} onSend={onSendChat} className="mt-2 flex-1" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* phase overlays */}
      <AnimatePresence>
        {state.phase === 'setup' && state.qmId === youId && (
          <SetupPanel key={`setup-${state.round}`} state={state} onSubmit={(input: SetupInput) => send('setup:submit', input)} />
        )}
        {state.phase === 'reveal' && isArtist && !me.seen && (
          <RevealOverlay key={`reveal-${state.round}`} state={state} priv={priv} myColor={me.color} onSeen={() => send('reveal:seen')} />
        )}
        {state.phase === 'guess' && state.guessFakeId === youId && (
          <GuessPanel key={`guess-${state.round}`} state={state} onGuess={(text) => send('guess:submit', { text })} />
        )}
        {state.phase === 'result' && state.result && (
          <ResultOverlay key={`result-${state.round}`} state={state} youId={youId} isHost={isHost} onNext={() => send('round:next')} />
        )}
        {state.phase === 'gameEnd' && (
          <GameEnd key="end" state={state} youId={youId} isHost={isHost} onRestart={() => send('game:restart')} onLeave={onLeave} />
        )}
      </AnimatePresence>
      {state.phase === 'voting' && state.votingOpensAt && <VoteCountdown key={`count-${state.round}`} opensAt={state.votingOpensAt} />}
    </div>
  );
}
