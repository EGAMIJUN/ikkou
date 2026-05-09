# Contributing to 忌校 -IKKOU-

Thanks for considering a contribution! This is a small OSS horror game and
we want it to be a friendly entry point for first-time contributors.

## Ground rules

- Be kind in issues and reviews. We're building a game for fun.
- One concern per PR. A new room and a new ghost should be two PRs.
- Keep diffs reviewable — under ~300 lines is ideal.

## Getting started

```bash
git clone <your fork>
cd ikkou
npm install
npm run dev
```

Open http://localhost:3000.

## What to work on

Look for `good first issue` on the issue tracker, or pick from the
contribution ideas in the [README](./README.md#contributing).

If you want to add **content** (rooms / ghosts), you don't need to touch any
engine code — see [`packages/content/README.md`](./packages/content/README.md).

If you want to add **gameplay features**, the relevant file is
[`apps/game/src/game/scenes/MainScene.ts`](./apps/game/src/game/scenes/MainScene.ts).

## Pull request checklist

- [ ] `npm run dev` starts the game and the change works in browser
- [ ] `npm run lint` passes
- [ ] Schema changes (if any) are reflected in
      `packages/content/src/types.ts` *and* in existing JSON files
- [ ] PR description explains *why*, not just *what*

## Reporting bugs

Open an issue with:

- What you expected
- What actually happened
- Browser & OS
- A screenshot or short clip if it's visual

## Code of conduct

Be respectful. Discrimination, harassment, or hostility toward other
contributors will not be tolerated.
