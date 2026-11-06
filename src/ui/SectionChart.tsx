/**
 * 斷面示意。
 *
 * `02_操作轉化設計.md` 4.2 要的那個「畫面角落有斷面示意，顯示這一段是方是扁」。
 * 第 0 刀的驗收標準第 3 條（打得出八角而且看得懂現在幾度）就靠這張圖。
 */
import { useEffect, useRef } from 'react';
import { useHud } from '../state/hud';

const SIZE = 118;

export function SectionChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const poly = useHud((s) => s.sectionPoly);
  const roll = useHud((s) => s.roll);
  const w = useHud((s) => s.sectionW);
  const h = useHud((s) => s.sectionH);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const scale = (SIZE * 0.4) / 26; // 26 mm 方料塞滿八成

    // 起始方料的參考框
    g.strokeStyle = 'rgba(160,150,135,0.28)';
    g.setLineDash([3, 3]);
    g.strokeRect(cx - 13 * scale, cy - 13 * scale, 26 * scale, 26 * scale);
    g.setLineDash([]);

    // 目前斷面。轉 roll 讓它跟畫面上看到的方向一致
    g.beginPath();
    for (let k = 0; k < poly.length; k++) {
      const th = (k / poly.length) * Math.PI * 2 + roll;
      const r = poly[k] * scale;
      const x = cx + Math.cos(th) * r;
      const y = cy - Math.sin(th) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = 'rgba(224,102,28,0.22)';
    g.fill();
    g.strokeStyle = '#e0661c';
    g.lineWidth = 1.5;
    g.stroke();

    // 砧面
    g.strokeStyle = 'rgba(122,160,94,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(10, cy + 13 * scale + 4);
    g.lineTo(SIZE - 10, cy + 13 * scale + 4);
    g.stroke();
  }, [poly, roll]);

  const deg = (((roll * 180) / Math.PI) % 360 + 360) % 360;
  const flat = w > 0 ? h / w : 1;

  return (
    <div className="chart-box">
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} />
      <div className="chart-meta">
        <div>
          斷面 <b>{w.toFixed(1)}</b> × <b>{h.toFixed(1)}</b> mm
        </div>
        <div>
          角度 <b>{deg.toFixed(0)}°</b>
        </div>
        <div className={flat < 0.6 ? 'warn' : ''}>
          {flat > 0.88 ? '方' : flat > 0.6 ? '略扁' : '扁'}
        </div>
      </div>
    </div>
  );
}
