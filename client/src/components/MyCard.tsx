/**
 * Your title card, face down so a neighbour can't glance at your screen.
 * Tap to peek; it turns itself back over after a few seconds.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState, PrivateState } from '@shared/types';
import { Avatar, CardBack, CardFront } from './Art';
import { sfx } from '../lib/sound';

interface Props {
  state: GameState;
  priv: PrivateState;
  myColor: number;
  compact?: boolean;
}

export function MyCard({ state, priv, myColor, compact }: Props) {
  const [open, setOpen] = useState(false);
  const dealt = priv.role === 'qm' ? !!priv.fakeId : priv.role !== 'watch' && state.phase !== 'setup';

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 3500);
    return () => clearTimeout(t);
  }, [open]);

  // a new round deals a new card, face down
  useEffect(() => setOpen(false), [state.round]);

  const w = compact ? 'w-14' : 'w-24';

  if (state.phase === 'gameEnd') {
    return <div className={`text-xs text-ink-2 ${compact ? '' : 'rounded-xl bg-paper p-3'}`}>Ván đã kết thúc — xem lại phòng tranh nhé!</div>;
  }

  if (priv.role === 'watch' || state.phase === 'lobby') {
    return (
      <div className={`text-xs text-ink-2 ${compact ? '' : 'rounded-xl bg-paper p-3'}`}>
        Bạn đang xem ván này — sẽ được chia thẻ từ vòng sau.
      </div>
    );
  }

  if (!dealt) {
    return (
      <div className="flex items-center gap-3">
        <motion.div className={`${w} shrink-0 opacity-40`} animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 2, repeat: Infinity }}>
          <CardBack color={myColor} className="w-full" />
        </motion.div>
        <div className="text-xs text-ink-2">{priv.role === 'qm' ? 'Bạn ra đề vòng này.' : 'Đang chờ chia thẻ…'}</div>
      </div>
    );
  }

  if (priv.role === 'qm') {
    const fake = state.players.find((p) => p.id === priv.fakeId);
    return (
      <div className="flex items-center gap-3">
        <CardFront title={priv.title} category={state.category} className={`${w} aspect-[2/3] shrink-0 -rotate-3`} />
        <div className="min-w-0 text-xs text-ink-2">
          <div className="font-semibold text-ink">Bạn là người ra đề</div>
          {fake && (
            <div className="mt-1 flex items-center gap-1.5">
              Thẻ X nằm ở
              <Avatar index={fake.avatar} color={fake.color} size={20} mood="sly" />
              <b className="truncate text-rose">{fake.name}</b>
            </div>
          )}
          {!compact && <div className="mt-1 text-[11px] text-ink-3">Giữ bí mật nhé — bạn thắng cùng hoạ sĩ dởm.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          sfx.flip();
          setOpen((o) => !o);
        }}
        className={`card3d ${w} shrink-0`}
        aria-label={open ? 'Úp thẻ lại' : 'Lật thẻ để xem'}
      >
        <motion.div
          className="card3d-inner relative aspect-[2/3] w-full"
          animate={{ rotateY: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <div className="card-face absolute inset-0">
            <CardBack color={myColor} className="h-full w-full" />
          </div>
          <div className="card-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
            <CardFront title={priv.role === 'fake' ? null : priv.title} category={state.category} className="h-full w-full" />
          </div>
        </motion.div>
      </button>
      <div className="min-w-0 text-xs text-ink-2">
        <div className="font-semibold text-ink">Thẻ của bạn</div>
        <div>{open ? (priv.role === 'fake' ? 'Bạn là hoạ sĩ dởm! Diễn cho khéo.' : 'Đừng để lộ tên tranh!') : 'Chạm để xem lén'}</div>
        {state.category && !compact && (
          <div className="mt-1 text-[11px] text-ink-3">
            Chủ đề: <b className="text-ink-2">{state.category}</b>
          </div>
        )}
      </div>
    </div>
  );
}
