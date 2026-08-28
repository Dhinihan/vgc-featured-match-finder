import { NextRequest, NextResponse } from "next/server";
import { adminRefreshSecret } from "@/env";
import { listRecentEvents } from "@/services/recent-events";
import { registerEvent } from "@/services/register-event";

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

/** Cadastro manual de evento por ID RK9 (substitui o indice PokéData). */
export async function POST(request: NextRequest) {
  if (request.headers.get("x-admin-secret") !== adminRefreshSecret()) {
    return NextResponse.json({ error: "segredo de admin inválido" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { externalEventId?: string };
    if (!body.externalEventId) {
      return NextResponse.json({ error: "externalEventId é obrigatório" }, { status: 400 });
    }

    const event = await registerEvent(body.externalEventId);
    return NextResponse.json(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao cadastrar evento";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
