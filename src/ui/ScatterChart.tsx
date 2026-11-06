/**
 * 落點散布圖。
 *
 * 這是第 0 刀的驗收工具，量法照 `06_輸入狀態機與動作文法.md` 第三節分歧一：
 * 「對同一個目標點連打 20 次，畫落點散布圖」。
 * 取按下座標會是一個緊的圓，取放開座標會是一條沿甩動方向的長橢圓，
 * 混合應該是一個隨力道變大而變大的圓。
 */
import { useEffect, useRef } from 'react';
import { useHud } from '../state/hud';
import type { Session } from '../state/session';

const W = 232;
const H = 188;
/** 圖的半幅，畫面寬度的比例 */
const SPAN = 0.07;

export function ScatterChart({ session }: { session: Session }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useHud((s) => s.mode);
  const tick = useHud((s) => s.scatterTick);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d0908';
    g.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const px = (W * 0.44) / SPAN;

    g.strokeStyle = 'rgba(150,140,125,0.2)';
    for (const r of [0.02, 0.04, 0.06]) {
      g.beginPath();
      g.arc(cx, cy, r * px, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(150,140,125,0.35)';
    g.beginPath();
    g.moveTo(cx - 7, cy); g.lineTo(cx + 7, cy);
    g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 7);
    g.stroke();

    for (const p of session.scatter.byMode[mode]) {
      const x = cx + p.dx * px;
      const y = cy + p.dy * px;
      g.fillStyle = `rgba(224,102,28,${0.3 + p.force * 0.6})`;
      g.beginPath();
      g.arc(x, y, 1.5 + p.force * 2.4, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = 'rgba(150,140,125,0.55)';
    g.font = '10px ui-monospace, monospace';
    g.fillText('外圈 = 畫面寬度的 6%', 8, H - 8);
  }, [mode, tick, session]);

  const st = session.scatter.stats(mode);

  return (
    <div className="chart-box">
      <canvas ref={ref} style={{ width: W, height: H }} />
      <div className="chart-meta">
        <div>
          樣本 <b>{st.n}</b>
        </div>
        <div>
          平均偏移 <b>{(st.mean * 100).toFixed(2)}%</b>
        </div>
        <div>
          標準差 <b>{(st.sd * 100).toFixed(2)}%</b>
        </div>
        <div>
          最大 <b>{(st.max * 100).toFixed(2)}%</b>
        </div>
      </div>
    </div>
  );
}
