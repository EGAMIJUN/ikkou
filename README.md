# 忌校 -IKKOU-

> 深夜の校舎に、貴方は閉じ込められた。視線に捉えられたら、もう逃げられない。

**忌校 -IKKOU-** is a 2D top-down horror game set in a Japanese school after
hours. You wander dark hallways while a 怪異 patrols. Step into its line of
sight, and it's over.

This repo is the open-source MVP — a minimum playable build with:

- A tile-based school map (廊下 + 教室)
- WASD movement
- One ghost: 花子さん, patrolling with a vision cone
- A JSON-driven content pipeline so anyone can author rooms and ghosts
  without touching the engine code

---

## Quickstart

```bash
# Node 18.17+ required
npm install
npm run dev
```

Open http://localhost:3000 and play.

### Controls

| Key   | Action      |
| ----- | ----------- |
| `W`   | 上に移動    |
| `A`   | 左に移動    |
| `S`   | 下に移動    |
| `D`   | 右に移動    |
| `R`   | リスタート  |

Get caught and you'll see 「見つかった」 — press `R` to try again.

---

## Tech stack

- **[Next.js 14](https://nextjs.org/)** (App Router) + TypeScript
- **[Phaser 3](https://phaser.io/)** for the game scene
- **[Tailwind CSS](https://tailwindcss.com/)** for the surrounding chrome
- npm workspaces monorepo (no extra tooling required)

Phaser is loaded only on the client (`dynamic(... { ssr: false })`) — Next
will not try to render the canvas during SSR.

---

## Repo layout

```
ikkou/
├── apps/
│   └── game/                 # Next.js + Phaser frontend
│       └── src/
│           ├── app/          # App Router pages
│           ├── components/   # GameCanvas (mounts Phaser)
│           └── game/         # Phaser config + scenes
│               ├── config.ts
│               └── scenes/   # Boot / Main / GameOver
└── packages/
    └── content/              # JSON-defined rooms & ghosts
        ├── rooms/            # *.json maps
        ├── ghosts/           # *.json ghost AI definitions
        └── src/
            ├── index.ts      # registers JSON into typed records
            └── types.ts      # Room / Ghost schemas
```

---

## Authoring content

All gameplay content lives in [`packages/content`](./packages/content). You
do not need to touch any engine code to add a new floor, classroom, or 怪異.

### Adding a room

1. Create `packages/content/rooms/your-room.json` matching the [`Room`
   schema](./packages/content/src/types.ts).
2. Register it in `packages/content/src/index.ts`.

Tile values:

| Value | Meaning                                    |
| ----- | ------------------------------------------ |
| `0`   | floor — walkable, transparent              |
| `1`   | wall  — blocks movement and line-of-sight  |
| `2`   | door  — walkable, transparent (visual cue) |

Example room JSON:

```jsonc
{
  "id": "school-2f",
  "name": "校舎 2階",
  "width": 25,
  "height": 15,
  "tileSize": 32,
  "spawn": { "x": 12, "y": 7 },
  "tiles": [/* 2D Tile[][] grid */]
}
```

### Adding a ghost

1. Create `packages/content/ghosts/your-ghost.json` matching the [`Ghost`
   schema](./packages/content/src/types.ts).
2. Register it in `packages/content/src/index.ts`.

Key fields:

- `patrol` — array of waypoints in tile coordinates. The ghost walks them
  in order, then bounces back. Two points = a back-and-forth.
- `visionRange` — in tiles
- `visionAngleDeg` — total field-of-view, e.g. `80` is 40° to each side
- `patrolSpeed` / `chaseSpeed` — px / second

Spotting works in two stages:

1. The player must fall **inside the vision cone** (range + angle).
2. There must be **clear line-of-sight** — the engine raycasts through the
   tile grid and any `wall` (`1`) blocks it.

Both must be true to trigger 「見つかった」.

---

## How spotting actually works

```
        ghost  ──→  facing
           \ /
            ●  ←  vision cone (range × angle)
           / \
          /   \
   ┌─────┴─────┴─────┐
   │  raycast walks  │   ← steps every tileSize/4 px;
   │  ghost → player │     hits any wall? line of sight blocked.
   └─────────────────┘
```

Implementation: [`apps/game/src/game/scenes/MainScene.ts`](./apps/game/src/game/scenes/MainScene.ts)
— see `checkSpotted` and `hasLineOfSight`.

---

## Contributing

PRs welcome — this is meant to be a friendly first-OSS-contribution kind of
project. Some ideas if you're looking for something to do:

### 🟢 Beginner-friendly

- Add a new room JSON (different floor, courtyard, gymnasium…)
- Add a new ghost JSON with a different patrol pattern
- Tweak the color palette in `tailwind.config.ts` and the room `theme`

### 🟡 Medium

- Add a hearing range so the ghost reacts to nearby footsteps
- Add collectible items / a key & locked door (use tile value `3`)
- Add a flashlight that reveals a player vision cone of its own

### 🔴 Larger

- Multi-room transitions (use tile value `2` doors as portals)
- A* pathfinding so ghosts can navigate around walls in chase mode
- Replace the rectangle primitives with sprite art and tilemaps

### Workflow

1. Fork the repo and create a topic branch.
2. `npm install && npm run dev` — make sure the game still runs.
3. Open a PR. Keep changes focused; one room/ghost/feature per PR is great.

### Style notes

- TypeScript strict mode is on. New scene code should be typed.
- Don't import `phaser` from server components — the game canvas mounts via
  `dynamic(..., { ssr: false })` for a reason.
- Content files (`packages/content/**/*.json`) should be hand-editable and
  diff-friendly — keep them readable.

---

## Roadmap (post-MVP)

- [ ] Multiple ghosts per room with different behaviors
- [ ] Stamina / sprint
- [ ] Hideable spots (lockers, desks)
- [ ] Audio: footsteps, ambient school noise, 怪異 voice lines
- [ ] Save / resume
- [ ] Map editor that writes back to `packages/content/rooms/*.json`

---

## License

MIT — see [LICENSE](./LICENSE).
