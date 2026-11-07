/**
 * 爐火。
 *
 * 這一層不認識 React 也不認識 three.js，跟 `game/` 底下其他東西一樣。
 * 它只回答一件事：**現在把料放在火裡的某個深度，這一幀能得到多少熱。**
 *
 * 設計依據 `02_操作轉化設計.md` 4.1：
 *   - 主動詞是「持」，按住期間一直在累積，跟砧上的「揮」剛好相反
 *   - 送風要持續補，放開就衰減
 *   - 火心最熱、邊緣低得多，局部加熱就是靠插入深度
 */

export const FORGE_TUNING = {
  /** 按住送風時，風力每秒往上多少 */
  airRise: 1.35,
  /** 放開之後風力每秒掉多少 */
  airDecay: 0.52,
  /**
   * 完全沒風時，火心維持得住的溫度。
   * 工件在這個火裡最多只會平衡在 0.44 左右，連鍛造溫度都到不了。
   */
  coreIdle: 0.62,
  /**
   * 風力滿載時的火心溫度。**刻意超過 1.0**。
   *
   * 1.0 是工件溫標的上限（白熱），不是火的上限 —— 炭火加上送風遠比
   * 白熱的鐵還燙。設成 1.0 的話散熱會在 0.886 就追平加熱，
   * 鐵永遠燒不壞，過熱這個機制等於不存在（量到的：300 秒還沒燒損）。
   */
  coreMax: 1.45,
  /** 火心追上目標溫度的速度。炭火有慣性，不會一送風就白熱 */
  coreLerp: 0.85,
  /**
   * 貼著火心時，工件每秒把溫差補掉多少比例。
   *
   * 0.78 時從全冷加熱到鍛造溫度只要 2.3 秒，回爐等於沒有成本。
   * 配合 coreMax 1.45 調到 0.125 之後是 6 秒出頭，跟走路的 1.25 秒來回加起來，
   * 一次回爐大約吃掉 8 秒 —— 相對於一火 27 秒的工作時間，
   * 玩家會開始算「這一火還夠不夠做完這一段」。
   */
  soakRate: 0.125,
  /**
   * 插入深度的衰減指數。越大代表邊緣越冷、火心越集中。
   *
   * 2.2 太陡：只有正好壓在火心那一兩段熱得起來，推到底燒十秒中段也只到
   * 0.50，連鍛造溫度都不到。炭火的熱區是一整塊不是一個點，
   * 1.25 之後推到底有大約 20 cm 落在 depth ≥ 0.7 的範圍裡。
   */
  depthPower: 1.25,
  /** 爐口到火心的距離（公尺）。深度就是沿這條線的位置 */
  mouthToCore: 0.3,
} as const;

export class Forge {
  /** 風力 0..1 */
  air = 0.35;
  /** 火心溫度 0..1 */
  core = FORGE_TUNING.coreIdle;
  /** 這一幀有沒有在送風 */
  private pumping = false;

  /** 空白鍵按下／放開 */
  setPumping(on: boolean): void {
    this.pumping = on;
  }

  /** 每幀推進風力與火心 */
  update(dtSec: number): void {
    const T = FORGE_TUNING;
    this.air = clamp01(
      this.air + (this.pumping ? T.airRise : -T.airDecay) * dtSec,
    );
    const target = T.coreIdle + (T.coreMax - T.coreIdle) * this.air;
    // 指數趨近，所以火心永遠落後風力一拍
    this.core += (target - this.core) * (1 - Math.exp(-T.coreLerp * dtSec * 3));
  }

  /**
   * 某個插入深度這一幀能把溫度推高多少。
   *
   * 關鍵是**上限是火心溫度**：鐵不會比火還熱。所以風不夠大的時候，
   * 料加熱到一半就停在那裡不動了 —— 玩家會自己發現要送風，
   * 不需要任何教學文字。
   *
   * @param depth01 0 是爐口，1 是火心
   * @param temp 這一段現在的溫度
   * @param dtSec 這一幀多久
   */
  gainAt(depth01: number, temp: number, dtSec: number): number {
    const d = clamp01(depth01);
    const reach = Math.pow(d, FORGE_TUNING.depthPower);
    const head = this.core - temp;
    if (head <= 0) return 0;
    return head * FORGE_TUNING.soakRate * reach * dtSec;
  }

  /** 爐火現在看起來多旺，給畫面用 */
  get glow(): number {
    const T = FORGE_TUNING;
    return clamp01((this.core - T.coreIdle) / (T.coreMax - T.coreIdle));
  }

  reset(): void {
    this.air = 0.35;
    this.core = FORGE_TUNING.coreIdle;
    this.pumping = false;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
