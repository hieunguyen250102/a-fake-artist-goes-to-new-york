/** Table talk: a message list with a composer, used in the lobby and beside the pad. */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChatMessage } from '@shared/types';
import { Avatar, penHex } from './Art';

/** A message plus when *this* browser received it (0 for history), for seat bubbles. */
export type ChatItem = ChatMessage & { recvAt: number };

const QUICK = ['🤔', 'Nghi lắm!', 'Không phải tôi 😇', 'Đẹp quá!', 'GG'];

function time(at: number) {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

interface Props {
  messages: ChatItem[];
  youId: string;
  onSend: (text: string) => void;
  autoFocus?: boolean;
  className?: string;
}

export function ChatBox({ messages, youId, onSend, autoFocus, className = '' }: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the newest message, the way every chat does.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-6 text-center text-xs text-ink-3">
            Chưa có tin nhắn nào — chào mọi người một câu đi!
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            if (m.system) {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mx-auto w-fit max-w-[95%] rounded-full bg-paper-3/70 px-3 py-1 text-center text-[11px] leading-snug text-ink-2"
                >
                  {m.text}
                </motion.div>
              );
            }
            const mine = m.playerId === youId;
            const prev = messages[i - 1];
            const grouped = !!prev && !prev.system && prev.playerId === m.playerId && m.at - prev.at < 60_000;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '!mt-0.5' : ''}`}
              >
                {!mine && (
                  <span className={`shrink-0 ${grouped ? 'invisible' : ''}`}>
                    <Avatar index={m.avatar} color={m.color} size={26} />
                  </span>
                )}
                <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!grouped && (
                    <div className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[10px] text-ink-3">
                      {!mine && (
                        <span className="font-semibold" style={{ color: penHex(m.color) }}>
                          {m.name}
                        </span>
                      )}
                      <span className="tabular-nums">{time(m.at)}</span>
                    </div>
                  )}
                  <div
                    className={`break-words rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                      mine ? 'rounded-br-md bg-ink text-paper-2' : 'rounded-bl-md border border-ink/10 bg-white text-ink'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="scrollbar-thin mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="shrink-0 rounded-full border border-ink/12 bg-white px-2.5 py-0.5 text-xs text-ink-2 hover:bg-paper"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={240}
          autoFocus={autoFocus}
          placeholder="Nhắn gì đó…"
          aria-label="Tin nhắn"
          className="field min-w-0 flex-1 !py-2 text-sm"
        />
        <button type="submit" disabled={!draft.trim()} className="btn btn-rose !px-3.5 !py-2 text-sm" aria-label="Gửi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
