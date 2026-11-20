import { Container, Graphics, Text } from 'pixi.js';
import type { TeamState } from '../engine/avatars';
import { STAGE_W } from '../engine/slots';

const W = 660;
const H = 44;
export const TEAM_COLOR = { red: 0xff4f6d, blue: 0x2de2ff };

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Thanh tỉ số hai phe + đồng hồ vòng. Ẩn khi chưa ai chọn phe. */
export class TeamBar extends Container {
  private g = new Graphics();
  private txt: Text;
  private s: TeamState | null = null;
  private fade = 0;
  private t = 0;
  private shown = '';

  constructor() {
    super();
    this.eventMode = 'none';
    this.txt = new Text({ text: '', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 26, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1a0b33, width: 5 } } });
    this.txt.anchor.set(0.5);
    this.addChild(this.g, this.txt);
    this.position.set(STAGE_W / 2, 262);
    this.alpha = 0;
  }

  set(s: TeamState) { this.s = s; }

  update(dt: number) {
    this.t += dt;
    this.fade += ((this.s?.active ? 1 : 0) - this.fade) * Math.min(1, dt * 6);
    this.alpha = this.fade;
    const s = this.s;
    if (!s || this.fade < 0.01) return;

    const total = s.red + s.blue;
    const rf = total ? Math.min(0.9, Math.max(0.1, s.red / total)) : 0.5;
    const iw = W - 8;
    const ih = H - 8;
    this.g.clear();
    this.g.roundRect(-W / 2, -H / 2, W, H, H / 2).fill({ color: 0x120728, alpha: 0.75 });
    this.g.roundRect(-iw / 2, -ih / 2, iw * rf, ih, ih / 2).fill({ color: TEAM_COLOR.red, alpha: 0.9 });
    this.g.roundRect(-iw / 2 + iw * rf - 10, -ih / 2, iw * (1 - rf) + 10, ih, ih / 2).fill({ color: TEAM_COLOR.blue, alpha: 0.9 });
    this.g.roundRect(-W / 2, -H / 2, W, H, H / 2).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

    const wins = s.winsRed + s.winsBlue ? `   (thắng ${s.winsRed}-${s.winsBlue})` : '';
    const text = s.winner
      ? `🏆 PHE ${s.winner === 'red' ? 'ĐỎ' : 'XANH'} THẮNG!`
      : `ĐỎ ${s.red}  •  ${fmt(s.left)}  •  ${s.blue} XANH${wins}`;
    if (text !== this.shown) { this.shown = text; this.txt.text = text; }
    this.scale.set(s.winner ? 1 + 0.04 * Math.sin(this.t * 8) : 1);
  }
}
