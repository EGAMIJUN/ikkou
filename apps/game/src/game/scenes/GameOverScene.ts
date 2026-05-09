import * as Phaser from "phaser";
import type { Ghost } from "@ikkou/content";

interface GameOverData {
  ghost?: Ghost;
}

const FACE_TEX_SILHOUETTE = "hanako-face-silhouette";
const FACE_TEX_HAIR = "hanako-face-hair";
const FACE_TEX_FULL = "hanako-face-full";
const FACE_W = 512;
const FACE_H = 640;

export class GameOverScene extends Phaser.Scene {
  private rKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: "gameover" });
  }

  create(data: GameOverData) {
    const { width, height } = this.scale;

    // Pitch black underlay so the face emerges from nothing.
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 1);

    this.ensureFaceTextures();

    const pattern = 1 + Math.floor(Math.random() * 4);
    const cinematicMs = this.runPattern(pattern, width, height);

    this.time.delayedCall(cinematicMs, () => {
      this.showRestartUi(data, width, height);
    });

    this.rKey = this.input.keyboard!.addKey("R");
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.scene.start("main");
    }
  }

  // -------------------------------------------------------------------------
  // Face textures (Ju-on / Ringu palette: pale skin, no irises, hair drape)
  // -------------------------------------------------------------------------

  private ensureFaceTextures() {
    if (!this.textures.exists(FACE_TEX_SILHOUETTE))
      this.makeFaceTexture(FACE_TEX_SILHOUETTE, "silhouette");
    if (!this.textures.exists(FACE_TEX_HAIR))
      this.makeFaceTexture(FACE_TEX_HAIR, "hair");
    if (!this.textures.exists(FACE_TEX_FULL))
      this.makeFaceTexture(FACE_TEX_FULL, "full");
  }

  private makeFaceTexture(key: string, variant: "silhouette" | "hair" | "full") {
    const tex = this.textures.createCanvas(key, FACE_W, FACE_H);
    if (!tex) return;
    const ctx = tex.getContext();

    const cx = FACE_W / 2;
    const cyFace = FACE_H * 0.45;
    const faceRX = FACE_W * 0.28; // vertical oval (taller than wide)
    const faceRY = FACE_H * 0.40;

    // Pale-blue ambient halo around the face so it reads against pure black.
    const halo = ctx.createRadialGradient(
      cx,
      cyFace,
      faceRX * 0.4,
      cx,
      cyFace,
      faceRX * 1.65,
    );
    halo.addColorStop(0, "rgba(160,176,196,0.06)");
    halo.addColorStop(1, "rgba(160,176,196,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, FACE_W, FACE_H);

    // Neck hint — softer + less saturated than the face.
    ctx.fillStyle = "rgba(214,206,196,0.65)";
    ctx.beginPath();
    ctx.ellipse(cx, FACE_H * 0.94, FACE_W * 0.30, FACE_H * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face oval — pale-blue skin (#e8e4d8).
    ctx.fillStyle = "#e8e4d8";
    ctx.beginPath();
    ctx.ellipse(cx, cyFace, faceRX, faceRY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Skin shadow — darker at the edges of the face (radial gradient inside the oval).
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cyFace, faceRX, faceRY, 0, 0, Math.PI * 2);
    ctx.clip();
    const skinShadow = ctx.createRadialGradient(
      cx,
      cyFace,
      faceRX * 0.32,
      cx,
      cyFace,
      faceRX * 1.05,
    );
    skinShadow.addColorStop(0, "rgba(70,72,82,0)");
    skinShadow.addColorStop(0.55, "rgba(70,72,82,0.06)");
    skinShadow.addColorStop(1, "rgba(56,58,70,0.5)");
    ctx.fillStyle = skinShadow;
    ctx.fillRect(0, 0, FACE_W, FACE_H);
    ctx.restore();

    if (variant === "hair" || variant === "full") this.drawHair(ctx, cx, cyFace, faceRX, faceRY);
    if (variant === "full") {
      this.drawUnderEyeShadow(ctx, cx, cyFace, faceRX, faceRY);
      this.drawFaceFeatures(ctx, cx, cyFace, faceRX, faceRY);
    }

    // Overall noisy/grainy texture for that low-res-VHS feel.
    this.applyNoise(ctx);

    tex.refresh();
  }

  private drawHair(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cyFace: number,
    rx: number,
    ry: number,
  ) {
    ctx.strokeStyle = "#1a0f0a";
    ctx.lineWidth = 3;
    // ~15 unruly strands from the crown.
    const strands = 15;
    for (let i = 0; i < strands; i++) {
      const baseX = cx - rx * 0.85 + ((i + 0.5) * (rx * 1.7)) / strands + (Math.random() - 0.5) * 10;
      const baseY = cyFace - ry * 0.95;
      const tipX = baseX + (Math.random() - 0.5) * 50;
      const tipY = cyFace - ry * 0.1 + Math.random() * ry * 0.65;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(
        baseX + (Math.random() - 0.5) * 30,
        baseY + (tipY - baseY) * 0.4,
        tipX + (Math.random() - 0.5) * 30,
        baseY + (tipY - baseY) * 0.75,
        tipX,
        tipY,
      );
      ctx.stroke();
    }
    // A handful of strands draping over the face (Sadako veil hint).
    ctx.lineWidth = 2;
    const drape = 4;
    for (let i = 0; i < drape; i++) {
      const baseX = cx + (i - (drape - 1) / 2) * 9;
      const baseY = cyFace - ry * 0.55;
      const tipY = cyFace + ry * (0.18 + Math.random() * 0.18);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + (Math.random() - 0.5) * 6, tipY);
      ctx.stroke();
    }
  }

  private drawUnderEyeShadow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cyFace: number,
    rx: number,
    ry: number,
  ) {
    // Shallow shadow under each eye.
    const eyeOffX = rx * 0.40;
    const eyeY = cyFace - ry * 0.08;
    ctx.fillStyle = "rgba(50,52,68,0.32)";
    ctx.beginPath();
    ctx.ellipse(cx - eyeOffX, eyeY + 14, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeOffX, eyeY + 14, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFaceFeatures(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cyFace: number,
    rx: number,
    ry: number,
  ) {
    const eyeOffX = rx * 0.40;
    const eyeY = cyFace - ry * 0.08;
    const eyeW = rx * 0.20;
    const eyeH = ry * 0.13;

    // Big solid-black eyes — no iris, no white.
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.ellipse(cx - eyeOffX, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeOffX, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Single pale highlight per eye.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx - eyeOffX + eyeW * 0.35, eyeY - eyeH * 0.45, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOffX + eyeW * 0.35, eyeY - eyeH * 0.45, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Mouth — slightly parted ellipse, dark crack with no upper lip.
    ctx.fillStyle = "#3d1a1a";
    ctx.beginPath();
    ctx.ellipse(cx, cyFace + ry * 0.45, rx * 0.18, ry * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private applyNoise(ctx: CanvasRenderingContext2D) {
    // Sparse pale-blue and dark speckles for a noisy, low-fidelity feel.
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * FACE_W;
      const y = Math.random() * FACE_H;
      const isLight = Math.random() > 0.55;
      const alpha = 0.04 + Math.random() * 0.06;
      ctx.fillStyle = isLight
        ? `rgba(218,228,240,${alpha})`
        : `rgba(38,42,54,${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Patterns
  // -------------------------------------------------------------------------

  private runPattern(pattern: number, w: number, h: number): number {
    if (pattern === 1) return this.runZoomIn(w, h);
    if (pattern === 2) return this.runGlitchCut(w, h);
    if (pattern === 3) return this.runEyesFirst(w, h);
    return this.runSlideIn(w, h);
  }

  /** Pattern 1: she walks toward the camera, growing through detail stages. */
  private runZoomIn(w: number, h: number): number {
    const face = this.add.image(w / 2, h / 2, FACE_TEX_SILHOUETTE);
    face.setOrigin(0.5);
    face.setScale(0.06);
    face.setAlpha(0.55);
    face.setDepth(5);

    this.tweens.add({
      targets: face,
      scale: 0.22,
      alpha: 0.85,
      duration: 700,
      onComplete: () => {
        face.setTexture(FACE_TEX_HAIR);
        this.tweens.add({
          targets: face,
          scale: 0.7,
          alpha: 0.95,
          duration: 700,
          onComplete: () => {
            face.setTexture(FACE_TEX_FULL);
            this.tweens.add({
              targets: face,
              scale: 2.5,
              alpha: 1,
              duration: 1100,
              ease: "Cubic.In",
            });
          },
        });
      },
    });

    return 2700;
  }

  /** Pattern 2: heavy glitch tearing the screen, then a smash-cut to her face. */
  private runGlitchCut(w: number, h: number): number {
    const glitch = this.add.graphics();
    glitch.setDepth(8);

    let elapsed = 0;
    const glitchEnd = 900;
    const timer = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        glitch.clear();
        const shards = 38;
        for (let i = 0; i < shards; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const rw = 4 + Math.random() * 220;
          const rh = 1 + Math.random() * 8;
          const col = Math.random() > 0.5 ? 0xffffff : 0x222222;
          glitch.fillStyle(col, 0.4 + Math.random() * 0.5);
          glitch.fillRect(x, y, rw, rh);
        }
        // Occasional whole-screen flashes
        if (Math.random() < 0.06) {
          glitch.fillStyle(0xffffff, 0.25);
          glitch.fillRect(0, 0, w, h);
        }
        elapsed += 16;
        if (elapsed >= glitchEnd) {
          timer.destroy();
          glitch.destroy();
        }
      },
    });

    this.time.delayedCall(glitchEnd, () => {
      const face = this.add.image(w / 2, h / 2, FACE_TEX_FULL);
      face.setOrigin(0.5);
      face.setScale(1.85);
      face.setDepth(5);
      // Subtle continued breathing — feels alive.
      this.tweens.add({
        targets: face,
        scale: 2.25,
        duration: 1300,
        ease: "Sine.Out",
      });
    });

    return 2500;
  }

  /** Pattern 3: only the eyes, then the rest of her bleeds into view. */
  private runEyesFirst(w: number, h: number): number {
    const eyesGfx = this.add.graphics();
    eyesGfx.setDepth(6);
    const eyeY = h * 0.46;
    const eyeOffsetX = 56;

    let elapsed = 0;
    const eyesPhase = 900;
    const eyesTimer = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        elapsed += 16;
        const t = Math.min(1, elapsed / eyesPhase);
        eyesGfx.clear();
        // Outer crimson glow
        eyesGfx.fillStyle(0x4a0808, 0.5 * t);
        eyesGfx.fillCircle(w / 2 - eyeOffsetX, eyeY, 28 * t);
        eyesGfx.fillCircle(w / 2 + eyeOffsetX, eyeY, 28 * t);
        // Pale inner glint that flickers
        const flick = 0.85 + Math.sin(elapsed * 0.04) * 0.15;
        eyesGfx.fillStyle(0xffe9c8, 0.6 * t * flick);
        eyesGfx.fillCircle(w / 2 - eyeOffsetX, eyeY, 9 * t);
        eyesGfx.fillCircle(w / 2 + eyeOffsetX, eyeY, 9 * t);
        if (elapsed >= eyesPhase) eyesTimer.destroy();
      },
    });

    this.time.delayedCall(eyesPhase, () => {
      eyesGfx.destroy();
      const face = this.add.image(w / 2, h / 2, FACE_TEX_SILHOUETTE);
      face.setOrigin(0.5);
      face.setScale(0.95);
      face.setAlpha(0);
      face.setDepth(5);
      this.tweens.add({
        targets: face,
        alpha: 1,
        duration: 600,
        onComplete: () => {
          face.setTexture(FACE_TEX_HAIR);
          this.tweens.add({
            targets: face,
            scale: 1.5,
            duration: 500,
            onComplete: () => {
              face.setTexture(FACE_TEX_FULL);
              this.tweens.add({
                targets: face,
                scale: 2.1,
                duration: 600,
                ease: "Cubic.In",
              });
            },
          });
        },
      });
    });

    return 2800;
  }

  /** Pattern 4: she slips in from off-screen, fully formed. */
  private runSlideIn(w: number, h: number): number {
    const fromLeft = Math.random() < 0.5;
    const offscreenPad = FACE_W * 1.1;
    const startX = fromLeft ? -offscreenPad : w + offscreenPad;

    const face = this.add.image(startX, h / 2, FACE_TEX_FULL);
    face.setOrigin(0.5);
    face.setScale(1.55);
    face.setDepth(5);
    face.setAngle(fromLeft ? -8 : 8);

    this.tweens.add({
      targets: face,
      x: w / 2,
      angle: 0,
      duration: 720,
      ease: "Cubic.Out",
      onComplete: () => {
        // After settling, her face leans in toward the camera.
        this.tweens.add({
          targets: face,
          scale: 2.3,
          duration: 1300,
          ease: "Sine.Out",
        });
      },
    });

    return 2400;
  }

  // -------------------------------------------------------------------------
  // Restart UI on top of the face
  // -------------------------------------------------------------------------

  private showRestartUi(data: GameOverData, w: number, h: number) {
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
    overlay.setDepth(20);
    this.tweens.add({ targets: overlay, alpha: 0.78, duration: 600 });

    const title = this.add.text(w / 2, h / 2 - 40, "見つかった", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "48px",
      color: "#e8e6f0",
    });
    title.setOrigin(0.5);
    title.setShadow(0, 0, "#7a1014", 18, true, true);
    title.setDepth(21);
    title.setAlpha(0);

    const subtitle = data.ghost?.catchphrase ?? "視線に捕まったら、もう逃げられない。";
    const sub = this.add.text(w / 2, h / 2 + 12, subtitle, {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "20px",
      color: "#c7c2d4",
    });
    sub.setOrigin(0.5);
    sub.setDepth(21);
    sub.setAlpha(0);

    const hint = this.add.text(w / 2, h / 2 + 64, "[ R ] でやり直す", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "14px",
      color: "#7a1014",
    });
    hint.setOrigin(0.5);
    hint.setDepth(21);
    hint.setAlpha(0);

    this.tweens.add({
      targets: [title, sub, hint],
      alpha: 1,
      duration: 600,
      delay: 250,
      onComplete: () => {
        this.tweens.add({
          targets: hint,
          alpha: { from: 0.4, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
        });
      },
    });
  }
}
