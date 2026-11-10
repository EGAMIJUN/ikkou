import GameCanvas from "@/components/GameCanvasClient";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink px-4 py-10">
      <header className="text-center">
        <h1 className="text-5xl tracking-[0.4em] text-bone drop-shadow-[0_0_12px_rgba(122,16,20,0.6)]">
          忌校
        </h1>
        <p className="mt-2 text-xs tracking-[0.5em] text-bone/50">— I K K O U —</p>
      </header>

      <GameCanvas />

      <footer className="text-center text-xs text-bone/40">
        <p>WASD で移動 ／ R でリスタート</p>
        <p className="mt-1">視線に入らないように。</p>
      </footer>
    </main>
  );
}
