/**
 * 工件模型：脊線 + 斷面堆疊。
 *
 * 為什麼是這個模型而不是體素或自由頂點位移，寫在
 * `07_3D 化設計與技術選型.md` 第四節。一句話的理由：
 * `03_工序組合與品項進程.md` 第一節已經要求「厚度分布要做成沿長度的一條陣列」，
 * 那就是這個模型，只是當時沒這樣命名。
 *
 * 這一層不認識 three.js。網格生成在 `geometry.ts`，一樣不認識 three.js。
 */
import { COLD_THRESHOLD, plasticity } from '../thermal/heat';

/** 沿脊線切幾段 */
export const SEG = 48;
/** 每段斷面取樣幾個角度 */
export const RADIAL = 16;
/** 每個角度取樣之間的弧度 */
export const DTHETA = (Math.PI * 2) / RADIAL;

/** 起始料長（公尺） */
export const BAR_LENGTH = 0.42;
/** 起始方料的半邊長（公尺）。26 mm 方料 */
export const BAR_HALF = 0.013;

/** 滿力一錘最多壓多深 */
const MAX_DEPTH = 0.0019;
/** 一錘沿軸擴散的範圍（段） */
const SEG_SPREAD = 5;
/** 沿軸擴散的高斯寬度 */
const SEG_SIGMA = 2.4;
/** 角度方向的集中度，越大越集中 */
const ANG_POWER = 2.5;
/** 損失的斷面積有多少比例變成長度，其餘往兩側展寬 */
const ELONG_RATIO = 0.55;
/** 半徑下限，防止打穿 */
const MIN_RADIUS = 0.0016;
/** 每一錘帶走多少熱 */
const HEAT_PER_HIT = 0.035;

/** 一錘的輸入 */
export interface StrikeInput {
  /** 打在第幾段 */
  seg: number;
  /** 打在斷面的哪個角度（弧度，工件自身座標系） */
  angle: number;
  /** 力道 0..1 */
  force: number;
  /** 傾角沿工件長軸的分量 -1..1，決定金屬往哪一端流 */
  tiltAxial: number;
  /** 傾角繞工件圓周的分量 -1..1，決定錘面往哪邊滑 */
  tiltCirc: number;
}

/** 一錘的結果，給 HUD 與回饋用 */
export interface StrikeResult {
  /** 這一錘壓掉多少斷面積（平方公尺） */
  deficit: number;
  /** 料變長了多少（公尺） */
  elongation: number;
  /** 打的時候是不是已經冷到會裂 */
  cold: boolean;
  /** 傾角太大，錘面打滑 */
  slipped: boolean;
  /** 實際壓下去的深度 */
  depth: number;
}

/**
 * 一根正在被打的料。
 */
export class Workpiece {
  /** 每段沿軸的位置（公尺），單調遞增 */
  readonly spineZ = new Float32Array(SEG);
  /** 每段每個角度的半徑，索引 seg * RADIAL + k */
  readonly radii = new Float32Array(SEG * RADIAL);
  /** 每段的溫度 0..1 */
  readonly temp = new Float32Array(SEG);

  /** 繞長軸的旋轉（弧度）。Q／E 控制，連續 */
  roll = 0;
  /** 沿長軸的送料位移（公尺）。A／D 控制，連續 */
  feed = 0;

  /** 幾何改過就加一，網格靠這個判斷要不要重算 */
  version = 0;
  /** 火次 */
  heats = 1;
  /** 打了幾錘 */
  hits = 0;
  /** 冷作裂紋數 */
  cracks = 0;

  /** 每一錘重用的緩衝：每段延展出來的長度 */
  private readonly dLBuf = new Float32Array(SEG);
  /** 每一錘重用的緩衝：第 i 段與第 i+1 段之間要撐開多少 */
  private readonly gapBuf = new Float32Array(SEG);

  constructor() {
    this.reset();
  }

  /** 回到一根全新的方料 */
  reset(): void {
    const step = BAR_LENGTH / (SEG - 1);
    for (let i = 0; i < SEG; i++) {
      this.spineZ[i] = -BAR_LENGTH / 2 + i * step;
      this.temp[i] = 0.92;
      for (let k = 0; k < RADIAL; k++) {
        this.radii[i * RADIAL + k] = squareRadius(k * DTHETA, BAR_HALF);
      }
    }
    this.roll = 0;
    this.feed = 0;
    this.heats = 1;
    this.hits = 0;
    this.cracks = 0;
    this.version++;
  }

  /** 回爐。測試台捷徑，正式版這裡是爐火工位的「持」 */
  reheat(): void {
    for (let i = 0; i < SEG; i++) this.temp[i] = 0.93;
    this.heats++;
  }

  /** 料目前多長 */
  get length(): number {
    return this.spineZ[SEG - 1] - this.spineZ[0];
  }

  /** 平均溫度，給 HUD 用 */
  get meanTemp(): number {
    let s = 0;
    for (let i = 0; i < SEG; i++) s += this.temp[i];
    return s / SEG;
  }

  /** 自然降溫。細的地方掉得快，這是真的 */
  cool(dtSec: number): void {
    for (let i = 0; i < SEG; i++) {
      const thin = 1 + (BAR_HALF - this.meanRadius(i)) * 40;
      this.temp[i] = Math.max(
        0,
        this.temp[i] - dtSec * 0.018 * (0.3 + 0.7 * this.temp[i]) * Math.max(0.6, thin),
      );
    }
  }

  /** 某一段的平均半徑 */
  meanRadius(seg: number): number {
    let s = 0;
    for (let k = 0; k < RADIAL; k++) s += this.radii[seg * RADIAL + k];
    return s / RADIAL;
  }

  /** 某一段在某個角度的半徑，角度之間線性內插 */
  radiusAt(seg: number, angle: number): number {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const f = a / DTHETA;
    const k0 = Math.floor(f) % RADIAL;
    const k1 = (k0 + 1) % RADIAL;
    const t = f - Math.floor(f);
    const base = seg * RADIAL;
    return this.radii[base + k0] * (1 - t) + this.radii[base + k1] * t;
  }

  /** 沿軸座標換成段索引 */
  segmentAt(z: number): number {
    if (z <= this.spineZ[0]) return 0;
    if (z >= this.spineZ[SEG - 1]) return SEG - 1;
    let lo = 0;
    let hi = SEG - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.spineZ[mid] <= z) lo = mid;
      else hi = mid;
    }
    const a = this.spineZ[lo];
    const b = this.spineZ[hi];
    return b - a > 0 && z - a > (b - a) / 2 ? hi : lo;
  }

  /** 某一段的斷面積 */
  sectionArea(seg: number): number {
    const base = seg * RADIAL;
    let a = 0;
    const s = Math.sin(DTHETA);
    for (let k = 0; k < RADIAL; k++) {
      a += this.radii[base + k] * this.radii[base + ((k + 1) % RADIAL)] * s;
    }
    return a * 0.5;
  }

  /**
   * 某一段的方扁判定。回傳工件自身座標系下的寬與高。
   * 這是 02 第 4.2 節「畫面角落有斷面示意，顯示這一段是方是扁」要的數字。
   */
  sectionExtent(seg: number): { w: number; h: number } {
    const base = seg * RADIAL;
    let w = 0;
    let h = 0;
    for (let k = 0; k < RADIAL; k++) {
      const th = k * DTHETA;
      const r = this.radii[base + k];
      w = Math.max(w, Math.abs(r * Math.cos(th)));
      h = Math.max(h, Math.abs(r * Math.sin(th)));
    }
    return { w: w * 2, h: h * 2 };
  }

  /**
   * 料擱在砧面上時，中心離砧面多高。
   * 轉動工件時這個值會變，打扁了會變小，料就看得到沉下去。
   * @param roll 目前的繞軸旋轉
   */
  restHeight(roll: number): number {
    // 世界座標的正下方，換算回工件自身座標的角度
    const down = -Math.PI / 2 - roll;
    let m = 0;
    for (let i = 0; i < SEG; i++) m = Math.max(m, this.radiusAt(i, down));
    return m;
  }

  /**
   * 打一錘。
   *
   * 壓下去的斷面積不會消失：一部分往兩側展寬，一部分變成長度。
   * 這就是為什麼選脊線加斷面而不是自由頂點位移 —— 體積守恆是免費的。
   */
  strike(input: StrikeInput): StrikeResult {
    const { seg, angle, force, tiltAxial, tiltCirc } = input;
    const t = this.temp[seg];
    const depth = force * MAX_DEPTH * plasticity(t);
    // 錘面往哪邊滑，壓痕中心就偏向那邊
    const hitAngle = angle + tiltCirc * 0.35;

    let totalDeficit = 0;
    let totalElong = 0;

    const lo = Math.max(0, seg - SEG_SPREAD);
    const hi = Math.min(SEG - 1, seg + SEG_SPREAD);
    const segLen = this.length / (SEG - 1);
    this.dLBuf.fill(0);

    for (let j = lo; j <= hi; j++) {
      const wj = Math.exp(-((j - seg) ** 2) / (2 * SEG_SIGMA ** 2));
      if (wj < 0.02) continue;
      const base = j * RADIAL;
      const before = this.sectionArea(j);

      // 壓：錘子從上面壓，鐵砧從下面頂，兩面一起被打平
      for (let k = 0; k < RADIAL; k++) {
        const th = k * DTHETA;
        const top = Math.max(0, Math.cos(th - hitAngle)) ** ANG_POWER;
        const bottom = Math.max(0, Math.cos(th - hitAngle - Math.PI)) ** ANG_POWER;
        const d = depth * wj * (top + bottom);
        this.radii[base + k] = Math.max(MIN_RADIUS, this.radii[base + k] - d);
      }

      const afterCompress = this.sectionArea(j);
      const deficit = Math.max(0, before - afterCompress);
      totalDeficit += deficit;

      if (deficit > 1e-12) {
        // 展寬：壓掉的料有 (1 - ELONG_RATIO) 往垂直於錘面的方向擠出去。
        // dA/dr 只是線性近似，所以疊代幾次收到目標面積，體積才真的守恆。
        const targetArea = before - deficit * ELONG_RATIO;
        const wPerp = new Float32Array(RADIAL);
        for (let k = 0; k < RADIAL; k++) {
          wPerp[k] = Math.abs(Math.sin(k * DTHETA - hitAngle)) ** ANG_POWER;
        }
        for (let it = 0; it < 4; it++) {
          const need = targetArea - this.sectionArea(j);
          if (need <= 1e-13) break;
          let denom = 0;
          for (let k = 0; k < RADIAL; k++) denom += this.radii[base + k] * wPerp[k] * DTHETA;
          if (denom < 1e-10) break;
          const g = need / denom;
          for (let k = 0; k < RADIAL; k++) this.radii[base + k] += g * wPerp[k];
        }

        // 延展：這一段少掉的斷面積，照體積守恆換算成這一段自己要變長多少
        const areaNow = this.sectionArea(j);
        if (areaNow > 1e-9) this.dLBuf[j] = (segLen * (before - areaNow)) / areaNow;
      }

      this.temp[j] = Math.max(0, this.temp[j] - HEAT_PER_HIT * wj * (0.4 + force));
    }

    // 把延展量灌進脊線。
    // 關鍵是「就地撐開」：長度要加在被打到的那幾段自己的間距上，
    // 整根一起平移的話，料會在斷面小的地方被憑空吃掉，體積就不守恆了。
    this.gapBuf.fill(0);
    for (let j = lo; j <= hi; j++) {
      const d = this.dLBuf[j];
      if (d <= 0) continue;
      totalElong += d;
      if (j > 0 && j < SEG - 1) {
        this.gapBuf[j - 1] += d / 2;
        this.gapBuf[j] += d / 2;
      } else if (j === 0) {
        this.gapBuf[0] += d;
      } else {
        this.gapBuf[SEG - 2] += d;
      }
    }
    if (totalElong > 1e-9) {
      // 傾角決定料往哪一端跑：全往 +z 就是起點不動、終點被推出去
      const fwd = 0.5 + 0.5 * Math.max(-1, Math.min(1, tiltAxial));
      let cum = 0;
      const shift = this.dLBuf;
      shift[0] = 0;
      for (let i = 1; i < SEG; i++) {
        cum += this.gapBuf[i - 1];
        shift[i] = cum;
      }
      const back = cum * (1 - fwd);
      for (let i = 0; i < SEG; i++) this.spineZ[i] += shift[i] - back;
    }

    this.hits++;
    this.version++;

    const cold = t < COLD_THRESHOLD && force > 0.22;
    if (cold) this.cracks++;

    return {
      deficit: totalDeficit,
      elongation: totalElong,
      cold,
      slipped: Math.abs(input.tiltCirc) > 0.8 || Math.abs(tiltAxial) > 0.85,
      depth,
    };
  }
}

/**
 * 方形斷面在某個角度的半徑。
 * @param theta 角度（弧度）
 * @param half 方料的半邊長
 */
function squareRadius(theta: number, half: number): number {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  return half / Math.max(c, s, 1e-6);
}
