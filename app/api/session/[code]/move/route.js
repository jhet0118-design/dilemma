import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { TTL_SECONDS } from "@/lib/game";
import { scorePairIfReady, scoreByeIfReady } from "@/lib/score";
import { advanceRound } from "@/lib/advance";

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
  // A move tagged for a round we've already moved past (e.g. a timeout
  // that fired client-side right as the class auto-advanced) is stale —
  // ignore it instead of writing into whatever round is live now.
  if (body.round !== undefined && Number(body.round) !== meta.currentRound) {
    return NextResponse.json({ ok: true, stale: true });
  }

  const round = await kv.get(`sess:${code}:round:${meta.currentRound}`);
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });

  const pair = round.pairs.find((pr) => pr.a === playerId || pr.b === playerId);
  if (!pair) return NextResponse.json({ error: "not_in_round" }, { status: 400 });

  const movesKey = `sess:${code}:round:${meta.currentRound}:moves`;
  // Whichever choice lands first wins — ignore a second submission (e.g.
  // a real click arriving just after the timeout already auto-filled D).
  const existing = await kv.hget(movesKey, playerId);
  if (existing) return NextResponse.json({ ok: true });

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

  // If that was the last move this round needed, move the whole class
  // on to the next round right away instead of waiting for someone to
  // poll or the teacher to click "next".
  await advanceRound(code, meta);

  return NextResponse.json({ ok: true });
}
