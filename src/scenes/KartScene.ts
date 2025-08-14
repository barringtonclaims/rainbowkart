import Phaser from 'phaser';

type LapState = {
  currentLap: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  lapStartTs: number;
};

export class KartScene extends Phaser.Scene {
  private track!: Phaser.GameObjects.Graphics;
  private kart!: Phaser.Physics.Matter.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lapState: LapState = {
    currentLap: 1,
    lastLapMs: null,
    bestLapMs: null,
    lapStartTs: 0
  };
  private hudText!: Phaser.GameObjects.Text;
  private checkpoints!: Phaser.GameObjects.Group;
  private passedCheckpoints: Set<number> = new Set();

  private readonly worldWidth = 1800;
  private readonly worldHeight = 1200;

  constructor() {
    super('KartScene');
  }

  preload(): void {}

  create(): void {
    this.cameras.main.setBackgroundColor('#10151f');

    this.matter.world.setBounds(0, 0, this.worldWidth, this.worldHeight, 32, true, true, true, true);

    this.createTrack();
    this.createKart();
    this.createCheckpoints();
    this.setupCamera();
    this.createHUD();

    this.lapState.lapStartTs = this.time.now;
  }

  private createTrack(): void {
    const centerX = this.worldWidth / 2;
    const centerY = this.worldHeight / 2;

    const outerRadiusX = 600;
    const outerRadiusY = 350;
    const innerRadiusX = 350;
    const innerRadiusY = 200;

    this.track = this.add.graphics();
    this.track.fillStyle(0x1e293b, 1);
    this.track.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Draw grass
    this.track.fillStyle(0x0e4429, 1);
    this.track.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Paint tarmac and punch inner grass
    const ring = this.add.graphics();
    ring.fillStyle(0x3a3f4b, 1);
    ring.fillEllipse(centerX, centerY, outerRadiusX * 2, outerRadiusY * 2);
    ring.fillStyle(0x0e4429, 1);
    ring.fillEllipse(centerX, centerY, innerRadiusX * 2, innerRadiusY * 2);

    // Build static walls approximating inner and outer ellipses with Matter
    const wallThickness = 30;
    const segments = 80;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;

      const makeSeg = (rX: number, rY: number) => {
        const x0 = centerX + Math.cos(a0) * rX;
        const y0 = centerY + Math.sin(a0) * rY;
        const x1 = centerX + Math.cos(a1) * rX;
        const y1 = centerY + Math.sin(a1) * rY;
        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;
        const len = Phaser.Math.Distance.Between(x0, y0, x1, y1) + 2;
        const ang = Phaser.Math.Angle.Between(x0, y0, x1, y1);
        const seg = this.add.rectangle(midX, midY, len, wallThickness, 0x000000, 0);
        this.matter.add.gameObject(seg, { isStatic: true });
        seg.setRotation(ang);
      };

      makeSeg(outerRadiusX, outerRadiusY);
      makeSeg(innerRadiusX, innerRadiusY);
    }

    // Start/finish line
    const lineX = centerX - innerRadiusX - 40;
    const lineY = centerY;
    const line = this.add.rectangle(lineX, lineY, 12, 220, 0xffffff, 1);
    line.setStrokeStyle(2, 0x000000, 0.6);
  }

  private createKart(): void {
    const startX = this.worldWidth / 2 - 400;
    const startY = this.worldHeight / 2 + 50;
    this.kart = this.matter.add.sprite(startX, startY, undefined as unknown as string, undefined, {
      frictionAir: 0.08,
      friction: 0.01,
      restitution: 0
    });

    // Draw simple kart as a graphics texture
    const g = this.add.graphics();
    g.fillStyle(0xd946ef, 1);
    g.fillRoundedRect(0, 0, 42, 24, 6);
    g.fillStyle(0x1f1f1f, 1);
    g.fillRect(3, 3, 10, 18);
    g.fillRect(29, 3, 10, 18);
    const rt = this.make.renderTexture({ x: 0, y: 0, width: 42, height: 24 });
    rt.draw(g, 0, 0);
    const kartKey = 'kartTexture';
    rt.saveTexture(kartKey);
    this.kart.setTexture(kartKey);
    this.kart.setOrigin(0.5);
    this.kart.setBounce(0);

    this.cursors = this.input.keyboard!.createCursorKeys();

  }

  private createCheckpoints(): void {
    this.checkpoints = this.add.group();
    const centerX = this.worldWidth / 2;
    const centerY = this.worldHeight / 2;
    const radiusX = 470;
    const radiusY = 280;
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;
      const cp = this.add.rectangle(x, y, 16, 120, 0x00ff00, 0);
      cp.setData('id', i);
      cp.setData('angle', angle);
      this.checkpoints.add(cp);
      this.matter.add.gameObject(cp, { isStatic: true, isSensor: true });
      cp.setRotation(angle);
    }
    this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      for (const pair of event.pairs) {
        const a = (pair.bodyA as MatterJS.BodyType).gameObject as Phaser.GameObjects.GameObject | undefined;
        const b = (pair.bodyB as MatterJS.BodyType).gameObject as Phaser.GameObjects.GameObject | undefined;
        const hit = a === this.kart ? b : b === this.kart ? a : undefined;
        if (!hit) continue;
        if (hit instanceof Phaser.GameObjects.Rectangle && hit.getData('id') != null) {
          const id = hit.getData('id') as number;
          if (!this.passedCheckpoints.has(id)) {
            this.passedCheckpoints.add(id);
            if (this.passedCheckpoints.size === this.checkpoints.getLength()) {
              this.finishLap();
              this.passedCheckpoints.clear();
            }
          }
        }
      }
    });
  }

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.kart, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.1);
  }

  private createHUD(): void {
    this.hudText = this.add.text(16, 16, '', {
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial',
      fontSize: '16px',
      color: '#ffffff'
    }).setScrollFactor(0);
  }

  private finishLap(): void {
    const now = this.time.now;
    const lapMs = now - this.lapState.lapStartTs;
    this.lapState.lapStartTs = now;
    this.lapState.lastLapMs = lapMs;
    if (this.lapState.bestLapMs == null || lapMs < this.lapState.bestLapMs) {
      this.lapState.bestLapMs = lapMs;
    }
    this.lapState.currentLap += 1;
  }

  update(): void {
    const accel = 0.0022; // force scale per frame
    const maxSpeed = 7.2; // max velocity magnitude
    const steerSpeed = 0.06; // radians/frame at high speed
    const driftFactor = 0.86; // lateral damping

    const body = this.kart.body as MatterJS.BodyType;
    const vel = new Phaser.Math.Vector2(body.velocity.x, body.velocity.y);
    const speed = vel.length();
    const turn = this.cursors.left?.isDown ? -1 : this.cursors.right?.isDown ? 1 : 0;
    const steer = Phaser.Math.Linear(0.02, steerSpeed, Phaser.Math.Clamp(speed / maxSpeed, 0, 1));
    this.kart.setRotation(this.kart.rotation + turn * steer);

    const forward = new Phaser.Math.Vector2(Math.cos(this.kart.rotation), Math.sin(this.kart.rotation));
    const throttle = this.cursors.up?.isDown ? 1 : this.cursors.down?.isDown ? -0.6 : 0;
    const force = forward.clone().scale(throttle * accel);
    this.kart.applyForce(force);

    // Dampen lateral slippage
    const right = new Phaser.Math.Vector2(-forward.y, forward.x);
    const newVel = new Phaser.Math.Vector2(body.velocity.x, body.velocity.y);
    const lateral = right.clone().scale(right.dot(newVel));
    const corrected = newVel.subtract(lateral.scale(1 - driftFactor));

    // Cap speed
    if (corrected.length() > maxSpeed) {
      corrected.scale(maxSpeed / corrected.length());
    }
    this.kart.setVelocity(corrected.x, corrected.y);

    // HUD update
    const now = this.time.now;
    const currentMs = now - this.lapState.lapStartTs;
    const fmt = (ms: number | null) => (ms == null ? '--:--.--' : this.formatMs(ms));
    this.hudText.setText(
      `Lap ${this.lapState.currentLap}\n` +
      `Current: ${fmt(currentMs)}\n` +
      `Last: ${fmt(this.lapState.lastLapMs)}\n` +
      `Best: ${fmt(this.lapState.bestLapMs)}`
    );
  }

  private formatMs(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const hundredths = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    const hh = hundredths.toString().padStart(2, '0');
    return `${mm}:${ss}.${hh}`;
  }
}


