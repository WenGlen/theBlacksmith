/**
 * 溫度與顏色。
 *
 * 照 `02_操作轉化設計.md` 原則 3：溫度只給顏色，不給數字。
 * 這個檔案是那條原則唯一的實作點，整個遊戲不准有第二個地方把溫度換成讀數。
 */

/** 色溫梯度，從暗紅到白熱。位置 0..1。 */
const RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [0.18, 0.02, 0.01]],
  [0.18, [0.33, 0.04, 0.012]],
  [0.36, [0.55, 0.08, 0.02]],
  [0.5, [0.78, 0.15, 0.03]],
  [0.65, [0.95, 0.27, 0.05]],
  [0.78, [1.0, 0.45, 0.1]],
  [0.88, [1.0, 0.68, 0.22]],
  [1.0, [1.0, 0.92, 0.7]],
];

/** 低於這個溫度再打就是冷作，會留下永久裂紋。 */
export const COLD_THRESHOLD = 0.28;

/** 低於這個溫度已經不太打得動了。 */
export const PLASTIC_FLOOR = 0.15;

/**
 * 超過這個溫度就開始燒損。
 *
 * 真實鍛造裡過熱不會當場爆掉，是晶粒長大、邊角熔蝕，
 * 要等淬火或受力時才從那裡裂開（[[02_操作轉化設計]] 4.1）。
 * 所以這裡只累積標記，不做任何立即的失敗判定。
 */
export const SCORCH_THRESHOLD = 0.95;

/** 每秒在超溫區累積多少燒損（滿溫時） */
export const SCORCH_RATE = 0.42;

/**
 * 燒損讓這一段變脆：回傳冷作裂紋門檻要放寬多少。
 *
 * 燒損滿的那一段，等於把它的「可以安全打」的溫度整個往上推，
 * 玩家會發現同樣的顏色打下去卻裂了 —— 這正是過熱該有的懲罰：
 * 看起來沒事，出事在後面。
 */
export function scorchPenalty(scorch: number): number {
  return Math.max(0, Math.min(1, scorch)) * 0.26;
}

/**
 * 把 0..1 的溫度換成線性 RGB。
 * @param t 溫度，0 是冷鐵，1 是白熱
 */
export function heatColor(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [p1, c1] = RAMP[i - 1];
    const [p2, c2] = RAMP[i];
    if (v <= p2) {
      const k = (v - p1) / (p2 - p1 || 1);
      return [
        c1[0] + (c2[0] - c1[0]) * k,
        c1[1] + (c2[1] - c1[1]) * k,
        c1[2] + (c2[2] - c1[2]) * k,
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/**
 * 鐵匠嘴裡的色溫名稱。這是 HUD 唯一准顯示的溫度資訊，
 * 而且刻意用模糊的詞，不給區間數字。
 */
export function scorchLabel(scorch: number): string {
  if (scorch < 0.08) return '';
  if (scorch < 0.3) return '微燒損';
  if (scorch < 0.65) return '燒損';
  return '嚴重燒損';
}

export function heatLabel(t: number): string {
  if (t < 0.12) return '黑';
  if (t < COLD_THRESHOLD) return '暗紅';
  if (t < 0.42) return '暗櫻桃紅';
  if (t < 0.56) return '櫻桃紅';
  if (t < 0.7) return '亮櫻桃紅';
  if (t < 0.82) return '橙';
  if (t < 0.92) return '黃';
  return '白熱';
}

/**
 * 可塑性：冷鐵打不動，熱鐵一錘就凹。
 * @param t 溫度
 */
export function plasticity(t: number): number {
  return Math.max(0.05, Math.min(1, (t - PLASTIC_FLOOR) / 0.6));
}
