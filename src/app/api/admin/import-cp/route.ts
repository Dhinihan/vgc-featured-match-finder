import { NextRequest, NextResponse } from "next/server";
import { adminRefreshSecret } from "@/env";
import { importChampionshipPoints } from "@/services/cp-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (request.headers.get("x-admin-secret") !== adminRefreshSecret()) {
    return NextResponse.json({ error: "segredo de admin inválido" }, { status: 401 });
  }

  try {
    const result = await importChampionshipPoints();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao importar CP";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
