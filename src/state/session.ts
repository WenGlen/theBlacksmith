/**
 * 這一局的可變狀態。
 *
 * 刻意是一個普通物件，不是 React state：遊戲迴圈每幀直接改它，
 * 不觸發任何重繪。要給人看的摘要由 StrikeRig 節流推進 useHud。
 */
import { SwingMachine } from '../game/input/swing';
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
  /** 目前鎖定的落點，沒按下時是 null */
  aim: Aim | null;
  /** 遮光中（按住 Tab） */
  dim: boolean;
  /** 收手次數 */
  recalls: number;
  /** 節奏：最近幾錘的間隔 */
  intervals: number[];
  /** 繞軸旋轉的吸附目標，null 代表自由角度 */
  rollTarget: number | null;
}

/** 整個測試台只有一局，開一個就好 */
export function createSession(): Session {
  return {
    wp: new Workpiece(),
    swing: new SwingMachine(),
    scatter: new ScatterLog(),
    aim: null,
    dim: false,
    recalls: 0,
    intervals: [],
    rollTarget: null,
  };
}
