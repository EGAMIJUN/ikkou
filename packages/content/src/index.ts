import schoolFirstFloor from "../rooms/school-1f.json";
import schoolSecondFloor from "../rooms/school-2f.json";
import hanako from "../ghosts/hanako.json";

import type { ContentBundle, Ghost, Room } from "./types";

export * from "./types";

export const rooms: Record<string, Room> = {
  "school-1f": schoolFirstFloor as Room,
  "school-2f": schoolSecondFloor as Room,
};

export const ghosts: Record<string, Ghost> = {
  hanako: hanako as Ghost,
};

const floors: Record<string, Room> = {
  "school-1f": rooms["school-1f"],
  "school-2f": rooms["school-2f"],
};
const initialFloor = "school-1f";

/**
 * Default content bundle used by the MVP build.
 * Adding new rooms / ghosts is as simple as dropping a JSON file in
 * `packages/content/{rooms,ghosts}/` and registering it above.
 */
export const defaultBundle: ContentBundle = {
  floors,
  initialFloor,
  ghosts: [ghosts.hanako],
  room: floors[initialFloor],
};
