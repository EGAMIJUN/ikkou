import * as Phaser from "phaser";

/**
 * Empty boot scene — kept as an extension point for asset preloading
 * once the project moves beyond programmatic shapes.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "boot" });
  }

  create() {
    this.scene.start("main");
  }
}
