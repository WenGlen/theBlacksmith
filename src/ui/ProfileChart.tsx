/**
 * 目標輪廓對照。
 *
 * `02_操作轉化設計.md` 原則 3：「厚度就給輪廓線與剖面示意」。
 * 所以這裡畫的是**形狀**，不是完成度百分比。玩家要看的是
 * 「哪一段還太粗、哪一段還沒拉到」，不是一個會讓人開始刷的數字。
 *
 * 側視圖：橫軸是長度（含目標全長，所以料還短的時候右邊是空的），
 * 縱軸是半徑，上下對稱。虛線是目標，實心是現在的料。
 */
import { useEffect, useRef } from 'react';
import { SEG } from '../game/workpiece/workpiece';
import { useHud } from '../state/hud';
import type { Session } from '../state/session';

const W = 230;
const H = 74;

export function ProfileChart({ session }: { session: Session }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 節流過的 tick：長度一變就重畫，不用自己開計時器
  const len = useHud((s) => s.lengthMm);
  const within = useHud((s) => s.profileWithin);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const { wp, target } = session;
    const pad = 6;
    const innerW = W - pad * 2;
    const midY = H / 2;
    // 縱向比例：留一點餘裕，原料半徑 13 mm 要塞得下
    const rMax = 0.016;
    const sy = (H / 2 - 4) / rMax;
    const sx = innerW / target.length;

    // 目標：虛線
    g.strokeStyle = '#6f6a5e';
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    for (const sign of [1, -1]) {
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const s = (i / 80) * target.length;
        const x = pad + s * sx;
        const y = midY - sign * target.radiusAt(s) * sy;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.setLineDash([]);

    // 現在的料：實心
    const z0 = wp.spineZ[0];
    g.beginPath();
    for (let i = 0; i < SEG; i++) {
      const x = pad + (wp.spineZ[i] - z0) * sx;
      const y = midY - wp.meanRadius(i) * sy;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let i = SEG - 1; i >= 0; i--) {
      const x = pad + (wp.spineZ[i] - z0) * sx;
      g.lineTo(x, midY + wp.meanRadius(i) * sy);
    }
    g.closePath();
    g.fillStyle = 'rgba(214, 138, 58, 0.55)';
    g.fill();
    g.strokeStyle = '#e09a4a';
    g.lineWidth = 1;
    g.stroke();

    // 目標終點
    const endX = pad + target.length * sx;
    g.strokeStyle = '#8c8575';
    g.beginPath();
    g.moveTo(endX, 4);
    g.lineTo(endX, H - 4);
    g.stroke();
  }, [session, len, within]);

  return <canvas ref={ref} style={{ width: W, height: H }} />;
}
