import type { ThreadStatusSnapshot } from "./types";

export interface TilePosition {
  contextId: string;
  deviceId: string;
  row: number;
  column: number;
}

export interface TileAssignment {
  rank: number;
  snapshot?: ThreadStatusSnapshot;
}

export function assignInOrder(
  tiles: Iterable<TilePosition>,
  threads: Iterable<ThreadStatusSnapshot>
): Map<string, TileAssignment> {
  const ordered = [...threads];
  const byDevice = new Map<string, TilePosition[]>();

  for (const tile of tiles) {
    const deviceTiles = byDevice.get(tile.deviceId) ?? [];
    deviceTiles.push(tile);
    byDevice.set(tile.deviceId, deviceTiles);
  }

  const result = new Map<string, TileAssignment>();
  for (const deviceTiles of byDevice.values()) {
    deviceTiles.sort(
      (a, b) => a.row - b.row || a.column - b.column || a.contextId.localeCompare(b.contextId)
    );
    deviceTiles.forEach((tile, index) => {
      const snapshot = ordered[index];
      result.set(tile.contextId, {
        rank: index + 1,
        ...(snapshot ? { snapshot } : {})
      });
    });
  }
  return result;
}
