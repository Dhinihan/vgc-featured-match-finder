import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { championshipPointsPlayers, championshipPointsSnapshots } from "@/db/schema";
import type { ChampionshipPointsMeta, ChampionshipPointsPlayer } from "@/domain/types";
import { fetchChampionshipPoints } from "@/sources/play-pokemon";

const INSERT_BATCH_SIZE = 1000;

export type CpImportResult = {
  snapshotId: number;
  playerCount: number;
  calculationDate: string | null;
};

/** Importa o ranking completo da API oficial e persiste como novo snapshot (RN-31). */
export async function importChampionshipPoints(): Promise<CpImportResult> {
  const { players, calculationDate, sourceLabel } = await fetchChampionshipPoints();

  if (players.length === 0) {
    throw new Error("Play! Pokémon API returned no players");
  }

  const [snapshot] = await db
    .insert(championshipPointsSnapshots)
    .values({
      division: "masters",
      playerCount: players.length,
      sourceLabel,
      calculationDate: calculationDate ? new Date(calculationDate) : null
    })
    .returning({ id: championshipPointsSnapshots.id });

  for (let offset = 0; offset < players.length; offset += INSERT_BATCH_SIZE) {
    const batch = players.slice(offset, offset + INSERT_BATCH_SIZE);
    await db.insert(championshipPointsPlayers).values(
      batch.map((player) => ({
        snapshotId: snapshot.id,
        displayName: player.displayName,
        normalizedName: player.normalizedName,
        country: player.country,
        championshipPoints: player.championshipPoints
      }))
    );
  }

  return { snapshotId: snapshot.id, playerCount: players.length, calculationDate };
}

export async function latestCpSnapshot(): Promise<{
  meta: ChampionshipPointsMeta;
  players: ChampionshipPointsPlayer[];
}> {
  const [snapshot] = await db
    .select()
    .from(championshipPointsSnapshots)
    .where(eq(championshipPointsSnapshots.division, "masters"))
    .orderBy(desc(championshipPointsSnapshots.importedAt))
    .limit(1);

  if (!snapshot) {
    return {
      meta: {
        playerCount: 0,
        division: "masters",
        importedAt: null,
        calculationDate: null,
        sourceLabel: null
      },
      players: []
    };
  }

  const rows = await db
    .select()
    .from(championshipPointsPlayers)
    .where(eq(championshipPointsPlayers.snapshotId, snapshot.id));

  return {
    meta: {
      playerCount: snapshot.playerCount,
      division: snapshot.division,
      importedAt: snapshot.importedAt.toISOString(),
      calculationDate: snapshot.calculationDate?.toISOString() ?? null,
      sourceLabel: snapshot.sourceLabel
    },
    players: rows.map((row) => ({
      displayName: row.displayName,
      normalizedName: row.normalizedName,
      country: row.country,
      championshipPoints: row.championshipPoints
    }))
  };
}
