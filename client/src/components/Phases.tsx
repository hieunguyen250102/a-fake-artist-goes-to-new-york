/**
 * The big moments of a round, each as its own overlay: setting the title,
 * turning over your card, the "3, 2, 1, point!" countdown, the caught fake's
 * last guess, the reveal and scoring, and the gallery at the end.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState, PrivateState, PublicPlayer, SetupInput } from '@shared/types';
import { WORD_BANK, pick, wordsFor } from '@shared/words';
import { Avatar, CardBack, CardFront, PointChip, penHex } from './Art';
import { Canvas } from './Canvas';
import { Confetti, Modal, PointingHand, Timer } from './Bits';
import { serverTime } from '../lib/clock';
import { sfx } from '../lib/sound';

function byId(state: GameState, id: string | null | undefined): PublicPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

/* ---------------------------------------------------------------- setup */

export function SetupPanel({ state, onSubmit }: { state: GameState; onSubmit: (input: SetupInput) => void }) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [alts, setAlts] = useState('');
  const [firstId, setFirstId] = useState('');
  const [sent, setSent] = useState(false);
  const artists = state.players.filter((p) => p.inRound && p.id !== state.qmId);

  const suggest = () => {
    sfx.tap();
    const known = wordsFor(category);
    if (known.length) {
      setTitle(pick(known, Math.random));
    } else {
      const cat = pick(WORD_BANK, Math.random);
      setCategory(cat.name);
      setTitle(pick(cat.words, Math.random));
    }
  };

  const ok = category.trim().length > 0 && title.trim().length > 0 && !sent;

  return (
    <Modal className="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-extrabold">Bạn ra đề!</h2>
          <p className="text-sm text-ink-2">Chọn chủ đề và tên bức tranh. Đề dễ vẽ thì hoạ sĩ dởm dễ trà trộn — mà bạn thắng cùng họ.</p>
        </div>
        <Timer deadline={state.deadline} tick />
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          setSent(true);
          sfx.deal();
          onSubmit({ category, title, alts, firstId: firstId || null });
        }}
      >
        <div>
          <label className="label" htmlFor="qm-cat">
            Chủ đề (mọi người đều biết)
          </label>
          <input
            id="qm-cat"
            value={category}
            maxLength={30}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="VD: Động vật"
            className="field mt-1"
            autoFocus
          />
          <div className="scrollbar-thin mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
            {WORD_BANK.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  sfx.tap();
                  setCategory(c.name);
                }}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition ${
                  category === c.name ? 'border-ink bg-ink text-paper-2' : 'border-ink/12 bg-white text-ink-2 hover:bg-paper'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="qm-title">
            Tên bức tranh (bí mật — hoạ sĩ dởm không biết)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="qm-title"
              value={title}
              maxLength={40}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Sư tử"
              className="field hand min-w-0 flex-1 text-xl"
            />
            <motion.button
              type="button"
              onClick={suggest}
              whileTap={{ rotate: 180, scale: 0.9 }}
              className="btn btn-ghost shrink-0 !px-3"
              title="Gợi ý ngẫu nhiên"
              aria-label="Gợi ý ngẫu nhiên"
            >
              🎲
            </motion.button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="qm-alts">
            Đáp án khác cũng tính đúng (không bắt buộc)
          </label>
          <input
            id="qm-alts"
            value={alts}
            maxLength={160}
            onChange={(e) => setAlts(e.target.value)}
            placeholder="VD: vua sư tử, lion — cách nhau bằng dấu phẩy"
            className="field mt-1 text-sm"
          />
          <p className="mt-1 text-[11px] text-ink-3">Không phân biệt hoa thường, dấu, và chữ “con/cái/quả…” ở đầu.</p>
        </div>

        <div>
          <label className="label" htmlFor="qm-first">
            Ai vẽ nét đầu tiên
          </label>
          <select id="qm-first" value={firstId} onChange={(e) => setFirstId(e.target.value)} className="field mt-1 text-sm">
            <option value="">Ngẫu nhiên</option>
            {artists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={!ok} className="btn btn-rose w-full text-lg">
          Chia thẻ cho các hoạ sĩ
        </button>
      </form>
    </Modal>
  );
}

/** What everyone else sees on the pad while the QM thinks. */
export function WaitingForQm({ state }: { state: GameState }) {
  const qm = byId(state, state.qmId);
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative">
        {qm ? (
          <Avatar index={qm.avatar} color={qm.color} size={72} mood="sly" />
        ) : (
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="w-14">
            <CardBack color={7} className="w-full" />
          </motion.div>
        )}
        <motion.span
          className="absolute -right-4 top-0 text-2xl"
          animate={{ rotate: [0, -20, 10, 0], y: [0, -4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          aria-hidden
        >
          ✍️
        </motion.span>
      </div>
      <div className="hand text-2xl text-ink">{qm ? `${qm.name} đang nghĩ đề…` : 'Máy đang chọn đề…'}</div>
      <Timer deadline={qm ? state.deadline : null} />
    </div>
  );
}

/* --------------------------------------------------------------- reveal */

export function RevealOverlay({
  state,
  priv,
  myColor,
  onSeen,
}: {
  state: GameState;
  priv: PrivateState;
  myColor: number;
  onSeen: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const isFake = priv.role === 'fake';

  return (
    <Modal className="max-w-sm text-center">
      <div className="flex items-center justify-between">
        <div className="label">Chủ đề</div>
        <Timer deadline={state.deadline} />
      </div>
      <div className="display text-3xl font-extrabold">{state.category}</div>

      <div className="card3d mx-auto mt-4 w-40">
        <motion.button
          type="button"
          className="card3d-inner relative block aspect-[2/3] w-full"
          initial={{ y: -260, rotate: -25, opacity: 0 }}
          animate={{ y: 0, rotate: flipped ? 0 : -4, opacity: 1, rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 18 }}
          onClick={() => {
            if (flipped) return;
            setFlipped(true);
            sfx.flip();
            if (isFake) setTimeout(() => sfx.stamp(), 450);
          }}
          aria-label="Lật thẻ"
        >
          <div className="card-face absolute inset-0">
            <CardBack color={myColor} className="h-full w-full drop-shadow-md" />
          </div>
          <div className="card-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
            <CardFront title={isFake ? null : priv.title} category={state.category} className="h-full w-full drop-shadow-md" />
          </div>
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {!flipped ? (
          <motion.p
            key="hint"
            className="hand mt-4 text-xl text-ink-2"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            Chạm vào thẻ để lật — che màn hình lại nhé!
          </motion.p>
        ) : (
          <motion.div key="told" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-4">
            {isFake ? (
              <>
                <motion.div
                  initial={{ scale: 2.4, rotate: -18, opacity: 0 }}
                  animate={{ scale: 1, rotate: -6, opacity: 1 }}
                  transition={{ delay: 0.45, type: 'spring', stiffness: 400, damping: 15 }}
                  className="display mx-auto w-fit rounded-lg border-[3px] border-rose px-3 text-2xl font-extrabold uppercase tracking-wide text-rose"
                >
                  Hoạ sĩ dởm!
                </motion.div>
                <p className="mt-2 text-sm text-ink-2">
                  Bạn không biết tên tranh. Nhìn nét của người khác, vẽ cho khéo và đừng để bị chỉ mặt.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-2">
                Cả bàn (trừ một người) đang vẽ <b className="hand text-xl text-ink">«{priv.title}»</b>. Vẽ đủ để chứng minh bạn biết — nhưng
                đừng lộ quá cho hoạ sĩ dởm đoán ra.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                sfx.select();
                onSeen();
              }}
              className="btn btn-ink mt-4 w-full"
            >
              Nhớ rồi, vào vẽ!
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

/* ------------------------------------------------------------ countdown */

/** "3, 2, 1, point!" — big numbers over everything, then out of the way. */
export function VoteCountdown({ opensAt }: { opensAt: number }) {
  const [now, setNow] = useState(serverTime);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(serverTime()), 100);
    return () => clearInterval(t);
  }, []);
  const left = opensAt - now;
  const n = left > 0 ? Math.min(3, Math.ceil(left / 1100)) : 0;
  const show = left > -900;

  useEffect(() => {
    if (!show || last.current === n) return;
    last.current = n;
    if (n > 0) sfx.tick();
    else sfx.go();
  }, [n, show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-paper/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              key={n}
              initial={{ scale: 2.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              className="flex flex-col items-center"
            >
              {n > 0 ? (
                <span className="display text-[9rem] font-extrabold leading-none text-ink drop-shadow-[0_6px_0_rgba(200,70,111,0.35)]">{n}</span>
              ) : (
                <>
                  <motion.span animate={{ x: [0, 16, 0] }} transition={{ duration: 0.5, repeat: 2 }}>
                    <PointingHand size={120} color="#c8466f" />
                  </motion.span>
                  <span className="display text-6xl font-extrabold text-rose">Chỉ!</span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- guess */

export function GuessPanel({ state, onGuess }: { state: GameState; onGuess: (text: string) => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const me = byId(state, state.guessFakeId);
  return (
    <Modal className="max-w-sm text-center">
      <div className="flex justify-end">
        <Timer deadline={state.deadline} tick />
      </div>
      <motion.div animate={{ rotate: [0, -8, 8, -4, 0] }} transition={{ duration: 0.7 }} className="mx-auto w-fit">
        {me && <Avatar index={me.avatar} color={me.color} size={84} mood="shock" />}
      </motion.div>
      <h2 className="display mt-2 text-2xl font-extrabold">Bị bắt rồi!</h2>
      <p className="text-sm text-ink-2">
        Nhưng vẫn còn một cơ hội: đoán đúng tên bức tranh là bạn thắng. Chủ đề là <b className="text-ink">{state.category}</b>.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || sent) return;
          setSent(true);
          sfx.select();
          onGuess(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          placeholder="Bức tranh này là…"
          className="field hand text-center text-2xl"
          autoFocus
        />
        <button type="submit" disabled={!text.trim() || sent} className="btn btn-rose w-full">
          Chốt đáp án (chỉ một lần!)
        </button>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- result */

export function ResultOverlay({
  state,
  youId,
  isHost,
  onNext,
}: {
  state: GameState;
  youId: string;
  isHost: boolean;
  onNext: () => void;
}) {
  const r = state.result!;
  const fake = byId(state, r.fakeId);
  const qm = byId(state, r.qmId);
  const [replay, setReplay] = useState(0);
  const fakeWon = r.winner === 'fake';
  const youGain = r.deltas[youId] ?? 0;
  const tally = Object.entries(r.tally).sort((a, b) => b[1] - a[1]);
  const maxVotes = Math.max(1, ...tally.map(([, n]) => n));

  useEffect(() => {
    sfx.drumroll();
    const t1 = setTimeout(() => sfx.stamp(), 900);
    const t2 = setTimeout(() => (youGain > 0 ? sfx.win() : sfx.lose()), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [youGain]);

  let headline: string;
  if (!r.caught) headline = `${fake?.name ?? 'Hoạ sĩ dởm'} trốn thoát!`;
  else if (r.guessCorrect) headline = `Bị bắt nhưng đoán trúng!`;
  else headline = 'Các hoạ sĩ thắng!';

  return (
    <>
      {youGain > 0 && <Confetti count={60} />}
      <Modal className="max-w-3xl" z="z-40">
        <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]">
          {/* the painting, named */}
          <div>
            <Canvas
              strokes={state.strokes}
              replayKey={replay}
              plate={{ title: r.title, subtitle: `${r.category} · vòng ${r.round}` }}
            />
            <button
              type="button"
              onClick={() => {
                sfx.tap();
                setReplay((n) => n + 1);
              }}
              className="mt-2 text-xs font-semibold text-ink-2 hover:text-ink"
            >
              ↻ Xem lại từng nét
            </button>
          </div>

          <div className="flex flex-col">
            <div className="text-center">
              <div className="label">Hoạ sĩ dởm là…</div>
              <div className="relative mx-auto mt-1 w-fit">
                <motion.div initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ delay: 0.5, type: 'spring' }}>
                  {fake && <Avatar index={fake.avatar} color={fake.color} size={88} mood={fakeWon ? 'sly' : 'shock'} />}
                </motion.div>
                <motion.div
                  initial={{ scale: 3, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: -14 }}
                  transition={{ delay: 0.9, type: 'spring', stiffness: 500, damping: 16 }}
                  className="display absolute -right-10 top-2 rounded-md border-[3px] border-rose bg-paper-2/80 px-1.5 text-lg font-extrabold uppercase text-rose"
                >
                  Dởm!
                </motion.div>
              </div>
              <div className="display text-xl font-bold">{fake?.name}</div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3 }}
              className={`mt-3 rounded-2xl px-4 py-3 text-center ${fakeWon ? 'bg-rose-soft' : 'bg-cobalt-soft'}`}
            >
              <div className={`display text-xl font-extrabold ${fakeWon ? 'text-rose-deep' : 'text-cobalt-deep'}`}>{headline}</div>
              <div className="mt-0.5 text-xs text-ink-2">
                {!r.caught
                  ? 'Không ai bị chỉ nhiều nhất một mình (hoà cũng tính là thoát).'
                  : r.guess
                    ? `Đoán «${r.guess}» — ${r.guessCorrect ? 'đúng rồi!' : 'sai mất rồi.'}`
                    : 'Không kịp trả lời.'}
              </div>
            </motion.div>

            {/* points */}
            <div className="mt-3 space-y-1.5">
              {Object.entries(r.deltas).map(([id, d], i) => {
                const p = byId(state, id);
                if (!p) return null;
                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.6 + i * 0.12 }}
                    className="flex items-center gap-2 rounded-xl bg-paper px-2.5 py-1.5"
                  >
                    <Avatar index={p.avatar} color={p.color} size={26} mood="happy" />
                    <span className="flex-1 truncate text-sm font-semibold">
                      {p.name}
                      {id === r.qmId && <span className="ml-1 text-[10px] font-bold text-rose">RA ĐỀ</span>}
                    </span>
                    <motion.span
                      initial={{ y: -30, scale: 0, rotate: -90 }}
                      animate={{ y: 0, scale: 1, rotate: 0 }}
                      transition={{ delay: 1.8 + i * 0.12, type: 'spring', stiffness: 400, damping: 14 }}
                    >
                      <PointChip value={d as 1 | 2} size={24} />
                    </motion.span>
                    <span className="w-7 text-right text-sm font-bold tabular-nums">{p.score}</span>
                  </motion.div>
                );
              })}
              {!qm && fakeWon && <div className="text-center text-[11px] text-ink-3">Máy ra đề nên chỉ hoạ sĩ dởm được điểm.</div>}
            </div>

            {/* who pointed at whom */}
            <div className="mt-3">
              <div className="label mb-1">Kết quả chỉ tay</div>
              <div className="space-y-1">
                {tally.map(([id, n]) => {
                  const p = byId(state, id);
                  if (!p) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className={`w-20 truncate ${id === r.fakeId ? 'font-bold text-rose' : 'text-ink-2'}`}>{p.name}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: penHex(p.color) }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(n / maxVotes) * 100}%` }}
                          transition={{ delay: 0.4, duration: 0.6 }}
                        />
                      </div>
                      <span className="w-4 text-right font-bold tabular-nums">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
              <span className="text-xs text-ink-3">
                Tự chuyển sau <Timer deadline={state.deadline} className="!text-xs" />
              </span>
              {isHost && (
                <button type="button" onClick={onNext} className="btn btn-ink">
                  Tiếp tục →
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------- game end */

export function GameEnd({
  state,
  youId,
  isHost,
  onRestart,
  onLeave,
}: {
  state: GameState;
  youId: string;
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const ranked = useMemo(() => [...state.players].sort((a, b) => b.score - a.score), [state.players]);
  const youWon = state.winnerIds.includes(youId);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    sfx.win();
  }, []);

  const art = open !== null ? state.gallery[open] : null;

  return (
    <>
      <Confetti count={110} />
      <Modal className="max-w-4xl" z="z-40">
        <div className="text-center">
          <motion.div
            animate={{ rotate: [0, -6, 6, -4, 0], y: [0, -6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1 }}
            className="mx-auto w-fit"
          >
            <svg width="76" height="76" viewBox="0 0 100 100" aria-hidden>
              <path d="M28 14h44v22c0 14-10 24-22 24S28 50 28 36z" fill="#dca22a" stroke="#2b2723" strokeWidth="4" strokeLinejoin="round" />
              <path d="M28 22H14c0 12 6 18 16 18M72 22h14c0 12-6 18-16 18" fill="none" stroke="#2b2723" strokeWidth="4" />
              <path d="M44 60h12v12H44zM32 72h36v12H32z" fill="#c8466f" stroke="#2b2723" strokeWidth="4" strokeLinejoin="round" />
            </svg>
          </motion.div>
          <h2 className="display text-3xl font-extrabold">{youWon ? 'Bạn thắng rồi!' : 'Hạ màn!'}</h2>
          <p className="text-sm text-ink-2">
            {state.players
              .filter((p) => state.winnerIds.includes(p.id))
              .map((p) => p.name)
              .join(', ')}{' '}
            là bậc thầy hội hoạ New York
          </p>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.6fr]">
          <ul className="space-y-2">
            {ranked.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  state.winnerIds.includes(p.id) ? 'bg-rose-soft ring-2 ring-rose/40' : 'bg-paper'
                }`}
              >
                <span className="display w-5 text-center text-sm font-extrabold text-ink-3">{i + 1}</span>
                <Avatar index={p.avatar} color={p.color} size={34} mood={state.winnerIds.includes(p.id) ? 'happy' : 'calm'} />
                <span className="display flex-1 truncate font-bold">{p.name}</span>
                <span className="display text-xl font-extrabold tabular-nums text-rose">{p.score}</span>
              </motion.li>
            ))}
          </ul>

          <div>
            <div className="label mb-2">Phòng tranh của ván này — chạm để xem lại</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {state.gallery.map((a, i) => (
                <motion.button
                  key={a.round}
                  type="button"
                  onClick={() => {
                    sfx.tap();
                    setOpen(i);
                  }}
                  initial={{ opacity: 0, scale: 0.8, rotate: (i % 2 ? 1 : -1) * 4 }}
                  animate={{ opacity: 1, scale: 1, rotate: (i % 2 ? 1 : -1) * 1.5 }}
                  whileHover={{ rotate: 0, y: -4 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="text-left"
                >
                  <Canvas strokes={a.strokes} className="!p-1.5 before:!hidden" />
                  <div className="hand mt-1 truncate text-center text-base leading-tight">«{a.title}»</div>
                  <div className="truncate text-center text-[10px] text-ink-3">
                    Dởm: {a.fakeName} · {a.winner === 'fake' ? 'thoát' : 'bị bắt'}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {isHost && (
            <button type="button" onClick={onRestart} className="btn btn-rose flex-1">
              Chơi ván mới
            </button>
          )}
          <button type="button" onClick={onLeave} className="btn btn-ghost flex-1">
            Rời bàn
          </button>
        </div>
      </Modal>

      <AnimatePresence>
        {art && (
          <Modal className="max-w-2xl" z="z-50" onClose={() => setOpen(null)}>
            <Canvas strokes={art.strokes} replayKey={open!} plate={{ title: art.title, subtitle: `${art.category} · vòng ${art.round}` }} />
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-2">
                Hoạ sĩ dởm: <b className="text-rose">{art.fakeName}</b>
              </span>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setOpen(null)}>
                Đóng
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
