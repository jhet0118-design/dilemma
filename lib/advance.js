import kv from "@/lib/kv";
import { TTL_SECONDS, pairsForRound, buildRoundRecord } from "@/lib/game";
import { scorePairIfReady, scoreByeIfReady } from "@/lib/score";

// If a round has a time limit and it has passed, fills in "배신"(D) for
// anyone in the current round who still hasn't submitted. Only ever
// writes the missing side of a pair — never touches a move that's
// already there — so it's safe to call from every poll.
export async function applyTimeoutDefects(code, roundNum, round, moves) {
  if (!round?.deadline || Date.now() < round.deadline) return moves;

  const movesKey = `sess:${code}:round:${roundNum}:moves`;
  const toWrite = {};
  for (const pr of round.pairs || []) {
    const ids = pr.bye ? [pr.a] : [pr.a, pr.b];
    for (const id of ids) {
      if (!moves[id]) {
        const move = { choice: "D", auto: true, submittedAt: Date.now() };
        if (pr.bye) move.botChoice = Math.random() < 0.65 ? "C" : "D";
        toWrite[id] = move;
      }
    }
  }
  if (Object.keys(toWrite).length === 0) return moves;

  await kv.hset(movesKey, toWrite);
  await kv.expire(movesKey, TTL_SECONDS);
  return { ...moves, ...toWrite };
}

function roundIsComplete(round, moves) {
  if (!round?.pairs?.length) return false;
  return round.pairs.every((pr) => (pr.bye ? !!moves[pr.a] : !!moves[pr.a] && !!moves[pr.b]));
}

// Advances the session to the next round (or to "finished" past the
// last one). `force` skips the completeness check for the teacher's
// manual "next round" button; otherwise it only advances once every
// pair in the current round has a move in. Uses a per-round lock so
// concurrent callers (many students polling/submitting at once) never
// double-advance.
export async function advanceRound(code, meta, { force = false, moves = null } = {}) {
  if (meta.status !== "playing") return null;

  if (!force) {
    const round = await kv.get(`sess:${code}:round:${meta.currentRound}`);
    const mv = moves || (await kv.hgetall(`sess:${code}:round:${meta.currentRound}:moves`)) || {};
    if (!roundIsComplete(round, mv)) return null;
  }

  const lockKey = `sess:${code}:round:${meta.currentRound}:advanced`;
  const gotLock = await kv.set(lockKey, "1", { nx: true, ex: TTL_SECONDS });
  if (!gotLock) return null; // someone else already advanced this round

  if (meta.currentRound >= meta.totalRounds) {
    const nextMeta = { ...meta, status: "finished" };
    await kv.set(`sess:${code}:meta`, nextMeta, { ex: TTL_SECONDS });
    return nextMeta;
  }

  const nextRoundNum = meta.currentRound + 1;
  const playersHash = (await kv.hgetall(`sess:${code}:players`)) || {};
  const pairs = pairsForRound(meta, Object.keys(playersHash));
  const roundRecord = buildRoundRecord(pairs, meta.roundSeconds);

  const nextMeta = { ...meta, currentRound: nextRoundNum };
  await kv.set(`sess:${code}:meta`, nextMeta, { ex: TTL_SECONDS });
  await kv.set(`sess:${code}:round:${nextRoundNum}`, roundRecord, { ex: TTL_SECONDS });
  return nextMeta;
}

// Full self-healing pass used by the GET route and after every move:
// resolve timeouts, score whatever's ready, then advance if the round
// is done. Returns the (possibly updated) meta.
export async function settleRound(code, meta) {
  if (meta.status !== "playing" || !meta.currentRound) return meta;

  const roundNum = meta.currentRound;
  const round = await kv.get(`sess:${code}:round:${roundNum}`);
  if (!round) return meta;

  let moves = (await kv.hgetall(`sess:${code}:round:${roundNum}:moves`)) || {};
  moves = await applyTimeoutDefects(code, roundNum, round, moves);

  await Promise.all(
    (round.pairs || []).map((pr) =>
      pr.bye
        ? moves[pr.a]
          ? scoreByeIfReady(code, meta, roundNum, pr.a)
          : null
        : moves[pr.a] && moves[pr.b]
        ? scorePairIfReady(code, meta, roundNum, pr.a, pr.b)
        : null
    )
  );

  const updated = await advanceRound(code, meta, { moves });
  return updated || meta;
}
