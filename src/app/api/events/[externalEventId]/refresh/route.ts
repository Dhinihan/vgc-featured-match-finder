import { NextRequest, NextResponse } from "next/server";
import { adminRefreshSecret } from "@/env";
import { refreshEventPairings } from "@/services/refresh-event";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ externalEventId: string }> }
) {
  const { externalEventId } = await params;

  let force = false;
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    force = body.force === true;
  } catch {
    force = false;
  }

  // Reimportacao forcada ignora TTL e por isso exige o segredo de admin (DEPLOYMENT).
  if (force && request.headers.get("x-admin-secret") !== adminRefreshSecret()) {
    return NextResponse.json({ error: "segredo de admin inválido" }, { status: 401 });
  }

  try {
    const result = await refreshEventPairings(externalEventId, { force });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na atualização.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
