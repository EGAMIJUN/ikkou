/**
 * Content schemas for 忌校 -IKKOU-.
 *
 * Tile values:
 *   0 = floor (walkable)
 *   1 = wall  (blocks movement and line-of-sight)
 *   2 = door  (walkable; reserved for future room transitions)
 *   3 = stair (walkable; triggers floor switch — see Room.stairs)
 */

export type Tile = 0 | 1 | 2 | 3;

export interface TileVec {
  /** column index (x), in tiles */
  x: number;
  /** row index (y), in tiles */
  y: number;
}

export interface StairConnection {
  /** Tile coordinate that triggers this stair on the current floor. */
  x: number;
  y: number;
  /** Destination floor id. */
  toFloor: string;
  /** Tile coordinate where the player appears on the destination floor. */
  spawn: TileVec;
  /** Item id required to traverse, if any. */
  requiresItem?: string;
  /** Optional human-readable label shown on the locked prompt. */
  lockedMessage?: string;
}

export interface ItemPlacement {
  /** Stable id used by inventory + puzzle gates. */
  id: string;
  /** Tile coordinate of the pickup. */
  x: number;
  y: number;
  /** Display name shown when picked up. */
  name: string;
  /** Whether collecting this counts toward the escape (game-clear) total. */
  isEscapeKey?: boolean;
}

export interface RoomLabel {
  /** Identifier — e.g., "staff-room". */
  id: string;
  /** Display name — e.g., "職員室". */
  name: string;
  /** Inclusive tile-rectangle covered by the room (used for entry detection). */
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

export interface Room {
  id: string;
  name: string;
  /** Width in tiles. */
  width: number;
  /** Height in tiles. */
  height: number;
  /** Tile size in px. */
  tileSize: number;
  /** 2D tile grid, [row][col]. */
  tiles: Tile[][];
  /** Player spawn, in tile coordinates. */
  spawn: TileVec;
  theme?: {
    floor?: string;
    wall?: string;
    door?: string;
    background?: string;
    stair?: string;
  };
  /** Stair connections to other floors. */
  stairs?: StairConnection[];
  /** Pickup items placed on this floor. */
  items?: ItemPlacement[];
  /** Named sub-areas within this floor (UI / debug aid). */
  rooms?: RoomLabel[];
}

export interface Ghost {
  id: string;
  name: string;
  displayName: string;
  patrolSpeed: number;
  chaseSpeed: number;
  visionRange: number;
  visionAngleDeg: number;
  patrol: TileVec[];
  color: string;
  catchphrase?: string;
}

export interface ContentBundle {
  /** Map of floor id → Room. */
  floors: Record<string, Room>;
  /** Floor where the player starts. */
  initialFloor: string;
  ghosts: Ghost[];
  /**
   * Convenience alias for `floors[initialFloor]`. Older code reads `bundle.room`;
   * keeping it lets us migrate piecewise.
   */
  room: Room;
}
