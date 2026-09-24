/**
 * The shared drawing pad. Finished lines are static paths; the line being
 * drawn right now grows as its points stream in, with the artist's marker
 * riding on its tip. Also used read-only for the result and the gallery,
 * where it can replay the painting line by line.
 */

import { memo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CANVAS_H, CANVAS_W } from '@shared/engine';
import type { Stroke } from '@shared/types';
import { Marker, penHex } from './Art';

const LINE = 9;

/** Smooth a point list into quadratic curves through the midpoints. */
export function pathD(pts: number[]): string {
  if (pts.length < 2) return '';
  if (pts.length <= 4) {
    const [x, y] = pts;
    const x2 = pts.length === 4 ? pts[2] : x;
    const y2 = pts.length === 4 ? pts[3] : y;
    // a nudge so a single tap still renders as a round dot
    return `M${x} ${y}L${x2 + 0.01} ${y2}`;
  }
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    d += `Q${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
  }
  d += `L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
  return d;
}

const StrokePath = memo(function StrokePath({
  stroke,
  replayDelay,
}: {
  stroke: Stroke;
  /** seconds; set to animate the line being drawn in */
  replayDelay?: number;
}) {
  const d = pathD(stroke.points);
  const common = {
    d,
    fill: 'none',
    stroke: penHex(stroke.color),
    strokeWidth: LINE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'ink-line',
  };
  if (replayDelay === undefined) return <path {...common} />;
  return (
    <motion.path
      {...common}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{
        pathLength: { duration: 0.55, delay: replayDelay, ease: 'easeInOut' },
        opacity: { duration: 0.01, delay: replayDelay },
      }}
    />
  );
});

export interface DrawInput {
  onBegin: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

interface Props {
  strokes: Stroke[];
  /** the line in progress (someone else's, or yours) */
  live?: Stroke | null;
  /** show the marker riding on the live line */
  showPen?: boolean;
  /** present only while you may draw */
  input?: DrawInput | null;
  /** change this to replay the painting from the first line */
  replayKey?: number | string;
  /** "name the masterpiece" — a museum label along the bottom */
  plate?: { title: string; subtitle?: string } | null;
  className?: string;
  /** hint on the blank page */
  emptyHint?: string;
}

export function Canvas({ strokes, live, showPen, input, replayKey, plate, className = '', emptyHint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);

  /** Screen → canvas units, clamped to the paper. */
  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    return [Math.min(CANVAS_W, Math.max(0, x)), Math.min(CANVAS_H, Math.max(0, y))];
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!input || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    input.onBegin(...toCanvas(e));
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!input || !drawing.current) return;
    // coalesced events give smooth curves on fast strokes
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) input.onMove(...toCanvas(ev));
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    input?.onEnd();
  };

  const liveLast =
    live && live.points.length >= 2 ? [live.points[live.points.length - 2], live.points[live.points.length - 1]] : null;
  const replaying = replayKey !== undefined;
  const blank = !strokes.length && !(live && live.points.length);

  return (
    <div className={`pad ${className}`}>
      <div className="pad-paper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className={`block h-auto w-full select-none ${input ? 'cursor-crosshair' : ''}`}
          style={{ touchAction: input ? 'none' : 'auto' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="img"
          aria-label={plate ? `Bức tranh «${plate.title}»` : 'Tờ giấy vẽ chung'}
        >
          <g key={replaying ? String(replayKey) : 'static'}>
            {strokes.map((s, i) => (
              <StrokePath key={i} stroke={s} replayDelay={replaying ? 0.25 + i * 0.5 : undefined} />
            ))}
          </g>
          {live && live.points.length >= 2 && <StrokePath stroke={live} />}
        </svg>

        {blank && emptyHint && (
          <div className="hand pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xl text-ink-3/70 sm:text-2xl">
            {emptyHint}
          </div>
        )}

        {/* the marker riding on the live line */}
        <AnimatePresence>
          {showPen && live && liveLast && (
            <motion.div
              key={live.playerId}
              className="pointer-events-none absolute"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{
                opacity: 1,
                scale: 1,
                left: `${(liveLast[0] / CANVAS_W) * 100}%`,
                top: `${(liveLast[1] / CANVAS_H) * 100}%`,
              }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ left: { duration: 0.08 }, top: { duration: 0.08 }, default: { duration: 0.2 } }}
              style={{ width: 0, height: 0 }}
            >
              <div style={{ transform: 'translate(-50%, -100%) rotate(28deg)', transformOrigin: '50% 100%', width: 'fit-content' }}>
                <Marker color={live.color} size={18} capOff />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {plate && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: replaying ? 0.4 + strokes.length * 0.5 : 0.2, type: 'spring', stiffness: 260, damping: 20 }}
            className="absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 rounded-md border border-ink/20 bg-[#fbf3df] px-3 py-1 text-center shadow-[0_2px_0_rgba(0,0,0,0.12)]"
          >
            <div className="hand truncate text-lg leading-tight text-ink sm:text-xl">«{plate.title}»</div>
            {plate.subtitle && <div className="truncate text-[10px] text-ink-2">{plate.subtitle}</div>}
          </motion.div>
        )}
      </div>
    </div>
  );
}
