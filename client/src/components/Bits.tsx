/** Small shared pieces: toast, timer pill, confetti, modal shell, icon buttons. */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRemaining } from '../lib/clock';
import { sfx } from '../lib/sound';

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.94 }}
          className="fixed left-1/2 top-4 z-[70] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl bg-ink px-5 py-2.5 text-center text-sm font-semibold text-paper-2 shadow-[0_4px_0_#000,0_20px_40px_-20px_rgba(0,0,0,0.5)]"
          role="status"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Seconds left, as a pill that turns rose in the last ten seconds. Ticks when `tick` is set. */
export function Timer({ deadline, tick, className = '' }: { deadline: number | null; tick?: boolean; className?: string }) {
  const ms = useRemaining(deadline);
  const s = Math.ceil(ms / 1000);
  const last = useRef(s);
  useEffect(() => {
    if (tick && s !== last.current && s > 0 && s <= 5) sfx.tick();
    last.current = s;
  }, [s, tick]);
  if (!deadline) return null;
  const urgent = s <= 10;
  return (
    <motion.span
      key={urgent ? 'urgent' : 'calm'}
      animate={urgent && s > 0 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 0.9, repeat: Infinity } : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${
        urgent ? 'bg-rose text-white' : 'bg-paper-3 text-ink-2'
      } ${className}`}
      aria-label={`Còn ${s} giây`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9 2h6" />
      </svg>
      {s}s
    </motion.span>
  );
}

export function Confetti({ count = 80 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 1.8,
        color: ['#c8466f', '#2f7fc1', '#dca22a', '#2d9658', '#8a4db2', '#ea7a2a'][i % 6],
        w: 5 + Math.random() * 7,
        spin: Math.random() * 720 - 360,
        squiggle: i % 3 === 0,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0 block"
          style={{
            left: `${b.x}%`,
            width: b.squiggle ? b.w * 2.2 : b.w,
            height: b.squiggle ? 4 : b.w * 0.6,
            background: b.color,
            borderRadius: b.squiggle ? 99 : 2,
          }}
          initial={{ y: -30, opacity: 0, rotate: 0 }}
          animate={{ y: '105vh', opacity: [0, 1, 1, 0], rotate: b.spin, x: [0, 18, -14, 8] }}
          transition={{ duration: b.duration, delay: b.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/** Full-screen dimmer with a panel that springs in. */
export function Modal({
  children,
  className = '',
  onClose,
  z = 'z-40',
}: {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  z?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 ${z} flex items-center justify-center overflow-y-auto bg-[#2b2723]/45 px-3 py-6 backdrop-blur-[2px]`}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className={`panel relative my-auto w-full rounded-3xl p-5 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function IconButton({
  onClick,
  label,
  children,
  active,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-ink/12 transition ${
        active ? 'bg-ink text-paper-2' : 'bg-white text-ink-2 hover:bg-paper'
      }`}
    >
      {children}
    </button>
  );
}

/** Hand-drawn pointing finger for the vote. */
export function PointingHand({ size = 28, color = '#2b2723' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g fill="#fffdf9" stroke={color} strokeWidth="3.2" strokeLinejoin="round">
        <rect x="6" y="22" width="30" height="30" rx="10" />
        <rect x="24" y="22" width="34" height="11" rx="5.5" />
        <path d="M18 33h15a4.5 4.5 0 0 1 0 9H20" />
      </g>
      <path d="M13 43h7M13 48h11" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
