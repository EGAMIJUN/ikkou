# @ikkou/content

JSON-defined rooms and ghosts for **忌校 -IKKOU-**.

## Layout

```
packages/content/
├── rooms/      # *.json — map definitions
├── ghosts/     # *.json — ghost definitions
└── src/
    ├── index.ts   # registers JSON into typed records
    └── types.ts   # Room / Ghost schemas
```

## Adding a new room

1. Drop `rooms/your-room.json` matching the `Room` schema (see `src/types.ts`).
2. Register it in `src/index.ts`:

   ```ts
   import yourRoom from "../rooms/your-room.json";
   export const rooms = {
     ...,
     "your-room": yourRoom as Room,
   };
   ```

3. (Optional) Make it the default by updating `defaultBundle`.

### Tile values

| Value | Meaning                                    |
| ----- | ------------------------------------------ |
| `0`   | floor — walkable, transparent              |
| `1`   | wall  — blocks movement and line-of-sight  |
| `2`   | door  — walkable, transparent (visual cue) |

## Adding a new ghost

Drop `ghosts/your-ghost.json` matching the `Ghost` schema. Register it in
`src/index.ts` and add it to a bundle.

Patrol points are loop-bounced: the ghost walks the list in order, then
reverses. Two waypoints make a back-and-forth.
