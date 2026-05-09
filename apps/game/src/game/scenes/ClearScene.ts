import * as Phaser from "phaser";

export class ClearScene extends Phaser.Scene {
  private rKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: "clear" });
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78);

    const title = this.add.text(width / 2, height / 2 - 40, "脱出成功", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "48px",
      color: "#f2c14e",
    });
    title.setOrigin(0.5);
    title.setShadow(0, 0, "#f2c14e", 18, true, true);

    const sub = this.add.text(width / 2, height / 2 + 12, "鍵を全て集め、外の光へ──。", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "20px",
      color: "#e8e6f0",
    });
    sub.setOrigin(0.5);

    const hint = this.add.text(width / 2, height / 2 + 64, "[ R ] でやり直す", {
      fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
      fontSize: "14px",
      color: "#c7c2d4",
    });
    hint.setOrigin(0.5);

    this.tweens.add({
      targets: hint,
      alpha: { from: 0.4, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    this.rKey = this.input.keyboard!.addKey("R");
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.scene.start("main");
    }
  }
}
