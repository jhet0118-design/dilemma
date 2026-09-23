import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { scorePairIfReady, scoreByeIfReady } from "@/lib/score";

// GET /api/session/:code — the single endpoint every client polls.
// Returns the session config, the roster with running scores, and
// (while a round is live) that round's pairing and submitted moves.
export async function GET(_req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let round = null;
  let moves = {};

  if (meta.status === "playing" && meta.currentRound > 0) {
    round = await kv.get(`sess:${code}:round:${meta.currentRound}`);
    moves = (await kv.hgetall(`sess:${code}:round:${meta.currentRound}:moves`)) || {};

    // Self-healing: score any pair that's complete but wasn't scored yet
    // (covers the rare case of two near-simultaneous submissions).
    if (round?.pairs) {
      for (const pr of round.pairs) {
        if (pr.bye) {
          if (moves[pr.a]) await scoreByeIfReady(code, meta, meta.currentRound, pr.a);
        } else if (moves[pr.a] && moves[pr.b]) {
          await scorePairIfReady(code, meta, meta.currentRound, pr.a, pr.b);
        }
      }
    }
  }

  const playersHash = (await kv.hgetall(`sess:${code}:players`)) || {};
  const players = Object.entries(playersHash).map(([id, v]) => ({ id, ...v }));

  return NextResponse.json({ meta, players, round, moves });
}
