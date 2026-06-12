import { NextResponse } from "next/server";
import { listRecentEvents } from "@/services/recent-events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listRecentEvents();
    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao listar torneios recentes";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
