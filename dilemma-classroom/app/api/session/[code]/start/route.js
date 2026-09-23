import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { makePairs, TTL_SECONDS } from "@/lib/game";

// POST /api/session/:code/start — the teacher starts round 1.
// Pairing happens here, server-side, so it can't be gamed by any client.
export async function POST(_req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meta.status !== "lobby") {
    return NextResponse.json({ error: "already_started" }, { status: 409 });
  }

  const playersHash = (await kv.hgetall(`sess:${code}:players`)) || {};
  const ids = Object.keys(playersHash);
  if (ids.length < 2) {
    return NextResponse.json({ error: "not_enough_players" }, { status: 400 });
  }

  const pairs = makePairs(ids);
  const nextMeta = {
    ...meta,
    status: "playing",
    currentRound: 1,
    fixedPairs: meta.pairingMode === "fixed" ? pairs : null,
  };

  await kv.set(`sess:${code}:meta`, nextMeta, { ex: TTL_SECONDS });
  await kv.set(`sess:${code}:round:1`, { pairs, createdAt: Date.now() }, { ex: TTL_SECONDS });

  return NextResponse.json({ ok: true });
}
