export function pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const d1 = p1.x - p2.x;
  const d2 = p1.y - p2.y;
  return Math.sqrt(d1 * d1 + d2 * d2);
}
