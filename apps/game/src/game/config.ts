import type * as Phaser from "phaser";
import type { ContentBundle } from "@ikkou/content";

import { BootScene } from "./scenes/BootScene";
import { MainScene } from "./scenes/MainScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { ClearScene } from "./scenes/ClearScene";

export interface GameBootData {
  bundle: ContentBundle;
}

export interface CreateGameConfigArgs {
  parent: HTMLElement;
  bundle: ContentBundle;
}

/** Visible game viewport (camera). The world can be larger than this. */
export const VIEWPORT_WIDTH = 1024;
export const VIEWPORT_HEIGHT = 640;

export function createGameConfig({
  parent,
  bundle,
}: CreateGameConfigArgs): Phaser.Types.Core.GameConfig {
  return {
    type: 0, // Phaser.AUTO — using literal so this file stays SSR-safe.
    parent,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    backgroundColor: bundle.room.theme?.background ?? "#000000",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, MainScene, GameOverScene, ClearScene],
    callbacks: {
      preBoot: (game) => {
        game.registry.set("bundle", bundle satisfies GameBootData["bundle"]);
      },
    },
    pixelArt: true,
    roundPixels: true,
  };
}
