/**
 * 測試台 HUD。
 *
 * 這一刀的 HUD 是驗收工具，不是遊戲 UI。正式版的 HUD 要照
 * `02_操作轉化設計.md` 原則 3 把這些數字全部拿掉，只留顏色。
 */
import { useEffect, useState } from 'react';
import { heatColor, scorchLabel } from '../game/thermal/heat';
import type { LandingMode } from '../game/input/swing';
import { useHud } from '../state/hud';
import type { Session } from '../state/session';
import { ScatterChart } from './ScatterChart';
import { ProfileChart } from './ProfileChart';
import { SectionChart } from './SectionChart';

const MODES: Array<{ v: LandingMode; label: string }> = [
  { v: 'anchor', label: '取按下座標' },
  { v: 'release', label: '取放開座標' },
  { v: 'hybrid', label: '混合' },
];

const STATE_LABEL: Record<string, string> = {
  idle: '空手',
  armed: '握錘',
  windup: '後擺',
  swing: '前擺',
};

export function Hud({ session }: { session: Session }) {
  const s = useHud();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  const [r, g, b] = heatColor(s.heat);
  const heatCss = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  const flashAlive = s.flash && performance.now() - s.flash.at < 1300;
  const atForge = s.station === 'forge';

  return (
    <div className="hud">
      <div className="panel tl">
        <div className="row">
          <span className="tag">
            {s.travelling ? '走路中' : atForge ? '爐前' : STATE_LABEL[s.swingState]}
          </span>
          <span className="hint">
            {s.travelling
              ? '走過去的時候手上的料還在降溫。'
              : atForge
                ? '按住左鍵把料壓進火心，上下移動調深淺。空白鍵送風。'
                : s.hint}
          </span>
        </div>

        {atForge ? (
          <>
            <div className="windup">
              <div className="windup-fill" style={{ width: `${s.insert * 100}%` }} />
            </div>
            <div className="sub">插入深度（只有推進去的那幾段會熱）</div>
            <div className="windup">
              <div
                className="windup-fill air"
                style={{ width: `${s.air * 100}%` }}
              />
            </div>
            <div className="sub">風量（放開空白鍵就衰減，火心跟著掉）</div>
          </>
        ) : (
          <>
            <div className="windup">
              <div
                className={`windup-fill ${s.overshoot ? 'over' : ''}`}
                style={{ width: `${Math.min(1, s.windup) * 100}%` }}
              />
            </div>
            <div className="sub">後擺幅度（滿格之後只會讓你打得更偏）</div>
          </>
        )}

        <details className="keys">
          <summary>操作</summary>
          {atForge ? (
            <>
              <div><b>左鍵按住</b> 把料壓進火心，放開就夾出來</div>
              <div><b>按住期間上下移動</b> 調插入深淺</div>
              <div><b>空白鍵</b> 送風。放開風力就衰減，要一直補</div>
            </>
          ) : (
            <>
              <div><b>左鍵</b> 握錘→左右甩→放開落錘</div>
              <div className="sub">按住不放＝連打，甩回原點放開＝收手</div>
            </>
          )}
          <div><b>Q／E</b> 翻轉：點一下 90 度，按住不放連續轉</div>
          <div><b>A／D</b> 送料：點一下一格，按住不放連續送</div>
          <div><b>右鍵拖</b> 環視（只有空手時能轉）</div>
          <div><b>F</b> 走到{atForge ? '鐵砧' : '爐火'}　<b>Tab</b> 遮光　<b>N</b> 換新料</div>
        </details>
      </div>

      <div className="panel tr">
        <div className="group">
          <div className="label">落點取樣（06 分歧一）</div>
          {MODES.map((m) => (
            <label key={m.v} className="opt">
              <input
                type="radio"
                checked={s.mode === m.v}
                onChange={() => {
                  s.patch({ mode: m.v });
                  session.swing.mode = m.v;
                }}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="group">
          <div className="label">
            技藝（基礎偏移半徑 {(s.skillR * 100).toFixed(1)}%）
          </div>
          <input
            type="range"
            min={0}
            max={0.035}
            step={0.001}
            value={s.skillR}
            onChange={(e) => {
              const v = Number(e.target.value);
              s.patch({ skillR: v });
              session.swing.skillRadiusR = v;
            }}
          />
        </div>
        <div className="group">
          <label className="opt">
            <input
              type="checkbox"
              checked={s.recallEnabled}
              onChange={(e) => {
                s.patch({ recallEnabled: e.target.checked });
                session.swing.recallEnabled = e.target.checked;
              }}
            />
            收手判定（06 分歧二）
          </label>
          <label className="opt">
            <input
              type="checkbox"
              checked={s.usePeakWindow}
              onChange={(e) => {
                s.patch({ usePeakWindow: e.target.checked });
                session.swing.usePeakWindow = e.target.checked;
              }}
            />
            力道取窗內峰值
          </label>
        </div>
        <button
          className="btn"
          onClick={() => {
            session.scatter.clear();
            s.bumpScatter();
          }}
        >
          清除散布資料
        </button>
      </div>

      <div className="panel bl">
        <div className="row heat">
          <span className="swatch" style={{ background: heatCss }} />
          <span className="heatname">{s.heatName}</span>
          <span className="sub">{s.dim ? '遮光中' : 'Tab 遮光'}</span>
        </div>
        <SectionChart />
        <div className="stats">
          <span>長 <b>{s.lengthMm.toFixed(0)}</b> mm</span>
          <span>第 <b>{s.aimSeg}</b> 段</span>
          <span>錘 <b>{s.hits}</b></span>
          <span>收手 <b>{s.recalls}</b></span>
          <span className={s.cracks ? 'bad' : ''}>裂 <b>{s.cracks}</b></span>
          {s.scorch > 0.08 && (
            <span className="bad">{scorchLabel(s.scorch)}</span>
          )}
        </div>

        <div className="target">
          <div className="row">
            <span className="label">{session.target.name}</span>
            <span className="sub">
              {s.profileDone
                ? '做好了'
                : s.profileLenErr < -session.target.lengthTol
                  ? '還要再拉長'
                  : s.profileLenErr > session.target.lengthTol
                    ? '拉過頭了'
                    : '長度到了，修形'}
            </span>
          </div>
          <ProfileChart session={session} />
          <div className="windup thin">
            <div
              className="windup-fill fit"
              style={{ width: `${s.profileWithin * 100}%` }}
            />
          </div>
          <div className="sub">虛線是目標。實心是現在的料</div>
        </div>
      </div>

      <div className="panel br">
        <ScatterChart session={session} />
        <div className="stats">
          <span>力道 <b>{(s.lastForce * 100).toFixed(0)}</b></span>
          <span>傾角 <b>{s.lastTilt.toFixed(2)}</b></span>
          <span>間隔 <b>{s.rhythmMs ? s.rhythmMs.toFixed(0) : '—'}</b> ms</span>
        </div>
      </div>

      {flashAlive && s.flash && (
        <div className={`flash ${s.flash.kind}`}>{s.flash.msg}</div>
      )}
    </div>
  );
}
