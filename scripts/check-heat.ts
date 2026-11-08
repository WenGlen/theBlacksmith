/**
 * 第 1 刀的熱模型自檢。
 *
 * 這裡量的是 `08_第1刀 加熱與火次循環.md` 第五節的驗收，
 * 能用純模型跑出來的那幾條。局部加熱與走動代價牽涉到場景幾何，
 * 在瀏覽器裡驗。
 */
import * as THREE from 'three';
import { COLD_THRESHOLD, SCORCH_THRESHOLD } from '../src/game/thermal/heat';
import { fireDepthAt, forgePose } from '../src/scene/stations';
import { Forge } from '../src/game/forge/forge';
import { SEG, Workpiece } from '../src/game/workpiece/workpiece';

const DT = 1 / 60;
let failed = 0;

function check(name: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? '通過' : '沒過'}  ${name}  ${detail}`);
  if (!ok) failed++;
}

/** 一火能打幾錘：盯著被打的那一段，打到低於冷作門檻為止 */
function blowsPerHeat(cadenceSec: number): number {
  const wp = new Workpiece();
  wp.reheat();
  const seg = 24;
  let blows = 0;
  for (let step = 0; step < 60 * 120; step++) {
    wp.cool(DT);
    if (step % Math.round(cadenceSec / DT) === 0) {
      if (wp.temp[seg] < COLD_THRESHOLD) break;
      wp.strike({ seg, angle: Math.PI / 2, force: 1, tiltAxial: 0, tiltCirc: 0 });
      blows++;
    }
  }
  return blows;
}

/** 整根在不打的情況下，從鍛造溫度掉到冷作門檻要幾秒 */
function idleSeconds(): number {
  const wp = new Workpiece();
  wp.reheat();
  let t = 0;
  while (wp.temp[24] >= COLD_THRESHOLD && t < 300) {
    wp.cool(DT);
    t += DT;
  }
  return t;
}

/** 拉薄之後，尾段與中段掉到門檻的時間差 */
function thinVsThick(): { thin: number; thick: number } {
  const wp = new Workpiece();
  // 把尾段打薄
  for (let n = 0; n < 60; n++) {
    wp.reheat();
    wp.strike({ seg: 44, angle: Math.PI / 2, force: 1, tiltAxial: 0, tiltCirc: 0 });
  }
  wp.reheat();
  let thin = -1;
  let thick = -1;
  let t = 0;
  while ((thin < 0 || thick < 0) && t < 300) {
    wp.cool(DT);
    t += DT;
    if (thin < 0 && wp.temp[44] < COLD_THRESHOLD) thin = t;
    if (thick < 0 && wp.temp[12] < COLD_THRESHOLD) thick = t;
  }
  return { thin, thick };
}

/** 爐子：從全冷加熱到鍛造溫度要幾秒 */
function forgeSeconds(air: boolean, depth: number): number {
  const wp = new Workpiece();
  for (let i = 0; i < SEG; i++) wp.temp[i] = 0.05;
  const forge = new Forge();
  forge.setPumping(air);
  let t = 0;
  while (wp.temp[24] < 0.78 && t < 300) {
    forge.update(DT);
    wp.cool(DT);
    wp.heatSegment(24, forge.gainAt(depth, wp.temp[24], DT), DT);
    t += DT;
  }
  return t;
}

/** 滿風壓在火心，幾秒開始燒損 */
function scorchSeconds(): number {
  const wp = new Workpiece();
  wp.reheat();
  const forge = new Forge();
  forge.setPumping(true);
  let t = 0;
  while (wp.scorch[24] < 0.2 && t < 300) {
    forge.update(DT);
    wp.cool(DT);
    wp.heatSegment(24, forge.gainAt(1, wp.temp[24], DT), DT);
    t += DT;
  }
  return t;
}

/**
 * 局部加熱（08 第五節驗收 1）。
 *
 * 用真的爐前姿態算每一段離火心多近，所以這條驗的是場景幾何，
 * 不只是模型。回傳推進去那一端與另一端各自的溫度。
 */
function localHeating(insert: number, seconds: number): { tip: number; tail: number; mid: number } {
  const wp = new Workpiece();
  for (let i = 0; i < SEG; i++) wp.temp[i] = 0.12;
  const forge = new Forge();
  forge.setPumping(true);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  for (let t = 0; t < seconds; t += DT) {
    forge.update(DT);
    wp.cool(DT);
    forgePose(wp, insert, 0, pos, quat);
    for (let i = 0; i < SEG; i++) {
      const d = fireDepthAt(wp, i, pos, quat);
      if (d > 0) wp.heatSegment(i, forge.gainAt(d, wp.temp[i], DT), DT);
    }
  }
  return { tip: wp.temp[SEG - 1], tail: wp.temp[0], mid: wp.temp[24] };
}

console.log('\n局部加熱（08 第五節驗收 1）');
const shallowHeat = localHeating(0, 10);
console.log(`  insert 0（燒最前端）、10 秒：推進端 ${shallowHeat.tip.toFixed(2)}、中段 ${shallowHeat.mid.toFixed(2)}、手邊端 ${shallowHeat.tail.toFixed(2)}`);
check('只有推進去的那一端熱起來', shallowHeat.tip > 0.7 && shallowHeat.tail < 0.2,
  `兩端差 ${(shallowHeat.tip - shallowHeat.tail).toFixed(2)}`);

// 整根都要能被燒到，包含手邊那一端。
// 行程寫死的時候尾巴永遠進不了火（Glen 2026-11-07 回報），這條就是在守它。
const sweep = [
  { name: '最前端', insert: 0, pick: (r: { tip: number }) => r.tip },
  { name: '中段', insert: 0.5, pick: (r: { mid: number }) => r.mid },
  { name: '手邊端', insert: 1, pick: (r: { tail: number }) => r.tail },
];
let allReach = true;
for (const part of sweep) {
  const r = localHeating(part.insert, 12);
  const t = part.pick(r as never);
  console.log(`  insert ${part.insert}：${part.name} 到 ${t.toFixed(2)}`);
  if (t < 0.75) allReach = false;
}
check('整根每一段都燒得到鍛造溫度', allReach, '包含手邊那一端');

// 2026-11-08 把區間從 8～15 拉到 16～32：Glen 實測一火能打的錘數偏少，
// 要求至少兩倍（08 第十二節）。倍率在 workpiece.ts 的 HEAT_HOLD。
console.log('\n一火能打幾錘（08 第五節驗收 2：要落在 16～32）');
const fast = blowsPerHeat(0.3);
const slow = blowsPerHeat(0.7);
console.log(`  連打節奏 0.3 s：${fast} 錘`);
console.log(`  單擊節奏 0.7 s：${slow} 錘`);
check('一火的錘數在合理區間', slow >= 16 && fast <= 32, `${slow}～${fast}`);

console.log('\n放著不打能撐多久');
const idle = idleSeconds();
check('一火的總時間有壓力但不急躁', idle > 40 && idle < 90, `${idle.toFixed(1)} 秒`);

console.log('\n薄處先冷（08 第五節驗收 3）');
const tv = thinVsThick();
check('尾段明顯比中段早冷', tv.thin < tv.thick * 0.8,
  `尾段 ${tv.thin.toFixed(1)} s、中段 ${tv.thick.toFixed(1)} s`);

console.log('\n爐火');
const withAir = forgeSeconds(true, 1);
const noAir = forgeSeconds(false, 1);
const shallow = forgeSeconds(true, 0.45);
console.log(`  送風＋火心：${withAir.toFixed(1)} s`);
console.log(`  不送風＋火心：${noAir > 299 ? '到不了鍛造溫度' : noAir.toFixed(1) + ' s'}`);
console.log(`  送風＋半深：${shallow > 299 ? '到不了鍛造溫度' : shallow.toFixed(1) + ' s'}`);
check('送風時加熱比一火的工作時間短', withAir < idle * 0.8, `${withAir.toFixed(1)} s vs ${idle.toFixed(1)} s`);
check('不送風就到不了鍛造溫度', noAir > 299, '風量是真的有意義的');

console.log('\n過熱');
const sc = scorchSeconds();
check('滿風壓火心一陣子才燒損', sc > 2 && sc < 25, `${sc.toFixed(1)} 秒出現明顯燒損`);
console.log(`  （燒損門檻 ${SCORCH_THRESHOLD}）`);

console.log(failed === 0 ? '\n全部通過\n' : `\n${failed} 條沒過\n`);
process.exit(failed === 0 ? 0 : 1);
