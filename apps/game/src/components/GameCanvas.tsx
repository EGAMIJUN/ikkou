"use client";

import { useEffect, useRef } from "react";
import { defaultBundle } from "@ikkou/content";

const VIEWPORT_W = 1024;
const VIEWPORT_H = 640;

export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let destroyed = false;
    let game: import("phaser").Game | null = null;

    (async () => {
      const Phaser = await import("phaser");
      const { createGameConfig } = await import("@/game/config");

      if (destroyed || !hostRef.current) return;

      game = new Phaser.Game(
        createGameConfig({
          parent: hostRef.current,
          bundle: defaultBundle,
        }),
      );
    })();

    return () => {
      destroyed = true;
      game?.destroy(true);
      game = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="border border-bone/10 shadow-[0_0_60px_rgba(122,16,20,0.25)]"
      style={{ width: VIEWPORT_W, height: VIEWPORT_H, maxWidth: "100%" }}
    />
  );
}
