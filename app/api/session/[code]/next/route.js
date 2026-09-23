import { NextResponse } from "next/server";
import kv from "@/lib/kv";
import { advanceRound } from "@/lib/advance";

// POST /api/session/:code/next — the teacher manually forces the game
// on to the next round (or to "finished" past the last one). Rounds
// normally advance on their own once everyone's answered or time runs
// out (see lib/advance.js); this is just an override for the teacher.
export async function POST(_req, { params }) {
  const { code } = params;

  const meta = await kv.get(`sess:${code}:meta`);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meta.status !== "playing") {
    return NextResponse.json({ error: "not_playing" }, { status: 409 });
  }

  const updated = await advanceRound(code, meta, { force: true });
  return NextResponse.json({ ok: true, finished: (updated || meta).status === "finished" });
}
