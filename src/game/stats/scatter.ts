/**
 * 落點散布統計。
 *
 * 這是第 0 刀的驗收工具，對應 `06_輸入狀態機與動作文法.md` 第三節分歧一的量法：
 * 「對同一個目標點連打 20 次，畫落點散布圖」。
 * 三種模式各自累積，可以直接比較。
 */
import type { LandingMode } from '../input/swing';

export interface ScatterPoint {
  /** 相對落點的偏移，單位是畫面寬度的比例 */
  dx: number;
  dy: number;
  force: number;
}

export interface ScatterStats {
  n: number;
  /** 平均偏移距離（畫面寬度比例） */
  mean: number;
  /** 標準差 */
  sd: number;
  /** 最大偏移 */
  max: number;
}

const EMPTY: ScatterStats = { n: 0, mean: 0, sd: 0, max: 0 };

/** 每個模式最多留這麼多筆 */
const CAP = 120;

export class ScatterLog {
  readonly byMode: Record<LandingMode, ScatterPoint[]> = {
    anchor: [],
    release: [],
    hybrid: [],
  };

  push(mode: LandingMode, p: ScatterPoint): void {
    const arr = this.byMode[mode];
    arr.push(p);
    if (arr.length > CAP) arr.shift();
  }

  stats(mode: LandingMode): ScatterStats {
    const arr = this.byMode[mode];
    if (!arr.length) return EMPTY;
    const ds = arr.map((p) => Math.hypot(p.dx, p.dy));
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    const varSum = ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length;
    return { n: ds.length, mean, sd: Math.sqrt(varSum), max: Math.max(...ds) };
  }

  clear(mode?: LandingMode): void {
    if (mode) this.byMode[mode] = [];
    else {
      this.byMode.anchor = [];
      this.byMode.release = [];
      this.byMode.hybrid = [];
    }
  }
}
