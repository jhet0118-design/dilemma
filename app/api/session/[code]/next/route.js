import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { makePairs, TTL_SECONDS } from "@/lib/game";

// POST /api/session/:code/next — the teacher advances to the next
// round, or (past the last round) marks the game finished.
export async function POST(_req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meta.status !== "playing") {
    return NextResponse.json({ error: "not_playing" }, { status: 409 });
  }

  if (meta.currentRound >= meta.totalRounds) {
    await kv.set(`sess:${code}:meta`, { ...meta, status: "finished" }, { ex: TTL_SECONDS });
    return NextResponse.json({ ok: true, finished: true });
  }

  const nextRound = meta.currentRound + 1;
  let pairs;
  if (meta.pairingMode === "fixed" && meta.fixedPairs) {
    pairs = meta.fixedPairs;
  } else {
    const playersHash = (await kv.hgetall(`sess:${code}:players`)) || {};
    pairs = makePairs(Object.keys(playersHash));
  }

  await kv.set(`sess:${code}:meta`, { ...meta, currentRound: nextRound }, { ex: TTL_SECONDS });
  await kv.set(`sess:${code}:round:${nextRound}`, { pairs, createdAt: Date.now() }, { ex: TTL_SECONDS });

  return NextResponse.json({ ok: true });
}
