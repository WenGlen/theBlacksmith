/**
 * 兩個工位的幾何：工件該擺在哪、鏡頭該站在哪。
 *
 * 抽出來是因為砧前與爐前要用同一套工件姿態計算，
 * 塞在 StrikeRig 裡會讓那個檔案變成什麼都管。
 */
import * as THREE from 'three';
import { SEG, type Workpiece } from '../game/workpiece/workpiece';
import {
  ANVIL_TOP,
  COAL_TOP,
  FIRE_AXIS,
  FIRE_CENTER,
  FIRE_OUTER,
  INSERT_BASE,
  INSERT_SPAN,
  STATION_POS,
  STATION_YAW,
} from './layout';

export type Station = 'anvil' | 'forge';

const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3(...FIRE_AXIS).normalize();
const fire = new THREE.Vector3(...FIRE_CENTER);
const stationQuat = new THREE.Quaternion().setFromAxisAngle(UP, STATION_YAW);
const stationPos = new THREE.Vector3(...STATION_POS);

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

/**
 * 砧上的工件姿態。
 *
 * 工件原本掛在鐵砧那個 group 底下，用的是局部座標；
 * 為了讓爐前共用同一條路徑，改成這裡直接算出世界座標。
 */
export function anvilPose(wp: Workpiece, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
  outPos
    .set(0, ANVIL_TOP + wp.restHeight(wp.roll), wp.feed)
    .applyQuaternion(stationQuat)
    .add(stationPos);
  outQuat
    .copy(stationQuat)
    .multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), wp.roll));
}

/**
 * 爐裡的工件姿態。
 *
 * @param insert 0 是停在爐口，1 是整截推進火心
 */
export function forgePose(
  wp: Workpiece,
  insert: number,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion,
): void {
  const tipLocalZ = wp.spineZ[SEG - 1];
  const along = INSERT_BASE + INSERT_SPAN * Math.max(0, Math.min(1, insert));
  // 先決定末端要落在哪，再往回推出原點
  outPos.copy(fire).addScaledVector(axis, along);
  // 料是埋在炭裡的，不是架在上面。半陷進去才看得出「插進火心」
  outPos.y = COAL_TOP - 0.007 + wp.restHeight(wp.roll) * 0.35;
  outPos.addScaledVector(axis, -tipLocalZ);
  outQuat
    .setFromUnitVectors(Z, axis)
    .multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), wp.roll));
}

/**
 * 每一段離火心多近，0 是完全吃不到熱，1 是正在火心裡。
 *
 * 這是「局部加熱」唯一的來源：只有真的推進去的那幾段會升溫，
 * 另一端照樣在降溫。
 */
export function fireDepthAt(
  wp: Workpiece,
  seg: number,
  barPos: THREE.Vector3,
  barQuat: THREE.Quaternion,
): number {
  tmpV.set(0, 0, wp.spineZ[seg]).applyQuaternion(barQuat).add(barPos);
  const d = tmpV.distanceTo(fire);
  return Math.max(0, Math.min(1, 1 - d / FIRE_OUTER));
}
