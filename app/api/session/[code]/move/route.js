import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { TTL_SECONDS } from "@/lib/game";
import { scorePairIfReady, scoreByeIfReady } from "@/lib/score";

// POST /api/session/:code/move — a student submits Cooperate/Defect
// for the current round. Scoring happens here the instant both sides
// of a pair are in (see lib/score.js), with a self-healing re-check
// in the GET route as a safety net against near-simultaneous writes.
export async function POST(req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meta.status !== "playing") {
    return NextResponse.json({ error: "not_playing" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const playerId = body.playerId;
  const choice = body.choice === "D" ? "D" : "C";
  if (!playerId) {
    return NextResponse.json({ error: "player_required" }, { status: 400 });
  }

  const round = await kv.get(`sess:${code}:round:${meta.currentRound}`);
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });

  const pair = round.pairs.find((pr) => pr.a === playerId || pr.b === playerId);
  if (!pair) return NextResponse.json({ error: "not_in_round" }, { status: 400 });

  const movesKey = `sess:${code}:round:${meta.currentRound}:moves`;
  const move = { choice, submittedAt: Date.now() };
  if (pair.bye) {
    move.botChoice = Math.random() < 0.65 ? "C" : "D";
  }
  await kv.hset(movesKey, { [playerId]: move });
  await kv.expire(movesKey, TTL_SECONDS);

  if (pair.bye) {
    await scoreByeIfReady(code, meta, meta.currentRound, playerId);
  } else {
    await scorePairIfReady(code, meta, meta.currentRound, pair.a, pair.b);
  }

  return NextResponse.json({ ok: true });
}
