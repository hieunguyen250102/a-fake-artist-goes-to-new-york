/** Waiting room: the code to share, who is here, the marker rack, house rules and chat. */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MAX_PLAYERS, PEN_COLORS, minPlayersFor } from '@shared/engine';
import type { GameState, Settings } from '@shared/types';
import { Avatar, Logo, Marker } from './Art';
import { ChatBox, type ChatItem } from './Chat';
import { sfx } from '../lib/sound';

interface Props {
  state: GameState;
  youId: string;
  onStart: () => void;
  onAddBot: () => void;
  onKick: (id: string) => void;
  onColor: (color: number) => void;
  onSettings: (s: Partial<Settings>) => void;
  onLeave: () => void;
  onShowRules: () => void;
  chat: ChatItem[];
  onSendChat: (text: string) => void;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-xl bg-paper p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`relative flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
            value === o.value ? 'text-paper-2' : 'text-ink-2 hover:text-ink'
          } disabled:cursor-default`}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-ink" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Lobby({
  state,
  youId,
  onStart,
  onAddBot,
  onKick,
  onColor,
  onSettings,
  onLeave,
  onShowRules,
  chat,
  onSendChat,
}: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === youId;
  const need = minPlayersFor(state.settings.qmMode);
  const canStart = state.players.length >= need;
  const me = state.players.find((p) => p.id === youId);
  const owner = new Map(state.players.map((p) => [p.color, p]));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      setCopied(true);
      sfx.chip();
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked — the code is on screen anyway */
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center gap-5 px-4 py-8 lg:max-w-5xl">
      <div className="w-full max-w-xs">
        <Logo />
      </div>

      <div className="grid w-full gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex w-full flex-col gap-5">
          <motion.button
            type="button"
            onClick={copy}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            className="panel w-full rounded-2xl px-5 py-4 text-center transition-colors hover:bg-white"
          >
            <div className="label">Mã bàn — chạm để chép, gửi cho bạn bè</div>
            <div className="display mt-1 text-5xl font-extrabold tracking-[0.3em] text-rose">{state.roomCode}</div>
            <div className="mt-1 h-4 text-xs font-semibold text-sage">{copied ? 'Đã chép!' : ''}</div>
          </motion.button>

          {/* players */}
          <div className="panel w-full rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-base font-bold">
                Hoạ sĩ ({state.players.length}/{MAX_PLAYERS})
              </h2>
              <span className="text-[11px] text-ink-3">{canStart ? 'Đủ người rồi!' : `Cần ít nhất ${need} người`}</span>
            </div>

            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {state.players.map((p) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2.5 rounded-xl bg-paper px-2.5 py-2"
                  >
                    <motion.span animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 0.6, delay: 0.1 }}>
                      <Avatar index={p.avatar} color={p.color} size={36} mood={p.id === youId ? 'happy' : 'calm'} />
                    </motion.span>
                    <span className="min-w-0 flex-1">
                      <span className="display block truncate font-bold leading-tight">
                        {p.name}
                        {p.id === youId && <span className="ml-1 text-xs font-medium text-ink-3">(bạn)</span>}
                      </span>
                      <span className="flex gap-1">
                        {state.hostId === p.id && (
                          <span className="rounded bg-rose-soft px-1.5 text-[9px] font-bold text-rose-deep">CHỦ BÀN</span>
                        )}
                        {p.isBot && <span className="rounded bg-cobalt-soft px-1.5 text-[9px] font-bold text-cobalt-deep">BOT</span>}
                      </span>
                    </span>
                    {isHost && p.id !== youId && (
                      <button
                        type="button"
                        onClick={() => onKick(p.id)}
                        className="rounded-lg px-2 py-0.5 text-xs text-ink-3 hover:bg-rose-soft hover:text-rose"
                        aria-label={`Mời ${p.name} ra`}
                      >
                        ✕
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
              {Array.from({ length: Math.max(0, need - state.players.length) }, (_, i) => (
                <li
                  key={`empty-${i}`}
                  className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-ink/15 px-2.5 py-2 text-sm text-ink-3"
                >
                  <span className="h-9 w-9 rounded-full border-[1.5px] border-dashed border-ink/20" />
                  Đang chờ…
                </li>
              ))}
            </ul>

            {isHost && state.players.length < MAX_PLAYERS && (
              <button type="button" onClick={onAddBot} className="btn btn-ghost mt-3 w-full text-sm">
                + Thêm bot (vẽ nguệch ngoạc cho vui)
              </button>
            )}
          </div>

          {/* marker rack */}
          <div className="panel w-full rounded-2xl p-4">
            <h2 className="display text-base font-bold">Chọn bút của bạn</h2>
            <p className="text-[11px] text-ink-3">Mỗi người một màu — nét của bạn sẽ mang màu này.</p>
            <div className="mt-2 flex justify-between gap-0.5 overflow-x-auto pb-1 pt-3">
              {PEN_COLORS.map((c, i) => {
                const who = owner.get(i);
                const mine = me?.color === i;
                const taken = !!who && !mine;
                return (
                  <motion.button
                    key={c.hex}
                    type="button"
                    disabled={taken}
                    onClick={() => {
                      sfx.select();
                      onColor(i);
                    }}
                    animate={{ y: mine ? -12 : 0, rotate: mine ? -8 : 0 }}
                    whileHover={taken ? undefined : { y: mine ? -12 : -6 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="relative flex shrink-0 flex-col items-center disabled:cursor-not-allowed"
                    title={taken ? `${c.name} — ${who!.name}` : c.name}
                    aria-label={`Bút ${c.name}${taken ? `, ${who!.name} đang dùng` : ''}`}
                    aria-pressed={mine}
                  >
                    <span style={{ opacity: taken ? 0.35 : 1 }}>
                      <Marker color={i} size={20} />
                    </span>
                    {taken && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                        <Avatar index={who!.avatar} color={who!.color} size={18} />
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* house rules */}
          <div className="panel w-full space-y-3 rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-base font-bold">Luật bàn</h2>
              {!isHost && <span className="text-[11px] text-ink-3">Chủ bàn quyết định</span>}
            </div>
            <div>
              <span className="label mb-1">Người ra đề</span>
              <Segmented
                value={state.settings.qmMode}
                disabled={!isHost}
                onChange={(qmMode) => onSettings({ qmMode })}
                options={[
                  { value: 'rotate', label: 'Luân phiên (luật gốc)' },
                  { value: 'auto', label: 'Máy ra đề' },
                ]}
              />
              <p className="mt-1 text-[11px] text-ink-3">
                {state.settings.qmMode === 'rotate'
                  ? 'Mỗi vòng một người ra đề và không vẽ — thắng cùng hoạ sĩ dởm.'
                  : 'Máy chọn đề từ kho từ, ai cũng được vẽ. Cần ít nhất 3 người.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label mb-1">Điểm để thắng</span>
                <Segmented
                  value={state.settings.target}
                  disabled={!isHost}
                  onChange={(target) => onSettings({ target })}
                  options={[3, 5, 7].map((v) => ({ value: v, label: String(v) }))}
                />
              </div>
              <div>
                <span className="label mb-1">Giây mỗi nét</span>
                <Segmented
                  value={state.settings.turnSeconds}
                  disabled={!isHost}
                  onChange={(turnSeconds) => onSettings({ turnSeconds })}
                  options={[20, 40, 60].map((v) => ({ value: v, label: String(v) }))}
                />
              </div>
            </div>
          </div>

          {isHost ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                sfx.go();
                onStart();
              }}
              className="btn btn-rose w-full text-lg"
            >
              {canStart ? 'Bắt đầu vẽ!' : `Cần ít nhất ${need} người`}
            </button>
          ) : (
            <div className="display text-center text-sm text-ink-2">Đang chờ chủ bàn bắt đầu…</div>
          )}
        </div>

        <div className="panel flex h-96 w-full flex-col rounded-2xl p-4 lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)]">
          <h2 className="display text-base font-bold">Trò chuyện</h2>
          <ChatBox messages={chat} youId={youId} onSend={onSendChat} className="mt-2 flex-1" />
        </div>
      </div>

      <div className="flex gap-4 text-xs">
        <button type="button" onClick={onShowRules} className="font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Luật chơi
        </button>
        <button type="button" onClick={onLeave} className="text-ink-3 underline-offset-4 hover:underline">
          Rời bàn
        </button>
      </div>
    </div>
  );
}
