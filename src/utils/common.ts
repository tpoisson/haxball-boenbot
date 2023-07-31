export function pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const d1 = p1.x - p2.x;
  const d2 = p1.y - p2.y;
  return Math.sqrt(d1 * d1 + d2 * d2);
}

// On est en match uniquement quand 2 équipes contiennent des joueurs inscrits
export function isMatch(room: RoomObject) {
  return room.getPlayerList().some((p) => p.team === 1) && room.getPlayerList().some((p) => p.team === 2);
}
