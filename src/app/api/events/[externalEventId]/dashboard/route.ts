import { NextResponse } from "next/server";
import { buildEventDashboard } from "@/services/dashboard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ externalEventId: string }> }
) {
  const { externalEventId } = await params;

  try {
    const dashboard = await buildEventDashboard(externalEventId);
    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao carregar dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
