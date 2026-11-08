/**
 * HUD 狀態。
 *
 * 鐵律（07 第六節）：每幀會變的東西不進 React state。
 * 遊戲迴圈改的是 game/ 那層的普通物件，只有要給人看的摘要才推到這裡，
 * 而且是節流推的。這個 store 一秒更新十幾次就夠了。
 */
import { create } from 'zustand';
import type { LandingMode, SwingState } from '../game/input/swing';
import { RADIAL } from '../game/workpiece/workpiece';
import type { Station } from '../scene/stations';

export interface FlashMsg {
  msg: string;
  kind: 'good' | 'warn' | 'bad' | 'flag';
  at: number;
}

export interface HudState {
  /* 每幀節流同步過來的 */
  swingState: SwingState;
  hint: string;
  heat: number;
  heatName: string;
  windup: number;
  overshoot: boolean;
  roll: number;
  feed: number;
  lengthMm: number;
  sectionW: number;
  sectionH: number;
  sectionPoly: number[];
  aimSeg: number;
  hits: number;
  cracks: number;
  heats: number;
  recalls: number;
  lastForce: number;
  lastTilt: number;
  rhythmMs: number;
  /* 第 1 刀：工位與爐火 */
  station: Station;
  travelling: boolean;
  air: number;
  core: number;
  insert: number;
  scorch: number;
  /** 目標輪廓逐段誤差（公尺），正的是太粗 */
  profileErr: number[];
  /** 逐段落在容差內的比例。HUD 不准把它印成百分比 */
  profileWithin: number;
  profileLenErr: number;
  profileDone: boolean;
  /* 事件推過來的 */
  flash: FlashMsg | null;
  scatterTick: number;
  /* 使用者設定 */
  mode: LandingMode;
  /** 技藝等級 0..1。判定寬度全部由它推出來（game/skill/skill.ts） */
  skillLevel: number;
  recallEnabled: boolean;
  usePeakWindow: boolean;
  dim: boolean;

  patch: (p: Partial<HudState>) => void;
  setFlash: (msg: string, kind: FlashMsg['kind']) => void;
  bumpScatter: () => void;
}

export const useHud = create<HudState>((set) => ({
  swingState: 'idle',
  hint: '按住左鍵把錘子舉起來。',
  heat: 0.92,
  heatName: '白熱',
  windup: 0,
  overshoot: false,
  roll: 0,
  feed: 0,
  lengthMm: 420,
  sectionW: 26,
  sectionH: 26,
  sectionPoly: new Array(RADIAL).fill(13),
  aimSeg: 24,
  hits: 0,
  cracks: 0,
  heats: 1,
  recalls: 0,
  lastForce: 0,
  lastTilt: 0,
  rhythmMs: 0,
  station: 'anvil',
  travelling: false,
  air: 0.35,
  core: 0.52,
  insert: 0,
  scorch: 0,
  profileErr: [],
  profileWithin: 0,
  profileLenErr: -0.16,
  profileDone: false,
  flash: null,
  scatterTick: 0,
  mode: 'release',
  skillLevel: 0,
  recallEnabled: true,
  usePeakWindow: true,
  dim: false,

  patch: (p) => set(p),
  setFlash: (msg, kind) => set({ flash: { msg, kind, at: performance.now() } }),
  bumpScatter: () => set((s) => ({ scatterTick: s.scatterTick + 1 })),
}));
