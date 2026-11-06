/**
 * 工件模型自檢。
 *
 * 跑法：`npm run check:model`
 *
 * 這支不是單元測試，是三條「壞了會很難從畫面上看出來」的性質檢查：
 *
 *   1. 體積守恆。脊線＋斷面這個模型之所以勝過自由頂點位移，理由就是這一條
 *      （見 07 第四節）。壞掉的話料會越打越少，但畫面上只會覺得「好像變瘦了」。
 *   2. 延展方向。傾角往哪邊，料就該往哪一端跑。
 *   3. 網格繞序。翻面的三角形在暗房裡幾乎看不出來，只會覺得「打光怪怪的」。
 */
import { SEG, Workpiece } from '../src/game/workpiece/workpiece';
import { RADIAL } from '../src/game/workpiece/workpiece';
import {
  VERT_COUNT,
  buildIndices,
  volume,
  writePositions,
} from '../src/game/workpiece/geometry';

let failed = 0;
const check = (ok: boolean, label: string, detail: string) => {
  console.log(`${ok ? '  通過' : '  失敗'}  ${label}  ${detail}`);
  if (!ok) failed++;
};

/* 1. 體積守恆 */
const wp = new Workpiece();
const v0 = volume(wp);
for (let i = 0; i < 40; i++) {
  wp.temp.fill(0.9);
  wp.strike({ seg: 24, angle: Math.PI / 2, force: 0.8, tiltAxial: 0, tiltCirc: 0 });
}
const v1 = volume(wp);
const drift = ((v1 - v0) / v0) * 100;
const ext = wp.sectionExtent(24);
console.log('\n體積守恆（40 記滿力重錘打同一段）');
console.log(
  `  ${(v0 * 1e6).toFixed(2)} → ${(v1 * 1e6).toFixed(2)} cm³   ` +
    `長 ${(wp.length * 1000).toFixed(1)} mm   ` +
    `斷面 ${(ext.w * 1000).toFixed(1)}×${(ext.h * 1000).toFixed(1)} mm`,
);
check(Math.abs(drift) < 4, '誤差在 4% 以內', `${drift.toFixed(2)}%`);
check(ext.w > ext.h * 2, '打了四十錘該變扁', `寬高比 ${(ext.w / ext.h).toFixed(2)}`);
check(wp.length > 0.45, '該被延展變長', `${(wp.length * 1000).toFixed(1)} mm`);

/* 2. 延展方向 */
const fwd = new Workpiece();
const z0 = fwd.spineZ[0];
for (let i = 0; i < 30; i++) {
  fwd.temp.fill(0.9);
  fwd.strike({ seg: 24, angle: Math.PI / 2, force: 0.8, tiltAxial: 1, tiltCirc: 0 });
}
console.log('\n延展方向（傾角全往 +z）');
console.log(
  `  起點 ${(fwd.spineZ[0] * 1000).toFixed(1)} mm   ` +
    `終點 ${(fwd.spineZ[SEG - 1] * 1000).toFixed(1)} mm`,
);
check(
  Math.abs(fwd.spineZ[0] - z0) < 1e-6 && fwd.spineZ[SEG - 1] > 0.24,
  '起點不動、料往 +z 跑',
  '',
);

/* 3. 網格繞序 */
const fresh = new Workpiece();
const pos = new Float32Array(VERT_COUNT * 3);
writePositions(fresh, pos);
const idx = buildIndices();
const mid = (fresh.spineZ[0] + fresh.spineZ[SEG - 1]) / 2;
let outward = 0;
let inward = 0;
for (let t = 0; t < idx.length; t += 3) {
  const [ia, ib, ic] = [idx[t], idx[t + 1], idx[t + 2]];
  const A = [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]];
  const B = [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]];
  const C = [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]];
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
  // 封口的法線該朝 ±z，側面的該朝徑向
  const isCap = ia >= SEG * RADIAL;
  const ref = isCap ? [0, 0, cen[2] - mid] : [cen[0], cen[1], 0];
  if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] > 0) outward++;
  else inward++;
}
console.log('\n網格繞序');
console.log(`  朝外 ${outward}   朝內 ${inward}`);
check(inward === 0, '沒有翻面的三角形', '');

console.log(failed ? `\n${failed} 項沒過\n` : '\n全部通過\n');
process.exit(failed ? 1 : 0);
