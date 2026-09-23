import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import kv from "@/lib/kv";
import { TTL_SECONDS } from "@/lib/game";

// POST /api/session/:code/join — a student registers a nickname.
// No account, no password: the returned playerId is the student's
// only credential, saved to their own browser's localStorage.
export async function POST(req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 14);
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const playerId = randomUUID();
  await kv.hset(`sess:${code}:players`, {
    [playerId]: { name, joinedAt: Date.now(), points: {} },
  });
  await kv.expire(`sess:${code}:players`, TTL_SECONDS);

  return NextResponse.json({ playerId });
}
