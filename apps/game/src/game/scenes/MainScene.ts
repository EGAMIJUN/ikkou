import * as Phaser from "phaser";
import type { ContentBundle, Ghost, Room } from "@ikkou/content";

import { HorrorAudio } from "../audio";

// Viewport dims are duplicated here (also exported from `../config`) to avoid
// the circular import that put VIEWPORT_WIDTH/HEIGHT in TDZ when module-level
// constants below tried to read them. Keep these in sync with config.ts.
const VIEWPORT_WIDTH = 1024;
const VIEWPORT_HEIGHT = 640;

type GhostMode = "patrol" | "alerted" | "investigating";

interface GhostState {
  def: Ghost;
  /** World coordinates in pixels. */
  x: number;
  y: number;
  /** Facing angle in radians; tracks last non-zero velocity heading. */
  angle: number;
  patrolIndex: number;
  patrolDir: 1 | -1;
  mode: GhostMode;
  lastSeen: { x: number; y: number } | null;
  loseSightAt: number;
  investigateUntil: number;
  /** Catch-lunge multiplier; smoothed toward 1 outside the lunge. */
  scaleMul: number;
  /** Time (ms) when the exorcism's banishment ends; 0 if she's not banished. */
  vanishedUntil: number;
  /** Permanent speed multiplier — bumps after each exorcism cycle. */
  speedMul: number;
  /** Next footstep audio cue scheduled while vanished. */
  nextFootstepAt: number;
}

interface KeyItem {
  id: string;
  x: number;
  y: number;
  name: string;
  isEscapeKey: boolean;
  collected: boolean;
}

const TS = 40; // tile size in px (must match the room JSON)

const FOV = Math.PI / 3; // 60° horizontal
const TAN_HALF_FOV = Math.tan(FOV / 2);
const NUM_RAYS = VIEWPORT_WIDTH;
const HALF_W = VIEWPORT_WIDTH / 2;
const HALF_H = VIEWPORT_HEIGHT / 2;
/** Beyond this distance walls fade to black. In tile units. */
const MAX_VIEW_TILES = 13;

const PLAYER_SPEED = 130;       // px / sec
const PLAYER_BACK_SPEED = 95;
const PLAYER_ROT_SPEED = 2.0;   // rad / sec
const PLAYER_RADIUS = 12;       // collision halfwidth in px

const PICKUP_RADIUS = 30;
const CATCH_DISTANCE = 32;

const ALERT_LOSE_SIGHT_MS = 1400;
const INVESTIGATE_DURATION_MS = 3500;
const WAYPOINT_EPSILON = 4;

const PROXIMITY_NEAR_PX = 90;
const PROXIMITY_FAR_PX = 380;

/** Hanako's billboard width relative to her height (canvas aspect). */
const HANAKO_CANVAS_W = 64;
const HANAKO_CANVAS_H = 96;
const KEY_CANVAS_W = 32;
const KEY_CANVAS_H = 32;

/** Sprite world-height as a multiple of TS. 1 = full wall height. */
const HANAKO_WORLD_HEIGHT_TILES = 1.05;
const KEY_WORLD_HEIGHT_TILES = 0.4;

const HANAKO_NEAR_DIST = 90;
const HANAKO_MID_DIST = 220;

/** Speed multipliers — Hanako should be a credible threat but escapable. */
const ACTIVE_CHASE_MUL = 0.7;
const ACTIVE_PATROL_MUL = 0.6;

const VIEW_TEXTURE_KEY = "view3d";
const MINI_TEXTURE_KEY = "minimap2d";

export class MainScene extends Phaser.Scene {
  private bundle!: ContentBundle;
  private room!: Room;

  // Logical entities
  private player = { x: 0, y: 0, angle: 0 };
  private ghostStates: GhostState[] = [];
  private keyItems: KeyItem[] = [];
  private collectedKeys = 0;
  private totalEscapeKeys = 0;
  private inventory: Set<string> = new Set();

  // Floor switching
  private currentFloorId = "";

  // Music room ambient piano cadence
  private nextPianoAt = 0;

  // Floating message overlay
  private messageText: Phaser.GameObjects.Text | null = null;
  private messageHideAt = 0;

  // 3D view canvas
  private viewTexture!: Phaser.Textures.CanvasTexture;
  private viewCtx!: CanvasRenderingContext2D;
  private viewImage!: Phaser.GameObjects.Image;
  private zBuffer!: Float32Array; // perpendicular distance per ray, in tile units

  // Minimap
  private miniTexture!: Phaser.Textures.CanvasTexture;
  private miniCtx!: CanvasRenderingContext2D;
  private miniImage!: Phaser.GameObjects.Image;
  private miniW = 0;
  private miniH = 0;
  private miniTilePx = 0;

  // Pre-rendered sprites
  private hanakoSpriteFar!: HTMLCanvasElement;
  private hanakoSpriteMid!: HTMLCanvasElement;
  private hanakoSpriteNear!: HTMLCanvasElement;
  private keySprite!: HTMLCanvasElement;
  private stairMarkerCanvas!: HTMLCanvasElement;

  // Overlays
  private vignette!: Phaser.GameObjects.Graphics;
  private glitchGfx!: Phaser.GameObjects.Graphics;
  private glitchUntil = 0;
  private nextGlitchAt = 0;
  private hudText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private stairPrompt!: Phaser.GameObjects.Text;
  private nearbyStair: NonNullable<Room["stairs"]>[number] | null = null;
  private lastRoomLabel: string | null = null;

  // Audio
  private audio!: HorrorAudio;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private rKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private nextExorcismAt = 0;

  // State
  private caught = false;
  private cleared = false;
  private proximity = 0;
  private aboutToBeSpotted = false;

  constructor() {
    super({ key: "main" });
  }

  create() {
    this.bundle = this.registry.get("bundle") as ContentBundle;
    this.currentFloorId = this.bundle.initialFloor;
    this.room = this.bundle.floors[this.currentFloorId];

    this.caught = false;
    this.cleared = false;
    this.collectedKeys = 0;
    this.ghostStates = [];
    this.keyItems = [];
    this.inventory.clear();
    this.proximity = 0;
    this.aboutToBeSpotted = false;
    this.glitchUntil = 0;
    this.nextExorcismAt = 0;
    this.zBuffer = new Float32Array(NUM_RAYS);
    this.nearbyStair = null;
    this.lastRoomLabel = null;
    this.messageText = null;
    this.messageHideAt = 0;

    // Count all escape keys across all floors so the HUD knows the total.
    this.totalEscapeKeys = 0;
    for (const floor of Object.values(this.bundle.floors)) {
      for (const item of floor.items ?? []) {
        if (item.isEscapeKey) this.totalEscapeKeys += 1;
      }
    }

    const now = this.time.now;
    this.nextGlitchAt = now + 4000 + Math.random() * 5000;
    this.nextPianoAt = now + 6000 + Math.random() * 4000;

    this.setupAudio();
    this.buildSprites();
    this.buildViewCanvas();
    this.buildMinimapCanvas();
    this.buildOverlays();
    this.buildHud();
    this.spawnPlayer();
    this.spawnKeys();
    this.spawnGhosts();
    this.bindInput();
  }

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------

  private setupAudio() {
    let audio = this.registry.get("audio") as HorrorAudio | undefined;
    if (!audio) {
      audio = new HorrorAudio();
      this.registry.set("audio", audio);
      this.game.events.once(Phaser.Core.Events.DESTROY, () => audio!.destroy());
    }
    this.audio = audio;
    const start = () => {
      this.audio.resume();
      this.audio.startDrone();
    };
    this.input.keyboard?.once("keydown", start);
    this.input.once("pointerdown", start);
  }

  // -------------------------------------------------------------------------
  // Sprite atlases (Hanako variants & key)
  // -------------------------------------------------------------------------

  private buildSprites() {
    this.hanakoSpriteFar = this.makeHanakoSprite("far");
    this.hanakoSpriteMid = this.makeHanakoSprite("mid");
    this.hanakoSpriteNear = this.makeHanakoSprite("near");
    this.keySprite = this.makeKeySprite();
    this.stairMarkerCanvas = this.makeStairMarker();
  }

  private makeStairMarker(): HTMLCanvasElement {
    const W = 64;
    const H = 96;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Vertical column of yellow gradient — stronger near the floor.
    const grad = ctx.createLinearGradient(W / 2, 0, W / 2, H);
    grad.addColorStop(0, "rgba(255, 200, 60, 0)");
    grad.addColorStop(1, "rgba(255, 220, 90, 0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(W * 0.2, 0, W * 0.6, H);

    // Soft halo at the base.
    const halo = ctx.createRadialGradient(W / 2, H * 0.85, 4, W / 2, H * 0.85, W * 0.5);
    halo.addColorStop(0, "rgba(255, 240, 120, 0.85)");
    halo.addColorStop(1, "rgba(255, 200, 60, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // Up arrow at the top.
    ctx.fillStyle = "rgba(255, 248, 180, 0.95)";
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.18);
    ctx.lineTo(W * 0.72, H * 0.42);
    ctx.lineTo(W * 0.6, H * 0.42);
    ctx.lineTo(W * 0.6, H * 0.6);
    ctx.lineTo(W * 0.4, H * 0.6);
    ctx.lineTo(W * 0.4, H * 0.42);
    ctx.lineTo(W * 0.28, H * 0.42);
    ctx.closePath();
    ctx.fill();

    return canvas;
  }

  private makeHanakoSprite(variant: "far" | "mid" | "near"): HTMLCanvasElement {
    const W = HANAKO_CANVAS_W;
    const H = HANAKO_CANVAS_H;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const cx = W / 2;
    const headY = H * 0.32;
    const dressY = H * 0.62;

    // Tail wisps suggesting she floats
    ctx.fillStyle = "rgba(246,244,236,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, H - 6, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(246,244,236,0.4)";
    ctx.beginPath();
    ctx.ellipse(cx, H - 14, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dress
    ctx.fillStyle = "rgba(246,244,236,0.92)";
    ctx.beginPath();
    ctx.ellipse(cx, dressY, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = "rgba(246,244,236,0.95)";
    ctx.beginPath();
    ctx.arc(cx, headY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Hair lines hanging from the top of the head
    ctx.strokeStyle = "rgba(8,4,6,0.92)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 13; i++) {
      const bx = cx - 8 + i * 1.35;
      const len = 26 + Math.random() * 14;
      ctx.beginPath();
      ctx.moveTo(bx, headY - 9);
      ctx.lineTo(bx, headY - 9 + len);
      ctx.stroke();
    }

    if (variant === "mid") {
      // Faint dark eye dots
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(cx - 3, headY - 1, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 3, headY - 1, 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === "near") {
      // Outer red glow
      ctx.fillStyle = "rgba(255,40,30,0.45)";
      ctx.beginPath();
      ctx.arc(cx - 3, headY - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 3, headY - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      // Inner bright red eyes
      ctx.fillStyle = "rgba(255,30,30,0.95)";
      ctx.beginPath();
      ctx.arc(cx - 3, headY - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 3, headY - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Open mouth
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath();
      ctx.ellipse(cx, headY + 4, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Teeth
      ctx.fillStyle = "rgba(246,244,236,0.9)";
      ctx.fillRect(cx - 2.5, headY + 2.5, 1, 1.6);
      ctx.fillRect(cx - 0.5, headY + 2.5, 1, 1.6);
      ctx.fillRect(cx + 1.5, headY + 2.5, 1, 1.6);
    }

    return canvas;
  }

  private makeKeySprite(): HTMLCanvasElement {
    const W = KEY_CANVAS_W;
    const H = KEY_CANVAS_H;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Ring
    ctx.fillStyle = "#f2c14e";
    ctx.beginPath();
    ctx.arc(W / 2 - 6, H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8c6a1f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Stem
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(W / 2 - 1, H / 2 - 1, 12, 2.5);
    ctx.fillRect(W / 2 + 8, H / 2 + 1, 2, 4);

    return canvas;
  }

  // -------------------------------------------------------------------------
  // 3D view canvas + minimap
  // -------------------------------------------------------------------------

  private buildViewCanvas() {
    if (this.textures.exists(VIEW_TEXTURE_KEY)) {
      this.textures.remove(VIEW_TEXTURE_KEY);
    }
    const tex = this.textures.createCanvas(VIEW_TEXTURE_KEY, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    if (!tex) throw new Error("Failed to create view canvas");
    this.viewTexture = tex;
    this.viewCtx = tex.getContext();
    this.viewImage = this.add.image(0, 0, VIEW_TEXTURE_KEY).setOrigin(0, 0).setDepth(0);
  }

  private buildMinimapCanvas() {
    this.miniTilePx = 5;
    this.miniW = this.room.width * this.miniTilePx;
    this.miniH = this.room.height * this.miniTilePx;
    if (this.textures.exists(MINI_TEXTURE_KEY)) {
      this.textures.remove(MINI_TEXTURE_KEY);
    }
    const tex = this.textures.createCanvas(MINI_TEXTURE_KEY, this.miniW, this.miniH);
    if (!tex) throw new Error("Failed to create minimap canvas");
    this.miniTexture = tex;
    this.miniCtx = tex.getContext();
    const x = VIEWPORT_WIDTH - this.miniW - 12;
    const y = VIEWPORT_HEIGHT - this.miniH - 12;
    this.miniImage = this.add
      .image(x, y, MINI_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(95)
      .setAlpha(0.92);
  }

  private buildOverlays() {
    // Red proximity vignette as a Graphics drawing concentric strokes.
    this.vignette = this.add.graphics();
    this.vignette.setScrollFactor(0);
    this.vignette.setDepth(60);

    this.glitchGfx = this.add.graphics();
    this.glitchGfx.setScrollFactor(0);
    this.glitchGfx.setDepth(70);
  }

  private buildHud() {
    this.hudText = this.add.text(14, 12, this.formatHud(), {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "20px",
      color: "#f2c14e",
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(100);
    this.hudText.setShadow(0, 0, "#000000", 6, true, true);

    this.hintText = this.add.text(
      14,
      40,
      "矢印キーで移動・回転 / SPACE でお祓い / E で階段 / R でリスタート",
      {
        fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
        fontSize: "12px",
        color: "#a8a3b3",
      },
    );
    this.hintText.setScrollFactor(0);
    this.hintText.setDepth(100);
    this.hintText.setShadow(0, 0, "#000000", 4, true, true);

    // Bottom-centre prompt shown when standing near a stair.
    this.stairPrompt = this.add.text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 70, "", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "20px",
      color: "#ffd66e",
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      padding: { x: 14, y: 8 },
    });
    this.stairPrompt.setOrigin(0.5);
    this.stairPrompt.setScrollFactor(0);
    this.stairPrompt.setDepth(102);
    this.stairPrompt.setVisible(false);

    // Top-centre objective banner with a translucent black plate.
    this.goalText = this.add.text(VIEWPORT_WIDTH / 2, 14, this.computeGoal(), {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "18px",
      color: "#ffe9c8",
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      padding: { x: 14, y: 8 },
    });
    this.goalText.setOrigin(0.5, 0);
    this.goalText.setScrollFactor(0);
    this.goalText.setDepth(101);
    this.goalText.setShadow(0, 0, "#000000", 4, true, true);
  }

  private computeGoal(): string {
    if (!this.inventory.has("staff-key")) {
      return this.currentFloorId === "school-1f"
        ? "🔑 職員室の鍵を探せ → 中央上の部屋"
        : "🔑 職員室の鍵を探せ → 1階の中央上";
    }
    if (
      this.currentFloorId === "school-1f" &&
      this.collectedKeys < this.totalEscapeKeys
    ) {
      if (!this.inventory.has("key-1")) {
        return "🔑 鍵を拾え → 昇降口（左上の部屋）";
      }
      return "📋 2階へ上がれ → 中央下の階段";
    }
    const remaining = this.totalEscapeKeys - this.collectedKeys;
    if (remaining === 0) return "🚪 脱出しろ → 階段で1階へ";
    const missing: string[] = [];
    if (!this.inventory.has("key-1")) missing.push("1階 昇降口");
    if (!this.inventory.has("key-2")) missing.push("2階 音楽室");
    if (!this.inventory.has("key-3")) missing.push("2階 美術室");
    return `🔑 あと ${remaining} 個鍵を集めろ → ${missing.join("・")}`;
  }

  private formatHud(): string {
    const sub = this.currentRoomLabel() ?? "廊下";
    return `🔑 ${this.collectedKeys}/${this.totalEscapeKeys}   ${this.room.name} / ${sub}`;
  }

  /** Resolve which named sub-room the player currently stands in. */
  private currentRoomLabel(): string | null {
    const labels = this.room.rooms;
    if (!labels) return null;
    const col = Math.floor(this.player.x / TS);
    const row = Math.floor(this.player.y / TS);
    for (const r of labels) {
      if (
        col >= r.bounds.x1 &&
        col <= r.bounds.x2 &&
        row >= r.bounds.y1 &&
        row <= r.bounds.y2
      ) {
        return r.name;
      }
    }
    return null;
  }

  /** Show a sign when the player crosses into a new named room. */
  private updateRoomSign() {
    const current = this.currentRoomLabel();
    if (current !== this.lastRoomLabel) {
      if (current) this.showMessage(`ここは${current}です`, 1800);
      this.lastRoomLabel = current;
    }
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------

  private spawnPlayer() {
    const { spawn } = this.room;
    this.player.x = spawn.x * TS + TS / 2;
    this.player.y = spawn.y * TS + TS / 2;
    this.player.angle = 0;
  }

  /** Re-spawn the visible items for the current floor, skipping any in inventory. */
  private spawnKeys() {
    this.keyItems = [];
    for (const placement of this.room.items ?? []) {
      if (this.inventory.has(placement.id)) continue;
      this.keyItems.push({
        id: placement.id,
        x: placement.x * TS + TS / 2,
        y: placement.y * TS + TS / 2,
        name: placement.name,
        isEscapeKey: !!placement.isEscapeKey,
        collected: false,
      });
    }
  }

  private spawnGhosts() {
    for (const def of this.bundle.ghosts) {
      const start = def.patrol[0] ?? { x: 1, y: 1 };
      this.ghostStates.push({
        def,
        x: start.x * TS + TS / 2,
        y: start.y * TS + TS / 2,
        angle: 0,
        patrolIndex: 0,
        patrolDir: 1,
        mode: "patrol",
        lastSeen: null,
        loseSightAt: 0,
        investigateUntil: 0,
        scaleMul: 1,
        vanishedUntil: 0,
        speedMul: 1,
        nextFootstepAt: 0,
      });
    }
  }

  private bindInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.rKey = this.input.keyboard!.addKey("R");
    this.spaceKey = this.input.keyboard!.addKey("SPACE");
    this.eKey = this.input.keyboard!.addKey("E");
    // Stop these keys from scrolling/triggering page actions.
    this.input.keyboard!.addCapture("UP,DOWN,LEFT,RIGHT,R,SPACE,E");
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  update(time: number, deltaMs: number) {
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.scene.restart();
      return;
    }

    if (!this.caught && !this.cleared) {
      this.handleInput(deltaMs);
      this.checkKeyPickups();
      this.checkStairs();
      this.updateRoomSign();
    }

    for (const g of this.ghostStates) {
      this.updateGhost(g, time, deltaMs);
      this.updateGhostScale(g);
    }

    // Periodic piano notes — flavour ambient, runs from the start.
    if (time >= this.nextPianoAt) {
      this.audio.playPianoNote();
      this.nextPianoAt = time + 3500 + Math.random() * 5500;
    }

    this.recomputeProximityState();
    this.audio.setProximity(this.proximity);

    this.renderView(time);
    this.viewTexture.refresh();
    this.renderMinimap();
    this.miniTexture.refresh();
    this.updateOverlays(time);
    this.updateMessage(time);
    this.hudText.setText(this.formatHud());
    this.goalText.setText(this.computeGoal());
  }

  // -------------------------------------------------------------------------
  // Input + collision
  // -------------------------------------------------------------------------

  private handleInput(deltaMs: number) {
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.tryExorcism();
    }
    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearbyStair) {
      this.tryUseStair(this.nearbyStair);
    }

    const dt = deltaMs / 1000;
    let rotInput = 0;
    if (this.cursors.left?.isDown) rotInput -= 1;
    if (this.cursors.right?.isDown) rotInput += 1;
    this.player.angle += rotInput * PLAYER_ROT_SPEED * dt;

    let move = 0;
    if (this.cursors.up?.isDown) move += 1;
    if (this.cursors.down?.isDown) move -= 1;
    if (move === 0) return;

    const speed = move > 0 ? PLAYER_SPEED : PLAYER_BACK_SPEED;
    const stepLen = move * speed * dt;
    const dx = Math.cos(this.player.angle) * stepLen;
    const dy = Math.sin(this.player.angle) * stepLen;

    // Slide along walls: try X and Y separately.
    if (this.canStandAt(this.player.x + dx, this.player.y, PLAYER_RADIUS)) {
      this.player.x += dx;
    }
    if (this.canStandAt(this.player.x, this.player.y + dy, PLAYER_RADIUS)) {
      this.player.y += dy;
    }
  }

  private canStandAt(x: number, y: number, r: number): boolean {
    const tiles = this.room.tiles;
    const corners: [number, number][] = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ];
    for (const [cx, cy] of corners) {
      const col = Math.floor(cx / TS);
      const row = Math.floor(cy / TS);
      if (tiles[row]?.[col] === 1) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Hanako AI
  // -------------------------------------------------------------------------

  /** Banish the first ghost in front of the player within 2 tiles. */
  private tryExorcism() {
    const now = this.time.now;
    if (now < this.nextExorcismAt) return;
    // Brief cooldown so the swing can't spam-flash the screen.
    this.nextExorcismAt = now + 600;

    const range = 2 * TS;
    const halfCone = Math.PI / 4; // ±45° front cone

    let target: GhostState | null = null;
    for (const g of this.ghostStates) {
      if (g.vanishedUntil > now) continue;
      const dx = g.x - this.player.x;
      const dy = g.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > range) continue;
      const angleToGhost = Math.atan2(dy, dx);
      const diff = Math.abs(Phaser.Math.Angle.Wrap(angleToGhost - this.player.angle));
      if (diff > halfCone) continue;
      target = g;
      break;
    }

    if (!target) return;

    target.vanishedUntil = now + 10_000;
    target.mode = "patrol";
    target.lastSeen = null;
    target.scaleMul = 1;
    target.nextFootstepAt = now + 800;

    this.cameras.main.flash(420, 255, 255, 255);
    this.audio.playExorcism();
  }

  /** Move + footstep audio while she's banished. She can't see or catch. */
  private runVanishedGhost(g: GhostState, now: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    const dx = this.player.x - g.x;
    const dy = this.player.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const speed = g.def.patrolSpeed * g.speedMul * ACTIVE_PATROL_MUL;
      const stepLen = speed * dt;
      const stepX = (dx / dist) * stepLen;
      const stepY = (dy / dist) * stepLen;
      if (this.canStandAt(g.x + stepX, g.y, PLAYER_RADIUS)) g.x += stepX;
      if (this.canStandAt(g.x, g.y + stepY, PLAYER_RADIUS)) g.y += stepY;
      g.angle = Math.atan2(dy, dx);
    }

    if (now > g.nextFootstepAt) {
      this.audio.playFootstep();
      g.nextFootstepAt = now + 540 + Math.random() * 360;
    }
  }

  private updateGhost(g: GhostState, now: number, deltaMs: number) {
    if (this.caught) return;

    // Banished: invisible, can't catch, just shadows you and clicks footsteps.
    if (g.vanishedUntil > now) {
      this.runVanishedGhost(g, now, deltaMs);
      return;
    }
    // Just respawned — louder, faster, immediately on the hunt.
    if (g.vanishedUntil > 0 && now >= g.vanishedUntil) {
      g.vanishedUntil = 0;
      g.speedMul *= 1.35;
      g.mode = "alerted";
      g.lastSeen = { x: this.player.x, y: this.player.y };
      g.loseSightAt = now + 2500;
      this.audio.playStinger();
    }

    const dt = deltaMs / 1000;

    const sees = this.ghostSeesPlayer(g);
    if (sees) {
      if (g.mode !== "alerted") this.onGhostFirstAlert();
      g.mode = "alerted";
      g.lastSeen = { x: this.player.x, y: this.player.y };
      g.loseSightAt = now + ALERT_LOSE_SIGHT_MS;
    } else if (g.mode === "alerted" && now > g.loseSightAt) {
      g.mode = "investigating";
      g.investigateUntil = now + INVESTIGATE_DURATION_MS;
    }

    // Catch
    if (g.mode === "alerted") {
      const dx = g.x - this.player.x;
      const dy = g.y - this.player.y;
      if (Math.hypot(dx, dy) < CATCH_DISTANCE) {
        this.triggerGameOver(g);
        return;
      }
    }

    // Pick a target
    let targetX: number;
    let targetY: number;
    let speed: number;

    if (g.mode === "alerted") {
      targetX = g.lastSeen!.x;
      targetY = g.lastSeen!.y;
      speed = g.def.chaseSpeed * g.speedMul * ACTIVE_CHASE_MUL;
    } else if (g.mode === "investigating") {
      if (!g.lastSeen || now > g.investigateUntil) {
        g.mode = "patrol";
        g.lastSeen = null;
        return;
      }
      const dxs = g.lastSeen.x - g.x;
      const dys = g.lastSeen.y - g.y;
      if (Math.hypot(dxs, dys) < WAYPOINT_EPSILON) {
        // Look around briefly.
        g.angle += 0.6 * dt * (Math.sin(now / 400) > 0 ? 1 : -1);
        return;
      }
      targetX = g.lastSeen.x;
      targetY = g.lastSeen.y;
      speed = g.def.patrolSpeed * 1.25 * g.speedMul * ACTIVE_PATROL_MUL;
    } else {
      const wp = g.def.patrol[g.patrolIndex];
      targetX = wp.x * TS + TS / 2;
      targetY = wp.y * TS + TS / 2;
      speed = g.def.patrolSpeed * g.speedMul * ACTIVE_PATROL_MUL;
      const dxw = targetX - g.x;
      const dyw = targetY - g.y;
      if (Math.hypot(dxw, dyw) < WAYPOINT_EPSILON) {
        this.advancePatrol(g);
        return;
      }
    }

    const dx = targetX - g.x;
    const dy = targetY - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) return;
    const stepLen = speed * dt;
    const stepX = (dx / dist) * stepLen;
    const stepY = (dy / dist) * stepLen;

    // Slide along walls separately.
    if (this.canStandAt(g.x + stepX, g.y, PLAYER_RADIUS)) g.x += stepX;
    if (this.canStandAt(g.x, g.y + stepY, PLAYER_RADIUS)) g.y += stepY;
    g.angle = Math.atan2(dy, dx);
  }

  private onGhostFirstAlert() {
    this.cameras.main.shake(220, 0.005);
    this.cameras.main.flash(120, 122, 16, 20);
    this.audio.playStinger();
  }

  private advancePatrol(g: GhostState) {
    const len = g.def.patrol.length;
    if (len <= 1) return;
    let next = g.patrolIndex + g.patrolDir;
    if (next >= len) {
      g.patrolDir = -1;
      next = g.patrolIndex - 1;
    } else if (next < 0) {
      g.patrolDir = 1;
      next = g.patrolIndex + 1;
    }
    g.patrolIndex = next;
  }

  private ghostSeesPlayer(g: GhostState): boolean {
    if (g.vanishedUntil > this.time.now) return false;
    const dx = this.player.x - g.x;
    const dy = this.player.y - g.y;
    const dist = Math.hypot(dx, dy);
    const range = g.def.visionRange * TS;
    if (dist > range) return false;
    const angleToPlayer = Math.atan2(dy, dx);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(angleToPlayer - g.angle));
    const half = Phaser.Math.DegToRad(g.def.visionAngleDeg / 2);
    if (diff > half) return false;
    return this.hasLineOfSight(g.x, g.y, this.player.x, this.player.y);
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const tiles = this.room.tiles;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return true;
    const stepSize = TS / 4;
    const steps = Math.max(2, Math.ceil(dist / stepSize));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      const col = Math.floor(x / TS);
      const row = Math.floor(y / TS);
      if (tiles[row]?.[col] === 1) return false;
    }
    return true;
  }

  private updateGhostScale(g: GhostState) {
    let target = 1;
    if (g.mode === "alerted") {
      const dist = Math.hypot(g.x - this.player.x, g.y - this.player.y);
      if (dist < 100) {
        const t = Math.max(0, Math.min(1, (100 - dist) / 100));
        target = 1 + t * 0.5;
      }
    }
    g.scaleMul += (target - g.scaleMul) * 0.18;
  }

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  private checkKeyPickups() {
    for (const item of this.keyItems) {
      if (item.collected) continue;
      const dx = this.player.x - item.x;
      const dy = this.player.y - item.y;
      if (Math.hypot(dx, dy) < PICKUP_RADIUS) this.collectKey(item);
    }
  }

  private collectKey(item: KeyItem) {
    if (item.collected) return;
    item.collected = true;
    this.inventory.add(item.id);
    this.audio.playKey();
    this.showMessage(`${item.name} を手に入れた`);
    if (item.isEscapeKey) {
      this.collectedKeys += 1;
      if (this.collectedKeys >= this.totalEscapeKeys) this.triggerClear();
    }
  }

  // -------------------------------------------------------------------------
  // Proximity
  // -------------------------------------------------------------------------

  private recomputeProximityState() {
    let nearest = Infinity;
    let lurking = false;
    const now = this.time.now;
    for (const g of this.ghostStates) {
      if (g.vanishedUntil > now) continue; // banished — drone calms
      const d = Math.hypot(g.x - this.player.x, g.y - this.player.y);
      if (d < nearest) nearest = d;
      if (g.mode === "alerted") lurking = true;
    }
    this.aboutToBeSpotted = lurking;
    if (!isFinite(nearest)) {
      this.proximity = 0;
      return;
    }
    const t = (PROXIMITY_FAR_PX - nearest) / (PROXIMITY_FAR_PX - PROXIMITY_NEAR_PX);
    this.proximity = Math.max(0, Math.min(1, t));
  }

  // -------------------------------------------------------------------------
  // 3D rendering (raycasting)
  // -------------------------------------------------------------------------

  private renderView(_now: number) {
    const ctx = this.viewCtx;
    const tiles = this.room.tiles;
    const tilesW = this.room.width;
    const tilesH = this.room.height;

    // Ceiling + floor — solid slabs. Floor a touch lighter than ceiling.
    ctx.fillStyle = "#0a0808";
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, HALF_H);
    ctx.fillStyle = "#1c1410";
    ctx.fillRect(0, HALF_H, VIEWPORT_WIDTH, HALF_H);

    const dirX = Math.cos(this.player.angle);
    const dirY = Math.sin(this.player.angle);
    const planeX = -dirY * TAN_HALF_FOV;
    const planeY = dirX * TAN_HALF_FOV;

    const posX = this.player.x / TS;
    const posY = this.player.y / TS;

    // Walls — one column per ray.
    for (let r = 0; r < NUM_RAYS; r++) {
      const cameraX = (2 * r) / NUM_RAYS - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(posX);
      let mapY = Math.floor(posY);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX: number;
      let sideDistX: number;
      let stepY: number;
      let sideDistY: number;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - posX) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - posY) * deltaDistY;
      }

      let side = 0;
      let hit = false;
      let steps = 0;
      while (!hit && steps < 64) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapX >= tilesW || mapY < 0 || mapY >= tilesH) {
          hit = true;
          break;
        }
        if (tiles[mapY][mapX] === 1) hit = true;
        steps++;
      }

      const perpDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
      this.zBuffer[r] = perpDist;

      const wallH = perpDist > 0.001 ? VIEWPORT_HEIGHT / perpDist : VIEWPORT_HEIGHT * 4;
      const wallTop = HALF_H - wallH / 2;

      // Brightness: distance falloff × forward-cone × side-darken.
      const distFactor = Math.max(0.22, 1 - perpDist / 16);
      const flashFactor = Math.max(0.4, 1 - 0.6 * Math.abs(cameraX));
      const sideFactor = side === 0 ? 1 : 0.78;
      const brightness = distFactor * flashFactor * sideFactor;

      // Base wall colour bumped to #6a564a for visibility (was #3a2e2a).
      const rr = Math.min(255, (106 * brightness) | 0);
      const gg = Math.min(255, (86 * brightness) | 0);
      const bb = Math.min(255, (74 * brightness) | 0);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(r, wallTop, 1, wallH);
    }

    // Sprites — sorted back-to-front.
    type SpriteEntry = {
      worldX: number;
      worldY: number;
      canvas: HTMLCanvasElement;
      worldHeightTiles: number;
      scaleMul: number;
      groundAligned: boolean;
      depth: number; // computed below for sort
    };
    const sprites: SpriteEntry[] = [];
    const now = this.time.now;
    for (const g of this.ghostStates) {
      if (g.vanishedUntil > now) continue; // banished — invisible
      const dist = Math.hypot(g.x - this.player.x, g.y - this.player.y);
      let canvas = this.hanakoSpriteFar;
      if (dist < HANAKO_NEAR_DIST) canvas = this.hanakoSpriteNear;
      else if (dist < HANAKO_MID_DIST) canvas = this.hanakoSpriteMid;
      sprites.push({
        worldX: g.x,
        worldY: g.y,
        canvas,
        worldHeightTiles: HANAKO_WORLD_HEIGHT_TILES,
        scaleMul: g.scaleMul,
        groundAligned: false,
        depth: 0,
      });
    }
    for (const k of this.keyItems) {
      if (k.collected) continue;
      sprites.push({
        worldX: k.x,
        worldY: k.y,
        canvas: this.keySprite,
        worldHeightTiles: KEY_WORLD_HEIGHT_TILES,
        scaleMul: 1,
        groundAligned: false,
        depth: 0,
      });
    }
    for (const s of this.room.stairs ?? []) {
      const pulse = 1 + 0.08 * Math.sin(now / 280);
      sprites.push({
        worldX: (s.x + 0.5) * TS,
        worldY: (s.y + 0.5) * TS,
        canvas: this.stairMarkerCanvas,
        worldHeightTiles: 1.0,
        scaleMul: pulse,
        groundAligned: true,
        depth: 0,
      });
    }

    for (const s of sprites) {
      const dx = (s.worldX - this.player.x) / TS;
      const dy = (s.worldY - this.player.y) / TS;
      s.depth = dirX * dx + dirY * dy;
    }
    sprites.sort((a, b) => b.depth - a.depth);

    for (const s of sprites) {
      this.drawSprite(
        s.worldX,
        s.worldY,
        s.canvas,
        s.worldHeightTiles,
        s.scaleMul,
        s.groundAligned,
      );
    }
  }

  private drawSprite(
    worldX: number,
    worldY: number,
    canvas: HTMLCanvasElement,
    worldHeightTiles: number,
    scaleMul: number,
    groundAligned = false,
  ) {
    const dx = (worldX - this.player.x) / TS;
    const dy = (worldY - this.player.y) / TS;
    const dirX = Math.cos(this.player.angle);
    const dirY = Math.sin(this.player.angle);

    const transformX = dirX * dx + dirY * dy; // depth, in tiles
    if (transformX <= 0.1) return;
    const transformYRaw = -Math.sin(this.player.angle) * dx + Math.cos(this.player.angle) * dy;
    const transformY = transformYRaw / TAN_HALF_FOV; // normalised to [-1,1] across screen at FOV edges

    const screenX = HALF_W * (1 + transformY);

    const aspect = canvas.width / canvas.height;
    const baseH = (VIEWPORT_HEIGHT / transformX) * worldHeightTiles * scaleMul;
    const baseW = baseH * aspect;
    const topY = groundAligned
      ? HALF_H + (VIEWPORT_HEIGHT / transformX) * 0.5 - baseH
      : HALF_H - baseH / 2;

    const drawXf = screenX - baseW / 2;
    const colStart = Math.max(0, Math.floor(drawXf));
    const colEnd = Math.min(NUM_RAYS - 1, Math.floor(drawXf + baseW));
    if (colStart > colEnd) return;

    // Brightness for this sprite — same falloff so it blends with the walls.
    const distFactor = Math.max(0.22, 1 - transformX / 16);
    const flashFactor = Math.max(0.45, 1 - 0.55 * Math.abs(transformY));
    const brightness = Math.min(1, distFactor * flashFactor * 1.2);

    const ctx = this.viewCtx;
    ctx.globalAlpha = brightness;
    for (let col = colStart; col <= colEnd; col++) {
      if (transformX >= this.zBuffer[col]) continue; // wall in front
      const localX = col - drawXf;
      const srcX = (localX / baseW) * canvas.width;
      ctx.drawImage(canvas, srcX, 0, 1, canvas.height, col, topY, 1, baseH);
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // Minimap
  // -------------------------------------------------------------------------

  private renderMinimap() {
    const ctx = this.miniCtx;
    const W = this.miniW;
    const H = this.miniH;
    const t = this.miniTilePx;
    const tiles = this.room.tiles;

    ctx.fillStyle = "rgba(8,4,6,0.92)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#3a2e2a";
    for (let row = 0; row < this.room.height; row++) {
      for (let col = 0; col < this.room.width; col++) {
        if (tiles[row][col] === 1) ctx.fillRect(col * t, row * t, t, t);
      }
    }

    // Stair tiles — yellow square on the minimap.
    ctx.fillStyle = "#f2c14e";
    for (const s of this.room.stairs ?? []) {
      ctx.fillRect(s.x * t + 1, s.y * t + 1, t - 2, t - 2);
    }

    // Room labels at each named room's centre.
    if (this.room.rooms) {
      ctx.fillStyle = "rgba(232,228,216,0.85)";
      ctx.font = "9px 'Shippori Mincho', 'Noto Serif JP', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const r of this.room.rooms) {
        const cx = ((r.bounds.x1 + r.bounds.x2 + 1) / 2) * t;
        const cy = ((r.bounds.y1 + r.bounds.y2 + 1) / 2) * t;
        ctx.fillText(r.name, cx, cy);
      }
    }

    // Keys
    ctx.fillStyle = "#f2c14e";
    for (const k of this.keyItems) {
      if (k.collected) continue;
      const cx = (k.x / TS) * t;
      const cy = (k.y / TS) * t;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ghosts (hidden while banished)
    const nowMs = this.time.now;
    for (const g of this.ghostStates) {
      if (g.vanishedUntil > nowMs) continue;
      const cx = (g.x / TS) * t;
      const cy = (g.y / TS) * t;
      ctx.fillStyle = g.mode === "alerted" ? "#ff3a3a" : "#bb1818";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player as a small triangle in the facing direction.
    const pcx = (this.player.x / TS) * t;
    const pcy = (this.player.y / TS) * t;
    const a = this.player.angle;
    ctx.fillStyle = "#ffe9c8";
    ctx.beginPath();
    ctx.moveTo(pcx + Math.cos(a) * 4.5, pcy + Math.sin(a) * 4.5);
    ctx.lineTo(pcx + Math.cos(a + 2.5) * 3, pcy + Math.sin(a + 2.5) * 3);
    ctx.lineTo(pcx + Math.cos(a - 2.5) * 3, pcy + Math.sin(a - 2.5) * 3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(122,16,20,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  // -------------------------------------------------------------------------
  // Overlays (vignette, glitch)
  // -------------------------------------------------------------------------

  private updateOverlays(now: number) {
    // Red proximity vignette — pulse when close.
    this.vignette.clear();
    if (this.proximity > 0.01) {
      const base = Math.pow(this.proximity, 1.5) * 0.8;
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      const alpha = Math.min(1, base * (0.55 + pulse * 0.45));
      const cx = HALF_W;
      const cy = HALF_H;
      const maxR = Math.hypot(cx, cy);
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const ringR = (i + 0.5) * (maxR / steps);
        const aMul = Math.pow(t, 2.4);
        this.vignette.lineStyle(maxR / steps + 2, 0x7a1014, aMul * alpha);
        this.vignette.strokeCircle(cx, cy, ringR);
      }
    }

    // Glitch
    this.glitchGfx.clear();
    if (now < this.glitchUntil) {
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * VIEWPORT_WIDTH;
        const y = Math.random() * VIEWPORT_HEIGHT;
        const w = 4 + Math.random() * 110;
        const h = 1 + Math.random() * 5;
        const col = Math.random() > 0.7 ? 0xffffff : 0x000000;
        this.glitchGfx.fillStyle(col, 0.35 + Math.random() * 0.45);
        this.glitchGfx.fillRect(x, y, w, h);
      }
    }
    if (now > this.nextGlitchAt) {
      const cooldown = 4500 + Math.random() * 7000 - this.proximity * 4000;
      const duration = 70 + Math.random() * 130 + this.proximity * 80;
      this.glitchUntil = now + duration;
      this.nextGlitchAt = now + Math.max(1500, cooldown) + duration;
    }
  }

  // -------------------------------------------------------------------------
  // End states
  // -------------------------------------------------------------------------

  private triggerGameOver(g: GhostState) {
    if (this.caught) return;
    this.caught = true;
    g.mode = "alerted";
    this.audio.playGameOver();
    this.cameras.main.shake(420, 0.012);
    this.cameras.main.flash(220, 122, 16, 20);
    // Lunge: scale Hanako up dramatically before the screen transition.
    g.scaleMul = 1.9;
    this.time.delayedCall(700, () => {
      this.scene.start("gameover", { ghost: g.def });
    });
  }

  private triggerClear() {
    if (this.cleared) return;
    this.cleared = true;
    this.audio.setProximity(0);
    this.cameras.main.flash(220, 242, 193, 78);
    this.time.delayedCall(500, () => {
      this.scene.start("clear");
    });
  }

  // -------------------------------------------------------------------------
  // Floor switching
  // -------------------------------------------------------------------------

  private checkStairs() {
    const stairs = this.room.stairs;
    if (!stairs || stairs.length === 0) {
      this.nearbyStair = null;
      this.stairPrompt.setVisible(false);
      return;
    }
    let closest: (typeof stairs)[number] | null = null;
    let minDist = Infinity;
    const reach = 1.6 * TS;
    for (const s of stairs) {
      const cx = (s.x + 0.5) * TS;
      const cy = (s.y + 0.5) * TS;
      const d = Math.hypot(cx - this.player.x, cy - this.player.y);
      if (d <= reach && d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    this.nearbyStair = closest;
    if (closest) {
      const goingUp = closest.toFloor === "school-2f";
      const arrow = goingUp ? "↑" : "↓";
      const target = goingUp ? "2階" : "1階";
      const lockHint =
        closest.requiresItem && !this.inventory.has(closest.requiresItem)
          ? `（${closest.lockedMessage ?? "鍵が必要"}）`
          : "";
      this.stairPrompt.setText(`${arrow} ${target}へ（Eキー）${lockHint}`);
      this.stairPrompt.setVisible(true);
    } else {
      this.stairPrompt.setVisible(false);
    }
  }

  private tryUseStair(stair: NonNullable<Room["stairs"]>[number]) {
    if (stair.requiresItem && !this.inventory.has(stair.requiresItem)) {
      this.showMessage(stair.lockedMessage ?? "鍵が必要だ", 1500);
      return;
    }
    this.switchFloor(stair.toFloor, stair.spawn.x, stair.spawn.y);
  }

  private switchFloor(toFloorId: string, spawnTileX: number, spawnTileY: number) {
    const next = this.bundle.floors[toFloorId];
    if (!next) return;
    this.currentFloorId = toFloorId;
    this.room = next;
    this.player.x = spawnTileX * TS + TS / 2;
    this.player.y = spawnTileY * TS + TS / 2;
    // Hanako warps to her first patrol point on the new floor.
    for (const g of this.ghostStates) {
      const wp = g.def.patrol[0];
      g.x = wp.x * TS + TS / 2;
      g.y = wp.y * TS + TS / 2;
      g.mode = "patrol";
      g.patrolIndex = 0;
      g.lastSeen = null;
      g.scaleMul = 1;
    }
    this.spawnKeys();
    this.lastRoomLabel = null;
    this.cameras.main.flash(380, 30, 30, 50);
    this.showMessage(this.room.name, 1600);
  }

  // -------------------------------------------------------------------------
  // Floating message
  // -------------------------------------------------------------------------

  private showMessage(text: string, durationMs = 2000) {
    if (this.messageText) this.messageText.destroy();
    const t = this.add.text(VIEWPORT_WIDTH / 2, 84, text, {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "22px",
      color: "#f2c14e",
    });
    t.setOrigin(0.5);
    t.setScrollFactor(0);
    t.setDepth(105);
    t.setShadow(0, 0, "#000000", 6, true, true);
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this.messageText = t;
    this.messageHideAt = this.time.now + durationMs;
  }

  private updateMessage(now: number) {
    if (!this.messageText) return;
    if (now < this.messageHideAt) return;
    const m = this.messageText;
    this.messageText = null;
    this.tweens.add({
      targets: m,
      alpha: 0,
      duration: 320,
      onComplete: () => m.destroy(),
    });
  }
}
