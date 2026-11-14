import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export interface DjTextures { body: Texture; armL: Texture; armR: Texture }

// Tọa độ tính theo pixel của ảnh thân (627×608), gốc = giữa đáy thân (mép trên bàn DJ).
const REST = 0.3;
const BODY_W = 627;
const BODY_H = 608;
const ARM_L = { pivot: [202, 53], shoulder: [225, 395] } as const; // tay bên trái màn hình
const ARM_R = { pivot: [69, 48], shoulder: [425, 400] } as const;  // tay bên phải màn hình

/**
 * DJ ghép từ ảnh của bạn: thân + đầu là một mảnh, hai cánh tay là hai mảnh riêng quay quanh vai.
 * Đầu gật theo nhịp, vai nhún, hai tay scratch luân phiên; cứ 16 nhịp tay trái giơ lên vẫy.
 */
export class DjRig extends Container {
  private body: Sprite;
  private armL: Sprite;
  private armR: Sprite;
  private t = 0;

  constructor(tx: DjTextures) {
    super();
    this.body = new Sprite(tx.body);
    this.body.anchor.set(0.5, 1);
    this.armL = this.makeArm(tx.armL, ARM_L);
    this.armR = this.makeArm(tx.armR, ARM_R);
    this.addChild(this.body, this.armL, this.armR);
  }

  private makeArm(tex: Texture, a: { pivot: readonly number[]; shoulder: readonly number[] }) {
    const s = new Sprite(tex);
    s.pivot.set(a.pivot[0], a.pivot[1]);
    s.position.set(a.shoulder[0] - BODY_W / 2, a.shoulder[1] - BODY_H);
    return s;
  }

  /** Thân bị cắt ở mép sau mặt bàn; hai tay được thả xuống tận mặt bàn. */
  setMasks(bodyMask: Container | Graphics, armMask: Container | Graphics) {
    this.body.mask = bodyMask;
    this.armL.mask = armMask;
    this.armR.mask = armMask;
  }

  update(dt: number, beat: number, pulse: number) {
    this.t += dt;
    const j = Math.abs(Math.sin(beat * Math.PI));
    const boost = 1 + pulse * 0.7;
    const sway = Math.sin(beat * Math.PI * 0.5);

    // cả thân nhún và nghiêng nhẹ quanh chân (chân bị bàn che)
    this.body.rotation = sway * 0.025 * boost;
    this.body.scale.set(1 - 0.012 * j, 1 + 0.03 * j * boost);
    this.armL.y = this.armR.y = this.body.y - 6 * j * boost + (ARM_L.shoulder[1] - BODY_H);

    // tay scratch luân phiên (xoay quanh vai)
    const phL = beat * Math.PI;
    const phR = beat * Math.PI + Math.PI / 2;
    // tư thế nghỉ: hai tay dang ra và nâng lên để bàn tay đặt trên mặt bàn (không chìm xuống dưới)
    let rl = REST + Math.sin(phL) * 0.1 * boost;
    const rr = -REST + Math.sin(phR) * 0.1 * boost;

    // mỗi 16 nhịp: tay trái giơ lên vẫy trong 2 nhịp
    const cycle = beat % 16;
    const raise = cycle > 12 && cycle < 14 ? Math.sin((cycle - 12) * Math.PI * 0.5) : 0;
    if (raise > 0) rl = rl * (1 - raise) + (1.15 + Math.sin(this.t * 12) * 0.14) * raise;
    this.armL.rotation = rl;
    this.armR.rotation = rr;
  }
}
