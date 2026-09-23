import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { settleRound } from "@/lib/advance";

// GET /api/session/:code — the single endpoint every client polls.
// Returns the session config, the roster with running scores, and
// (while a round is live) that round's pairing and submitted moves.
export async function GET(_req, { params }) {
  const { code } = params;

  let meta = await kv.get(`sess:${code}:meta`);
  if (!meta) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Self-healing: score any pair that's complete but wasn't scored yet
  // (covers near-simultaneous submissions), fill in "배신" for anyone
  // who ran out of time, and move on to the next round if this one's
  // fully resolved — all from whichever client happens to poll next.
  meta = await settleRound(code, meta);

  let round = null;
  let moves = {};
  if (meta.status === "playing" && meta.currentRound > 0) {
    round = await kv.get(`sess:${code}:round:${meta.currentRound}`);
    moves = (await kv.hgetall(`sess:${code}:round:${meta.currentRound}:moves`)) || {};
  }

  const playersHash = (await kv.hgetall(`sess:${code}:players`)) || {};
  const players = Object.entries(playersHash).map(([id, v]) => ({ id, ...v }));

  return NextResponse.json({ meta, players, round, moves });
}
