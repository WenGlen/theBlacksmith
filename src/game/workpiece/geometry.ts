/**
 * 把脊線 + 斷面堆疊長成一個三角網格。
 *
 * 純數學，不認識 three.js：吃一個 Workpiece，把頂點寫進傳進來的 Float32Array。
 * 呼叫端自己決定要把它塞進哪種 BufferGeometry。
 *
 * 拓樸是一條管子：SEG 圈 × RADIAL 個頂點，兩端各補一個中心點封口。
 */
import { RADIAL, SEG, DTHETA, type Workpiece } from './workpiece';
import { heatColor } from '../thermal/heat';

/** 頂點總數：管身 + 兩個封口中心 */
export const VERT_COUNT = SEG * RADIAL + 2;
/** 起始端封口中心的頂點索引 */
const CAP_START = SEG * RADIAL;
/** 結束端封口中心的頂點索引 */
const CAP_END = SEG * RADIAL + 1;

/**
 * 建索引。只跟拓樸有關，算一次就好。
 *
 * 繞序是從外面看逆時針，這樣 computeVertexNormals 算出來的法線才朝外。
 */
export function buildIndices(): Uint16Array {
  const sideTris = (SEG - 1) * RADIAL * 2;
  const capTris = RADIAL * 2;
  const out = new Uint16Array((sideTris + capTris) * 3);
  let p = 0;

  for (let i = 0; i < SEG - 1; i++) {
    for (let k = 0; k < RADIAL; k++) {
      const k1 = (k + 1) % RADIAL;
      const a = i * RADIAL + k;
      const b = i * RADIAL + k1;
      const c = (i + 1) * RADIAL + k;
      const d = (i + 1) * RADIAL + k1;
      out[p++] = a; out[p++] = b; out[p++] = c;
      out[p++] = b; out[p++] = d; out[p++] = c;
    }
  }

  for (let k = 0; k < RADIAL; k++) {
    const k1 = (k + 1) % RADIAL;
    // 起始端朝 -z
    out[p++] = CAP_START; out[p++] = k1; out[p++] = k;
    // 結束端朝 +z
    const base = (SEG - 1) * RADIAL;
    out[p++] = CAP_END; out[p++] = base + k; out[p++] = base + k1;
  }

  return out;
}

/**
 * 寫頂點位置。工件自身座標系，長軸是 z。
 * 繞軸旋轉與送料是物件的 transform，不烤進頂點。
 */
export function writePositions(wp: Workpiece, out: Float32Array): void {
  for (let i = 0; i < SEG; i++) {
    const z = wp.spineZ[i];
    const base = i * RADIAL;
    for (let k = 0; k < RADIAL; k++) {
      const th = k * DTHETA;
      const r = wp.radii[base + k];
      const o = (base + k) * 3;
      out[o] = Math.cos(th) * r;
      out[o + 1] = Math.sin(th) * r;
      out[o + 2] = z;
    }
  }
  out[CAP_START * 3] = 0;
  out[CAP_START * 3 + 1] = 0;
  out[CAP_START * 3 + 2] = wp.spineZ[0];
  out[CAP_END * 3] = 0;
  out[CAP_END * 3 + 1] = 0;
  out[CAP_END * 3 + 2] = wp.spineZ[SEG - 1];
}

/**
 * 寫頂點顏色。顏色同時當自發光的強度來源，
 * 著色器那邊會拿它的亮度做 pow 當 emissive，所以冷鐵不會發光。
 */
export function writeHeatColors(wp: Workpiece, out: Float32Array): void {
  for (let i = 0; i < SEG; i++) {
    const [r, g, b] = heatColor(wp.temp[i]);
    const base = i * RADIAL;
    for (let k = 0; k < RADIAL; k++) {
      const o = (base + k) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  const [r0, g0, b0] = heatColor(wp.temp[0]);
  out[CAP_START * 3] = r0; out[CAP_START * 3 + 1] = g0; out[CAP_START * 3 + 2] = b0;
  const [r1, g1, b1] = heatColor(wp.temp[SEG - 1]);
  out[CAP_END * 3] = r1; out[CAP_END * 3 + 1] = g1; out[CAP_END * 3 + 2] = b1;
}

/**
 * 整根料的體積，用來驗體積守恆。
 */
export function volume(wp: Workpiece): number {
  let v = 0;
  for (let i = 0; i < SEG - 1; i++) {
    const dz = wp.spineZ[i + 1] - wp.spineZ[i];
    v += ((wp.sectionArea(i) + wp.sectionArea(i + 1)) / 2) * dz;
  }
  return v;
}
