/**
 * Bots can't read a title, so they doodle: a plausible marker line near what
 * is already on the paper. Good enough to fill seats and to try the game alone.
 */

import { CANVAS_H, CANVAS_W } from '../../shared/engine';
import type { Stroke } from '../../shared/types';

const MARGIN = 60;

function clampX(x: number) {
  return Math.round(Math.min(CANVAS_W - MARGIN, Math.max(MARGIN, x)));
}
function clampY(y: number) {
  return Math.round(Math.min(CANVAS_H - MARGIN, Math.max(MARGIN, y)));
}

/** Start near an existing line so the picture grows as one thing. */
function startPoint(strokes: Stroke[], rng: () => number): [number, number] {
  const withPoints = strokes.filter((s) => s.points.length >= 2);
  if (!withPoints.length) {
    return [CANVAS_W / 2 + (rng() - 0.5) * 300, CANVAS_H / 2 + (rng() - 0.5) * 220];
  }
  const s = withPoints[Math.floor(rng() * withPoints.length)];
  const i = Math.floor((rng() * s.points.length) / 2) * 2;
  return [s.points[i] + (rng() - 0.5) * 120, s.points[i + 1] + (rng() - 0.5) * 120];
}

export function botStroke(strokes: Stroke[], rng: () => number): number[] {
  let [x, y] = startPoint(strokes, rng);
  const pts: number[] = [clampX(x), clampY(y)];
  const kind = rng();

  if (kind < 0.25) {
    // a loop — heads, wheels, suns
    const r = 35 + rng() * 70;
    const cx = x + r;
    const start = Math.PI;
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const a = start + (i / steps) * Math.PI * 2 * (0.9 + rng() * 0.15);
      pts.push(clampX(cx + Math.cos(a) * r), clampY(y + Math.sin(a) * r * (0.8 + rng() * 0.1)));
    }
    return pts;
  }

  if (kind < 0.4) {
    // a zigzag — fur, grass, flames
    const dir = rng() * Math.PI * 2;
    const teeth = 4 + Math.floor(rng() * 4);
    const len = 22 + rng() * 18;
    for (let i = 1; i <= teeth * 2; i++) {
      const side = i % 2 ? 1 : -1;
      x += Math.cos(dir) * len + Math.cos(dir + Math.PI / 2) * side * len * 0.9;
      y += Math.sin(dir) * len + Math.sin(dir + Math.PI / 2) * side * len * 0.9;
      pts.push(clampX(x), clampY(y));
    }
    return pts;
  }

  // a wandering curve — legs, tails, outlines
  let angle = rng() * Math.PI * 2;
  let turn = (rng() - 0.5) * 0.25;
  const steps = 22 + Math.floor(rng() * 30);
  for (let i = 0; i < steps; i++) {
    turn += (rng() - 0.5) * 0.08;
    turn = Math.max(-0.3, Math.min(0.3, turn));
    angle += turn;
    x += Math.cos(angle) * 14;
    y += Math.sin(angle) * 14;
    // bounce off the edges rather than smearing along them
    if (x < MARGIN || x > CANVAS_W - MARGIN) angle = Math.PI - angle;
    if (y < MARGIN || y > CANVAS_H - MARGIN) angle = -angle;
    pts.push(clampX(x), clampY(y));
  }
  return pts;
}
