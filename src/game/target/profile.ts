/**
 * 目標輪廓與吻合度。
 *
 * `02_操作轉化設計.md` 原則 3 說「溫度就給顏色，厚度就給輪廓線與剖面示意」。
 * 所以這裡算出來的東西是**給畫面疊一條線用的**，不是給玩家看的百分比。
 * HUD 不准把 `within` 直接印成「完成度 87%」—— 那會讓玩家開始刷數字。
 *
 * 這一層不認識 React 也不認識 three.js。
 */
import { SEG, type Workpiece } from '../workpiece/workpiece';

export interface TargetProfile {
  name: string;
  /** 目標全長（公尺） */
  length: number;
  /** 半徑容差（公尺） */
  radiusTol: number;
  /** 長度容差（公尺） */
  lengthTol: number;
  /**
   * 從起點算起 s 公尺處的目標半徑。
   * 超過目標全長的部分回傳 0，代表「這裡本來就不該有料」。
   */
  radiusAt(s: number): number;
}

/**
 * 釘胚：第 1 刀的目標（2026-11-07 定案）。
 *
 * 刻意只用延展就做得出來，不需要鐓粗也不需要彎曲。
 * 從 420 mm 的方料拉到 580 mm，等於體積要往長度跑三成多，
 * 玩家非得打很多火次不可 —— 這正是這一刀要驗的東西。
 */
export const NAIL_BLANK: TargetProfile = {
  name: '釘胚',
  length: 0.58,
  radiusTol: 0.0018,
  lengthTol: 0.025,
  radiusAt(s: number): number {
    const u = s / this.length;
    if (u < 0 || u > 1) return 0;
    // 0.00–0.22：維持原料粗細，這一段之後會變成釘頭
    if (u < 0.22) return 0.013;
    // 0.22–0.72：收到釘身
    if (u < 0.72) return lerp(0.013, 0.0055, (u - 0.22) / 0.5);
    // 0.72–1.00：收尖
    return lerp(0.0055, 0.0014, (u - 0.72) / 0.28);
  },
};

export interface ProfileFit {
  /** 逐段落在容差內的比例 0..1 */
  within: number;
  /** 平均絕對半徑誤差（公尺） */
  meanErr: number;
  /** 最大絕對半徑誤差（公尺） */
  maxErr: number;
  /** 長度差（公尺），正的代表太長 */
  lengthErr: number;
  /** 每段誤差（公尺），正的代表太粗。畫面疊圖用 */
  perSeg: Float32Array;
  /** 長度與每一段都在容差內 */
  done: boolean;
}

const buf = new Float32Array(SEG);

/**
 * 比對工件與目標。
 *
 * 比的是**絕對位置**不是比例位置：料還短的時候，尾端那幾段會被當成
 * 「該有料卻沒有」而計入誤差。所以玩家必須先拉長再修形，
 * 不能把一根短胖的東西按比例縮放當成做好了。
 */
export function fitProfile(wp: Workpiece, target: TargetProfile): ProfileFit {
  const z0 = wp.spineZ[0];
  const len = wp.length;
  let sum = 0;
  let max = 0;
  let inTol = 0;

  for (let i = 0; i < SEG; i++) {
    const s = wp.spineZ[i] - z0;
    const want = target.radiusAt(s);
    const got = wp.meanRadius(i);
    // 目標外面還有料：整根都算超出
    const err = want === 0 ? got : got - want;
    buf[i] = err;
    const a = Math.abs(err);
    sum += a;
    if (a > max) max = a;
    if (a <= target.radiusTol) inTol++;
  }

  const lengthErr = len - target.length;
  return {
    within: inTol / SEG,
    meanErr: sum / SEG,
    maxErr: max,
    lengthErr,
    perSeg: buf,
    done: inTol === SEG && Math.abs(lengthErr) <= target.lengthTol,
  };
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, k));
}
