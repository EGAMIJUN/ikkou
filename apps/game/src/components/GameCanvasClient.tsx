"use client";

import dynamic from "next/dynamic";

// Phaser touches `window` at import time, so the canvas must be client-only.
// `ssr: false` is only allowed inside a Client Component (Next 15+), hence this wrapper.
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center text-bone/60">
      読み込み中…
    </div>
  ),
});

export default GameCanvas;
