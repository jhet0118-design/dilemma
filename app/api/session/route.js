import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { genCode, TTL_SECONDS } from "@/lib/game";

// POST /api/session  — a teacher creates a new game.
// body: { totalRounds, pairingMode: 'fixed'|'random', payoff: {R,P,T,S} }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const totalRounds = Math.max(1, Math.min(20, parseInt(body.totalRounds, 10) || 6));
  const pairingMode = body.pairingMode === "fixed" ? "fixed" : "random";
  const payoff = {
    R: Number(body.payoff?.R ?? 3),
    P: Number(body.payoff?.P ?? 1),
    T: Number(body.payoff?.T ?? 5),
    S: Number(body.payoff?.S ?? 0),
  };

  let code = null;
  for (let i = 0; i < 8; i++) {
    const candidate = genCode();
    const exists = await kv.get(`sess:${candidate}:meta`);
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "code_gen_failed" }, { status: 500 });
  }

  const meta = {
    status: "lobby",
    totalRounds,
    currentRound: 0,
    pairingMode,
    payoff,
    fixedPairs: null,
    createdAt: Date.now(),
  };

  await kv.set(`sess:${code}:meta`, meta, { ex: TTL_SECONDS });

  return NextResponse.json({ code });
}
