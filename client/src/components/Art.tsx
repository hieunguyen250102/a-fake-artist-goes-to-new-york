/**
 * Every piece of the box, redrawn as SVG: the bust characters from the
 * rulebook, the title cards, the point chips and the markers. Vector, so it
 * stays crisp from a phone to a projector.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { PEN_COLORS } from '@shared/engine';

const INK = '#2b2723';
const PAPER = '#fffdf9';

export function penHex(color: number): string {
  return PEN_COLORS[color]?.hex ?? PEN_COLORS[0].hex;
}

/* ---------------------------------------------------------------- avatar */

export type Mood = 'calm' | 'happy' | 'shock' | 'sly';

/** Hats, hair and glasses — one per avatar index, drawn over the head. */
function Accessory({ kind, color }: { kind: number; color: string }) {
  switch (kind % 10) {
    case 0: // beret, the artist's hat
      return (
        <g>
          <path d="M27 27c4-12 20-17 34-12 7 3 10 8 9 13-12-4-30-4-43-1z" fill={color} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M49 15l1-5" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 1: // round glasses
      return (
        <g fill="none" stroke={INK} strokeWidth="2.6">
          <circle cx="41" cy="41" r="7" fill="#fff" fillOpacity="0.4" />
          <circle cx="59" cy="41" r="7" fill="#fff" fillOpacity="0.4" />
          <path d="M48 41h4M34 40l-6-2M66 40l6-2" />
        </g>
      );
    case 2: // curled moustache + side parting
      return (
        <g>
          <path d="M41 50c3-3 6-3 9 0 3-3 6-3 9 0-1 3-5 4-9 2-4 2-8 1-9-2z" fill={INK} />
          <path d="M29 33c6-12 26-16 40-6-12-2-26 0-40 6z" fill={INK} />
        </g>
      );
    case 3: // ribbon bow
      return (
        <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" fill={color}>
          <path d="M58 20l12-9 2 14z" />
          <path d="M58 20l-4-13 13 3z" />
          <circle cx="59" cy="19" r="3.5" />
        </g>
      );
    case 4: // curly hair
      return (
        <path
          d="M28 38c-5-6-1-14 5-14 0-7 8-10 13-6 3-6 12-6 15 0 6-3 12 2 11 8 6 1 7 9 2 12-3-9-10-14-23-14s-20 5-23 14z"
          fill={INK}
        />
      );
    case 5: // baseball cap
      return (
        <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
          <path d="M29 32c0-11 9-18 21-18s21 7 21 18z" fill={color} />
          <path d="M60 32h19c0 3-3 5-7 5H56z" fill={color} />
          <circle cx="50" cy="14" r="2.5" fill={INK} />
        </g>
      );
    case 6: // top bun
      return (
        <g fill={INK}>
          <circle cx="50" cy="15" r="8" />
          <path d="M28 36c2-10 11-16 22-16s20 6 22 16c-6-5-14-8-22-8s-16 3-22 8z" />
        </g>
      );
    case 7: // spiky hair
      return <path d="M28 34l2-12 6 6 3-12 7 8 4-12 5 11 6-9 3 12 7-5-1 13c-7-6-14-8-21-8s-15 2-21 8z" fill={INK} />;
    case 8: // headphones
      return (
        <g stroke={INK} strokeWidth="3" fill={color}>
          <path d="M26 42c0-18 11-26 24-26s24 8 24 26" fill="none" />
          <rect x="21" y="36" width="9" height="14" rx="4" />
          <rect x="70" y="36" width="9" height="14" rx="4" />
        </g>
      );
    default: // a flower behind the ear
      return (
        <g stroke={INK} strokeWidth="2">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="70" cy="21" rx="4.2" ry="7" fill={color} transform={`rotate(${a} 70 28)`} />
          ))}
          <circle cx="70" cy="28" r="3.5" fill="#f1c24b" />
        </g>
      );
  }
}

function Face({ mood }: { mood: Mood }) {
  return (
    <g>
      {mood === 'shock' ? (
        <g fill={INK}>
          <circle cx="42" cy="41" r="3" />
          <circle cx="58" cy="41" r="3" />
        </g>
      ) : (
        <g fill={INK}>
          <circle cx="42" cy="41" r="2.4" />
          <circle cx="58" cy="41" r="2.4" />
        </g>
      )}
      {mood === 'sly' && <path d="M37 35l8 2M63 35l-8 2" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
      {/* the rulebook's little hooked nose */}
      <path d="M50 42c-2 3-2 5 1 6" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      {mood === 'happy' && <path d="M44 51c3 5 9 5 12 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />}
      {mood === 'calm' && <path d="M46 53c3 1 6 1 8 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
      {mood === 'sly' && <path d="M45 52c4 2 8 1 11-2" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
      {mood === 'shock' && <ellipse cx="50" cy="54" rx="3.2" ry="4" fill={INK} />}
    </g>
  );
}

/** A bust in the rulebook's style: paper-white head, shirt in the player's marker colour. */
export const Avatar = memo(function Avatar({
  index,
  color,
  size = 44,
  mood = 'calm',
  dim,
}: {
  index: number;
  color: number;
  size?: number;
  mood?: Mood;
  dim?: boolean;
}) {
  const hex = penHex(color);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ opacity: dim ? 0.45 : 1, overflow: 'visible' }}>
      <path d="M16 100c1-17 14-28 34-28s33 11 34 28z" fill={hex} stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="50" cy="42" r="23" fill={PAPER} stroke={INK} strokeWidth="3.2" />
      <Face mood={mood} />
      <Accessory kind={index} color={hex} />
    </svg>
  );
});

/* ------------------------------------------------------------ title card */

/**
 * The back of a title card: the owner's marker colour, a pale sash and a
 * pen nib, like the cards in the box.
 */
export function CardBack({ color, className = '' }: { color: number; className?: string }) {
  const hex = penHex(color);
  return (
    <svg viewBox="0 0 100 150" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="97" height="147" rx="10" fill={hex} stroke={INK} strokeWidth="3" />
      <path d="M1.5 98L98.5 38v34L1.5 132z" fill="#fff" opacity="0.2" />
      <g transform="translate(50 76) rotate(-32)">
        <path d="M-9-22h18l6 22L0 26-15 0z" fill={PAPER} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M0 26V4" stroke={INK} strokeWidth="2.2" />
        <circle cx="0" cy="2" r="3" fill={INK} />
      </g>
    </svg>
  );
}

/** The face of a title card: the title in handwriting, or the dreaded X. */
export function CardFront({
  title,
  category,
  className = '',
}: {
  title: string | null;
  category: string | null;
  className?: string;
}) {
  const isX = title === null;
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[10px] border-[3px] border-ink bg-[#fffdf9] p-2 text-center ${className}`}
      style={{ containerType: 'inline-size' }}
    >
      {category && (
        <div className="absolute inset-x-0 top-1.5 truncate px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          {category}
        </div>
      )}
      {isX ? (
        <svg viewBox="0 0 100 100" className="w-3/4" aria-label="X — bạn là hoạ sĩ dởm">
          <path d="M20 18C40 40 60 62 82 84" stroke="#c8466f" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M80 16C60 38 38 62 18 82" stroke="#c8466f" strokeWidth="13" strokeLinecap="round" fill="none" />
        </svg>
      ) : (
        <div className="hand break-words text-[clamp(0.9rem,21cqw,2.6rem)] leading-tight text-ink">{title}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- chips */

/** Point chips from the box: cobalt "1", rose "2". */
export function PointChip({ value, size = 22 }: { value: 1 | 2; size?: number }) {
  const fill = value === 1 ? '#2f7fc1' : '#c8466f';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18.5" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="20" cy="20" r="13.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" />
      <text x="20" y="27.5" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="22" fill="#fff">
        {value}
      </text>
    </svg>
  );
}

/** A score as chips: as many 2s as fit, then a 1. */
export function ChipRow({ score, size = 16, max = 5 }: { score: number; size?: number; max?: number }) {
  const twos = Math.floor(score / 2);
  const chips: (1 | 2)[] = [...Array(twos).fill(2), ...(score % 2 ? [1] : [])];
  const shown = chips.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((v, i) => (
        <motion.span
          key={`${i}-${v}`}
          initial={{ scale: 0, y: -8 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          style={{ marginLeft: i ? -size * 0.35 : 0 }}
        >
          <PointChip value={v} size={size} />
        </motion.span>
      ))}
      {chips.length > max && <span className="ml-0.5 text-[10px] font-bold text-ink-2">+</span>}
    </span>
  );
}

/* --------------------------------------------------------------- marker */

/** A felt-tip marker, tip at the origin's bottom-left, for cursors and the colour rack. */
export function Marker({ color, size = 40, capOff }: { color: number; size?: number; capOff?: boolean }) {
  const hex = penHex(color);
  return (
    <svg width={size} height={size * 3.4} viewBox="0 0 30 102" aria-hidden>
      {/* tip */}
      <path d="M11 88l4 12 4-12z" fill={hex} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 80h12v9H9z" fill="#e8e1d6" stroke={INK} strokeWidth="1.6" />
      {/* barrel */}
      <rect x="6" y="30" width="18" height="51" rx="3" fill="#fbf8f2" stroke={INK} strokeWidth="1.8" />
      <rect x="6" y="50" width="18" height="10" fill={hex} stroke={INK} strokeWidth="1.8" />
      {/* cap */}
      {!capOff && <rect x="5" y="2" width="20" height="32" rx="5" fill={hex} stroke={INK} strokeWidth="1.8" />}
      {!capOff && <path d="M22 8v20" stroke="#fff" strokeOpacity="0.4" strokeWidth="2.4" strokeLinecap="round" />}
      {capOff && <rect x="6" y="26" width="18" height="6" rx="2" fill={hex} stroke={INK} strokeWidth="1.8" />}
    </svg>
  );
}

/* ----------------------------------------------------------------- logo */

/** "Hoạ Sĩ Dởm" in fat brush lettering over a doodled New York skyline. */
export function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="display text-xl font-extrabold leading-none text-ink sm:text-2xl">
          Hoạ Sĩ <span className="text-rose">Dởm</span>
        </span>
      </div>
    );
  }
  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <svg viewBox="0 0 360 150" className="h-auto w-full max-w-sm" role="img" aria-label="Hoạ Sĩ Dởm đến New York">
        {/* skyline, drawn with one marker line */}
        <motion.path
          d="M20 112h24V84h16v28h10V62h8V48h6v14h8v50h14V70h20v42h10V30l6-12 6 12v82h12V76h18v36h14V58h22v54h12V90h14v22h20V74h16v38h30"
          fill="none"
          stroke="#2f7fc1"
          strokeOpacity="0.45"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        />
        <text
          x="180"
          y="104"
          textAnchor="middle"
          fontFamily="'Baloo 2', sans-serif"
          fontWeight="800"
          fontSize="62"
          fill={INK}
          stroke="#f3ede3"
          strokeWidth="10"
          paintOrder="stroke"
        >
          Hoạ Sĩ <tspan fill="#c8466f">Dởm</tspan>
        </text>
        <text x="180" y="138" textAnchor="middle" fontFamily="'Patrick Hand', cursive" fontSize="25" fill="#5f574e">
          ~ đến New York ~
        </text>
      </svg>
    </motion.div>
  );
}
