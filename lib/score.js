import kv from "@/lib/kv";
import { payoffFor } from "@/lib/game";

// Scores a real pair once both moves are in. Safe to call repeatedly:
// it only ever writes a round's points once per player (checks first).
export async function scorePairIfReady(code, meta, roundNum, aId, bId) {
  const movesKey = `sess:${code}:round:${roundNum}:moves`;
  const [mvA, mvB] = await Promise.all([kv.hget(movesKey, aId), kv.hget(movesKey, bId)]);
  if (!mvA || !mvB) return;

  const playersKey = `sess:${code}:players`;
  const [aP, bP] = await Promise.all([kv.hget(playersKey, aId), kv.hget(playersKey, bId)]);
  if (!aP || !bP) return;

  const tasks = [];
  if (aP.points?.[roundNum] === undefined) {
    const next = {
      ...aP,
      points: { ...(aP.points || {}), [roundNum]: payoffFor(mvA.choice, mvB.choice, meta.payoff) },
    };
    tasks.push(kv.hset(playersKey, { [aId]: next }));
  }
  if (bP.points?.[roundNum] === undefined) {
    const next = {
      ...bP,
      points: { ...(bP.points || {}), [roundNum]: payoffFor(mvB.choice, mvA.choice, meta.payoff) },
    };
    tasks.push(kv.hset(playersKey, { [bId]: next }));
  }
  await Promise.all(tasks);
}

// Scores a "bye" player (odd one out) against their computer opponent
// as soon as they submit — no partner to wait for.
export async function scoreByeIfReady(code, meta, roundNum, playerId) {
  const movesKey = `sess:${code}:round:${roundNum}:moves`;
  const mv = await kv.hget(movesKey, playerId);
  if (!mv) return;

  const playersKey = `sess:${code}:players`;
  const p = await kv.hget(playersKey, playerId);
  if (!p) return;
  if (p.points?.[roundNum] !== undefined) return;

  const pts = payoffFor(mv.choice, mv.botChoice, meta.payoff);
  const next = { ...p, points: { ...(p.points || {}), [roundNum]: pts } };
  await kv.hset(playersKey, { [playerId]: next });
}
