/**
 * 這一局的可變狀態。
 *
 * 刻意是一個普通物件，不是 React state：遊戲迴圈每幀直接改它，
 * 不觸發任何重繪。要給人看的摘要由 StrikeRig 節流推進 useHud。
 */
import { Forge } from '../game/forge/forge';
import { SwingMachine } from '../game/input/swing';
import { NAIL_BLANK, type TargetProfile } from '../game/target/profile';
import type { Station } from '../scene/stations';
import { ScatterLog } from '../game/stats/scatter';
import { Workpiece } from '../game/workpiece/workpiece';

export interface Aim {
  /** 世界座標的落點 */
  x: number;
  y: number;
  z: number;
  /** 表面法線（世界座標） */
  nx: number;
  ny: number;
  nz: number;
  /** 打在第幾段 */
  seg: number;
  /** 工件自身座標系的角度 */
  angle: number;
}

export interface Session {
  wp: Workpiece;
  swing: SwingMachine;
  scatter: ScatterLog;
  /** 目前的落點預覽，沒按下時是 null。按住期間會停在最後一個有效位置 */
  aim: Aim | null;
  /** 游標現在指到棒子外面了：aim 還留著，但這時放開會打空 */
  aimOff: boolean;
  /** 遮光中（按住 Tab） */
  dim: boolean;
  /** 收手次數 */
  recalls: number;
  /** 節奏：最近幾錘的間隔 */
  intervals: number[];
  /** 繞軸旋轉的吸附目標，null 代表自由角度 */
  rollTarget: number | null;

  /* ───── 第 1 刀：加熱與火次循環 ───── */

  /** 爐火 */
  forge: Forge;
  /** 現在人在哪個工位 */
  station: Station;
  /** 還在走路：剩下幾秒。大於 0 的時候所有操作都鎖住 */
  travel: number;
  /** 從哪個工位出發的，走路期間鏡頭要在兩邊之間插值 */
  travelFrom: Station;
  /** 工件推進火裡多深 0..1。只有爐前有意義 */
  insert: number;
  /** 這一局要做什麼 */
  target: TargetProfile;
}

/** 整個測試台只有一局，開一個就好 */
export function createSession(): Session {
  return {
    wp: new Workpiece(),
    swing: new SwingMachine(),
    scatter: new ScatterLog(),
    aim: null,
    aimOff: false,
    dim: false,
    recalls: 0,
    intervals: [],
    rollTarget: null,
    forge: new Forge(),
    station: 'anvil',
    travel: 0,
    travelFrom: 'anvil',
    insert: 0.35,
    target: NAIL_BLANK,
  };
}
