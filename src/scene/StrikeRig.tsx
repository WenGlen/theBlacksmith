/**
 * 把揮錘狀態機接到 3D 世界上。
 *
 * 這個元件是第 0 刀真正要驗的那兩個接口（07 第七節）：
 *   1. 落點：2D 時是一組螢幕座標，這裡換成 raycast 命中的世界座標 + 表面法線 + 段索引
 *   2. 結算：傾角從一維的左右，變成投影到打擊點切平面上的向量
 *
 * 狀態機本身一行都沒改，它還是 `game/input/swing.ts` 裡那個吃螢幕像素的東西。
 *
 * 鏡頭規則（07 第三節）：左鍵按下到放開之間，鏡頭完全鎖死。
 * 要環視只能在動作之外，用右鍵拖。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TapHoldAxis } from '../game/input/tapHold';
import { heatColor, heatLabel } from '../game/thermal/heat';
import { fitProfile } from '../game/target/profile';
import { RADIAL, SEG } from '../game/workpiece/workpiece';
import { useHud } from '../state/hud';
import type { Session } from '../state/session';
import type { Station } from './stations';
import {
  ANVIL_TOP,
  EYE,
  FORGE_EYE,
  FORGE_LOOK,
  LOOK_AT,
  TRAVEL_SEC,
} from './layout';
import { anvilPose, fireDepthAt, forgePose } from './stations';

interface Props {
  session: Session;
  barRef: React.RefObject<THREE.Mesh | null>;
}

/** raycast 命中工件的結果 */
interface Pick {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  seg: number;
  angle: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const LOCAL_X = new THREE.Vector3(1, 0, 0);
const PLANE_FWD = new THREE.Vector3(0, 0, 1);

/** 游標可以超出工件兩端多少（佔全長的比例）還算瞄在上面 */
const END_SLACK = 0.04;

/**
 * 握錘那隻手在鏡頭座標裡的位置（右、下、前）。
 *
 * 錘子不是浮在砧面上方的道具，是握在自己手裡的東西。手的位置固定在
 * 鏡頭附近，錘頭繞著手畫弧落到鐵上 —— 這樣「第一人稱在揮」才成立。
 * 之前把錘子直接畫在落點正上方，不管弧度怎麼調角度都會怪，
 * 因為那個姿勢根本沒有人握著（Glen 2026-11-07 第二輪）。
 */
const HAND_LOCAL = new THREE.Vector3(0.22, -0.46, -0.3);

/**
 * 後擺拉到滿時，錘頭繞著手往後轉多少弧度。
 *
 * 只有 0.4 rad 看起來很小，但手在畫面外的右下角，力臂長 0.7 m 以上，
 * 這個角度在畫面上就是錘頭走掉約三成的畫面高度，很明顯。
 * 再大一點，瞄近端時錘頭會從畫面上緣出去（量過：0.44 時近端 −74 px）。
 */
const MAX_SWING = 0.4;

/** 錘頭停在鐵面上方這麼高，免得插進工件裡 */
const HEAD_CLEAR = 0.026;

/** 落錘動畫走到這個進度就是錘頭碰到鐵的那一刻 */
const CONTACT_T = 0.34;

export function StrikeRig({ session, barRef }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);

  const aimRef = useRef<THREE.Mesh>(null);
  const jitterRef = useRef<THREE.Mesh>(null);
  const hammerRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.PointLight>(null);
  const barLightRef = useRef<THREE.PointLight>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const handleRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  /** 每幀重用，避免在迴圈裡配置 */
  const tmp = useMemo(
    () => ({
      hand: new THREE.Vector3(),
      target: new THREE.Vector3(),
      arm: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      side: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
    }),
    [],
  );

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  /** 按住期間每次移動都要重算落點，但不想為此重掛監聽器 */
  const aimAtRef = useRef<(x: number, y: number) => void>(() => {});
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, lx: 0, ly: 0 });
  const shake = useRef(0);
  /** 落錘動畫。t 是 0..1 的進度，x/y/z 是這一錘要打的世界座標 */
  const hammerAnim = useRef({ t: 1, lift: 0, x: 0, y: 0, z: 0 });
  /**
   * 已經結算、但錘子還沒落到的那一錘。
   *
   * 放開的瞬間狀態機就算完了，可是錘子還在空中。變形、震動、火花
   * 全部延到錘頭真的碰到鐵的那一幀才發生，不然畫面會先抖、鐵先扁，
   * 錘子才慢慢落下來（Glen 2026-11-07：往下揮的動作不見了）。
   */
  const pending = useRef<(() => void) | null>(null);
  const ringAnim = useRef(1);
  const lastSeg = useRef(Math.floor(SEG / 2));
  const syncAcc = useRef(0);
  const layersDone = useRef(false);

  /** 兩個工位各自的鏡頭。走路期間在這兩組之間插值 */
  const views = useMemo(() => {
    const make = (eye: readonly number[], look: readonly number[]) => {
      const m = new THREE.Matrix4().lookAt(
        new THREE.Vector3(eye[0], eye[1], eye[2]),
        new THREE.Vector3(look[0], look[1], look[2]),
        UP,
      );
      return {
        eye: new THREE.Vector3(eye[0], eye[1], eye[2]),
        quat: new THREE.Quaternion().setFromRotationMatrix(m),
      };
    };
    return { anvil: make(EYE, LOOK_AT), forge: make(FORGE_EYE, FORGE_LOOK) };
  }, []);

  /** 工件姿態每幀重算，兩個工位共用這兩個暫存 */
  const pose = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      posB: new THREE.Vector3(),
      quatB: new THREE.Quaternion(),
      eye: new THREE.Vector3(),
      quatC: new THREE.Quaternion(),
    }),
    [],
  );
  /** 爐前按住左鍵時，用滑鼠上下調整插入深度 */
  const insertDrag = useRef({ active: false, x0: 0, base: 0 });
  /** 按著不放的鍵。空白鍵送風要每幀讀，不能走事件 */
  const keys = useRef({ space: false });

  /** 走到另一個工位。走路期間不能操作，手上的料繼續降溫 */
  const travelTo = (to: Station): void => {
    if (session.travel > 0 || session.station === to) return;
    session.swing.cancel();
    session.aim = null;
    session.aimOff = false;
    insertDrag.current.active = false;
    session.travelFrom = session.station;
    session.station = to;
    session.travel = TRAVEL_SEC;
    if (to === 'forge') session.wp.heats += 1;
    useHud.getState().patch({ station: to, travelling: true, heats: session.wp.heats });
    useHud.getState().setFlash(to === 'forge' ? '走向爐火' : '走回鐵砧', 'flag');
  };

  /**
   * 螢幕座標換成「要打工件的哪一段」。
   *
   * 錘子一律從正上方落下，不打側面，所以這裡只需要一個數字：
   * 沿著棒子的哪個位置。繞一圈的角度不由游標決定，一律取世界正上方。
   *
   * 關鍵是**完全不看側向距離**。做法是求游標射線與工件中心線的最近點，
   * 取它落在中心線上的位置。理由有兩個：
   *   1. 滑鼠的左右是「甩」，不是錘子的橫向位置。後擺時游標本來就會離開
   *      棒子，若拿側向距離當判定，錘子在整段後擺期間會消失，回饋反而更差。
   *   2. 鐵棒半徑才 13 mm，拿側向精度當門檻是在考滑鼠，不是在考鍛造。
   * 還是打得空：游標指到棒子兩端之外就沒有落點，那一錘打在砧面上。
   */
  const aimAt = (clientX: number, clientY: number): Pick | null => {
    const bar = barRef.current;
    if (!bar) return null;
    const wp = session.wp;
    const rect = gl.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);

    // 中心線兩端（世界座標）
    const z0 = wp.spineZ[0];
    const z1 = wp.spineZ[SEG - 1];
    const a = bar.localToWorld(new THREE.Vector3(0, 0, z0));
    const b = bar.localToWorld(new THREE.Vector3(0, 0, z1));
    const axis = b.clone().sub(a);
    const span = axis.length();
    if (span < 1e-6) return null;
    axis.divideScalar(span);

    // 射線與中心線的最近點：標準的兩條直線最近距離解
    const d = ray.ray.direction;
    const w0 = ray.ray.origin.clone().sub(a);
    const bd = d.dot(axis);
    const denom = 1 - bd * bd;
    if (Math.abs(denom) < 1e-6) return null; // 視線與棒子平行，沒有唯一解
    const sAlong = (axis.dot(w0) - bd * d.dot(w0)) / denom;

    const slack = span * END_SLACK;
    if (sAlong < -slack || sAlong > span + slack) return null;
    const seg = wp.segmentAt(z0 + sAlong);

    // 世界正上方，換算回工件自身座標的角度。
    // restHeight 取正下方用的是 -PI/2 - roll，這裡剛好差半圈。
    const angle = Math.PI / 2 - wp.roll;
    const r = wp.radiusAt(seg, angle);
    const point = new THREE.Vector3(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      wp.spineZ[seg],
    );
    bar.localToWorld(point);
    return { point, normal: UP.clone(), seg, angle };
  };

  /**
   * 把落點預覽更新成游標現在指的位置。
   *
   * 按下只是把錘子舉起來，放開的那一點才是落點，所以整段按住期間
   * 這個都要跟著游標走，玩家才看得到錘子會落在哪（Glen 2026-11-07）。
   */
  const refreshAim = (clientX: number, clientY: number): void => {
    // 後擺期間完全不動落點。
    //
    // 滑鼠的左右在這一段是「蓄力」，不是「瞄準」，可是棒子在畫面上是斜的，
    // 讓落點跟著游標跑的話，錘子會在蓄力時沿著棒子滑到另一端去 ——
    // 那正是「錘子不要左右移」要避免的事（Glen 2026-11-07）。
    // 甩回來之後（swing）才恢復追蹤，放開的那一點才是真正的落點。
    if (session.swing.state === 'windup') {
      session.aimOff = false;
      return;
    }
    const hit = aimAt(clientX, clientY);
    if (hit) {
      session.aim = {
        x: hit.point.x, y: hit.point.y, z: hit.point.z,
        nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z,
        seg: hit.seg, angle: hit.angle,
      };
      session.aimOff = false;
      lastSeg.current = hit.seg;
      return;
    }
    // 指到棒子外面了。按住期間不把落點清掉 —— 後擺本來就會把游標甩出去，
    // 這時清掉的話錘子會在整段蓄力期間消失，回饋反而比改之前更差。
    // 落點留在最後一個有效位置，改用顏色告訴玩家現在放開會打空。
    session.aimOff = true;
    if (session.swing.state === 'idle') session.aim = null;
  };
  useEffect(() => {
    aimAtRef.current = refreshAim;
  });

  /* 開發用：把 aimAt 與 session 掛到 window，方便在主控台探落點 */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rig = {
      aimAt,
      session,
      bar: () => barRef.current,
      camera,
    };
  });

  /** 把還沒落地的那一錘立刻結算掉。連打時下一錘可能來得比落地還早 */
  const flushPending = (): void => {
    const f = pending.current;
    pending.current = null;
    f?.();
  };

  /* 揮錘狀態機的事件接到世界上 */
  useEffect(() => {
    const { wp, swing, scatter } = session;
    const hud = useHud.getState();

    swing.handlers = {
      onArm: (p) => {
        flushPending();
        refreshAim(p.x, p.y);
      },

      onState: (s, hint) => useHud.getState().patch({ swingState: s, hint }),

      onRecall: () => {
        session.recalls += 1;
        session.aim = null;
        session.aimOff = false;
        hammerAnim.current.t = 1;
        useHud.getState().patch({ recalls: session.recalls });
        useHud.getState().setFlash('收手', 'flag');
      },

      onHit: (hit) => {
        const bar = barRef.current;
        const mode = useHud.getState().mode;

        // 散布統計：量「打到的地方離想打的地方多遠」。
        //
        // 想打的地方隨落點取樣方式而不同：取放開座標時是放開的那一點，
        // 其餘是按下時鎖的那一點。固定拿 anchor 當基準的話，release 模式下
        // 量到的會是「放開離按下多遠」—— 那是手勢本身的幅度，不是失準。
        const intended = mode === 'release' ? hit.release : hit.anchor;
        scatter.push(mode, {
          dx: (hit.landing.x - intended.x) / size.width,
          dy: (hit.landing.y - intended.y) / size.width,
          force: hit.force,
        });
        useHud.getState().bumpScatter();

        const land = aimAt(hit.landing.x, hit.landing.y);

        // 上一錘要是還在空中，先讓它落地，免得兩錘的效果疊在一起
        flushPending();

        const aimNow = session.aim;
        hammerAnim.current = {
          t: 0,
          lift: 0.1 + 0.9 * swing.windupRatio,
          x: land?.point.x ?? aimNow?.x ?? 0,
          y: land?.point.y ?? aimNow?.y ?? ANVIL_TOP,
          z: land?.point.z ?? aimNow?.z ?? 0,
        };

        if (!land || !bar) {
          pending.current = () => {
            shake.current = Math.max(shake.current, hit.force * 0.55);
            useHud.getState().setFlash('打在砧面上', 'bad');
          };
          return;
        }

        // 傾角：螢幕上的左右，投影到打擊點所在的切平面。
        // 工件轉過角度之後，同一個手勢推金屬的方向就跟著變，
        // 這是 3D 唯一一處直接讓玩法變深的地方（07 第 2.3 節）。
        const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const invQ = bar.getWorldQuaternion(new THREE.Quaternion()).invert();
        const rLocal = camRight.applyQuaternion(invQ).normalize();
        const tangent = new THREE.Vector3(
          -Math.sin(land.angle),
          Math.cos(land.angle),
          0,
        );
        const tiltAxial = hit.tilt * rLocal.z;
        const tiltCirc = hit.tilt * rLocal.dot(tangent);

        if (hit.intervalMs > 0 && hit.intervalMs < 4000) {
          session.intervals.push(hit.intervalMs);
          if (session.intervals.length > 40) session.intervals.shift();
        }

        // 底下這些等錘頭真的碰到鐵才發生
        pending.current = () => {
          const res = wp.strike({
            seg: land.seg,
            angle: land.angle,
            force: hit.force,
            tiltAxial,
            tiltCirc,
          });
          lastSeg.current = land.seg;
          shake.current = Math.max(shake.current, hit.force);

          if (sparkRef.current) {
            sparkRef.current.position.copy(land.point);
            sparkRef.current.intensity = 2.2 + hit.force * 9;
          }
          if (ringRef.current) {
            ringRef.current.position.copy(land.point).addScaledVector(land.normal, 0.0015);
            ringRef.current.quaternion.setFromUnitVectors(PLANE_FWD, land.normal);
            ringAnim.current = 0;
          }

          const f = useHud.getState().setFlash;
          if (res.cold) f('冷作裂紋', 'bad');
          else if (res.slipped) f('錘面打滑', 'warn');
          else if (hit.force > 0.85) f('重錘', 'good');

          useHud.getState().patch({
            lastForce: hit.force,
            lastTilt: hit.tilt,
            rhythmMs: hit.intervalMs,
          });
        };
      },
    };
    void hud;
  }, [session, barRef, camera, gl, size.width]);

  /* 左手：點一下離散、按住連續（07 第 2.1 節） */
  const rollAxis = useMemo(
    () =>
      new TapHoldAxis({
        onTap: (dir) => {
          const step = Math.PI / 2;
          session.rollTarget = Math.round(session.wp.roll / step) * step + dir * step;
        },
        onHold: (dir, dtMs) => {
          session.rollTarget = null;
          session.wp.roll += dir * 1.9 * (dtMs / 1000);
        },
      }),
    [session],
  );

  const feedAxis = useMemo(
    () =>
      new TapHoldAxis({
        onTap: (dir) => {
          session.wp.feed = clamp(session.wp.feed + dir * 0.022, -0.2, 0.2);
        },
        onHold: (dir, dtMs) => {
          session.wp.feed = clamp(
            session.wp.feed + dir * 0.2 * (dtMs / 1000),
            -0.2,
            0.2,
          );
        },
      }),
    [session],
  );

  /* 輸入 */
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    const now = () => performance.now();

    const onDown = (e: PointerEvent) => {
      if (e.button === 2) {
        // 右鍵環視。動作進行中不給轉，鏡頭的自由只存在於動作之外
        if (session.swing.state === 'idle') {
          look.current.dragging = true;
          look.current.lx = e.clientX;
          look.current.ly = e.clientY;
        }
        return;
      }
      if (e.button !== 0) return;
      if (session.travel > 0) return;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* 合成事件或沒有 active pointer 時會丟，忽略即可 */
      }
      if (session.station === 'forge') {
        // 爐前的動詞是「持」：按住把料壓進火心，放開就夾出來
        insertDrag.current = { active: true, x0: e.clientX, base: session.insert };
        return;
      }
      session.swing.setViewport(el.clientWidth, el.clientHeight);
      session.swing.pointerDown(e.clientX, e.clientY, now());
    };

    const onMove = (e: PointerEvent) => {
      if (look.current.dragging) {
        look.current.yaw = clamp(
          look.current.yaw - (e.clientX - look.current.lx) * 0.0035,
          -0.5,
          0.5,
        );
        look.current.pitch = clamp(
          look.current.pitch - (e.clientY - look.current.ly) * 0.0028,
          -0.32,
          0.26,
        );
        look.current.lx = e.clientX;
        look.current.ly = e.clientY;
        return;
      }
      if (session.station === 'forge') {
        const d = insertDrag.current;
        if (d.active) {
          // 往右推 = 推得更深。
          //
          // 料在畫面上是從左下伸進火裡的，所以「往右」就是順著料的方向
          // 把它推進去，手往哪邊動、東西就往哪邊走。改之前用上下，
          // 跟畫面上看到的方向對不起來（Glen 2026-11-07 第三輪）。
          const span = Math.max(1, el.clientWidth * 0.45);
          session.insert = clamp(d.base + (e.clientX - d.x0) / span, 0, 1);
        }
        return;
      }
      session.swing.pointerMove(e.clientX, e.clientY, now());
      if (session.swing.state !== 'idle') aimAtRef.current(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button === 2 || look.current.dragging) {
        look.current.dragging = false;
        return;
      }
      if (session.station === 'forge') {
        insertDrag.current.active = false;
        return;
      }
      session.swing.pointerUp(e.clientX, e.clientY, now());
      session.aim = null;
      session.aimOff = false;
    };

    const onCtx = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = now();
      switch (e.code) {
        case 'KeyQ': rollAxis.press(-1, t); break;
        case 'KeyE': rollAxis.press(1, t); break;
        case 'KeyA': feedAxis.press(-1, t); break;
        case 'KeyD': feedAxis.press(1, t); break;
        case 'Tab':
          e.preventDefault();
          session.dim = true;
          useHud.getState().patch({ dim: true });
          break;
        case 'Space':
          e.preventDefault();
          keys.current.space = true;
          break;
        case 'KeyF':
          travelTo(session.station === 'anvil' ? 'forge' : 'anvil');
          break;
        case 'KeyN':
          session.wp.reset();
          session.forge.reset();
          session.intervals.length = 0;
          session.insert = 0.25;
          session.withdraw = 1;
          useHud.getState().setFlash('換一根新料', 'flag');
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const t = now();
      switch (e.code) {
        case 'KeyQ': rollAxis.release(-1, t); break;
        case 'KeyE': rollAxis.release(1, t); break;
        case 'KeyA': feedAxis.release(-1, t); break;
        case 'KeyD': feedAxis.release(1, t); break;
        case 'Tab':
          session.dim = false;
          useHud.getState().patch({ dim: false });
          break;
        case 'Space':
          keys.current.space = false;
          break;
      }
    };

    const onBlur = () => {
      rollAxis.clear();
      feedAxis.clear();
      session.swing.cancel();
      keys.current.space = false;
      insertDrag.current.active = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('contextmenu', onCtx);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl, session, rollAxis, feedAxis]);

  useEffect(() => {
    camera.fov = 52;
    camera.near = 0.02;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, dt) => {
    const { wp, swing } = session;

    // 工件那盞燈只准照別人，不准照自己：
    // 它就在網格中心，照到自己會把色溫整個洗白，
    // 「暗櫻桃紅跟櫻桃紅分不分得出來」那條驗收就廢了。
    if (!layersDone.current && barRef.current && barLightRef.current) {
      layersDone.current = true;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o !== barRef.current) o.layers.enable(1);
      });
      barLightRef.current.layers.set(1);
    }
    const t = performance.now();
    rollAxis.update(t, dt * 1000);
    feedAxis.update(t, dt * 1000);

    // 吸附回 90 度
    if (session.rollTarget !== null) {
      const d = session.rollTarget - wp.roll;
      if (Math.abs(d) < 0.003) {
        wp.roll = session.rollTarget;
        session.rollTarget = null;
      } else {
        wp.roll += d * Math.min(1, dt * 13);
      }
    }

    wp.cool(dt);

    /* 工位與走動 */
    const travelling = session.travel > 0;
    if (travelling) {
      session.travel = Math.max(0, session.travel - dt);
    }
    // 0 = 還在出發地，1 = 已經到了。平滑一下，不然走路像瞬移
    const raw = travelling ? 1 - session.travel / TRAVEL_SEC : 1;
    const k = raw * raw * (3 - 2 * raw);
    const here = session.station;
    const from = session.travelFrom;

    /* 爐火：風量與火心每幀都在跑，不管人在不在爐前 */
    session.forge.setPumping(!travelling && here === 'forge' && keys.current.space);
    session.forge.update(dt);

    // 沒按住左鍵就把料夾出火心。爐前的「持」就是這個意思。
    // 夾出來的是整根（withdraw），不是把深淺歸零 ——
    // 深淺要留著，放開再按住才會回到剛才那一段
    const wantWithdraw = insertDrag.current.active && session.station === 'forge' ? 0 : 1;
    session.withdraw += (wantWithdraw - session.withdraw) * Math.min(1, dt * 5.5);

    const bar = barRef.current;
    if (bar) {
      // 兩個工位各自算世界座標，走路期間在兩者之間插值 —— 料是被夾著走的
      anvilPose(wp, pose.pos, pose.quat);
      forgePose(wp, session.insert, session.withdraw, pose.posB, pose.quatB);
      const toForge = here === 'forge';
      if (travelling) {
        const a = from === 'forge' ? pose.posB : pose.pos;
        const b = toForge ? pose.posB : pose.pos;
        const qa = from === 'forge' ? pose.quatB : pose.quat;
        const qb = toForge ? pose.quatB : pose.quat;
        bar.position.lerpVectors(a, b, k);
        bar.quaternion.copy(qa).slerp(qb, k);
      } else if (toForge) {
        bar.position.copy(pose.posB);
        bar.quaternion.copy(pose.quatB);
      } else {
        bar.position.copy(pose.pos);
        bar.quaternion.copy(pose.quat);
      }
      bar.updateMatrixWorld();

      /* 加熱：只有真的推進火裡的那幾段會升溫 */
      if (!travelling && toForge) {
        for (let i = 0; i < SEG; i++) {
          const depth = fireDepthAt(wp, i, bar.position, bar.quaternion);
          if (depth <= 0) continue;
          const gain = session.forge.gainAt(depth, wp.temp[i], dt);
          if (gain > 0) wp.heatSegment(i, gain, dt);
        }
      }

      // 熱鐵自己會照亮砧面。emissive 只讓它自己亮，不會打光出去，
      // 少了這盞燈，鐵砧在暗房裡是全黑的 —— 真實鍛造間不是這樣。
      if (barLightRef.current) {
        const mid = new THREE.Vector3(0, 0, (wp.spineZ[0] + wp.spineZ[SEG - 1]) / 2);
        bar.localToWorld(mid);
        const temp = wp.meanTemp;
        const [cr, cg, cb] = heatColor(temp);
        barLightRef.current.position.copy(mid);
        barLightRef.current.color.setRGB(cr, cg, cb);
        barLightRef.current.intensity = Math.pow(temp, 2.6) * 3.2;
      }
    }

    /* 鏡頭：動作進行中完全不動，只有衝擊震動與走動時的過場 */
    const vFrom = views[travelling ? from : here];
    const vTo = views[here];
    pose.eye.lerpVectors(vFrom.eye, vTo.eye, k);
    pose.quatC.copy(vFrom.quat).slerp(vTo.quat, k);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(UP, look.current.yaw)
      .multiply(pose.quatC)
      .multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_X, look.current.pitch));
    camera.quaternion.copy(q);
    camera.position.copy(pose.eye);
    if (shake.current > 0.002) {
      camera.position.x += (Math.random() - 0.5) * shake.current * 0.022;
      camera.position.y += (Math.random() - 0.5) * shake.current * 0.022;
      shake.current *= Math.exp(-dt * 13);
    }

    /* 落點標記與抖動圈 */
    const aim = session.aim;
    const armed = swing.state !== 'idle' && aim !== null;
    if (aimRef.current && jitterRef.current) {
      aimRef.current.visible = armed;
      jitterRef.current.visible = armed;
      if (armed && aim) {
        const p = new THREE.Vector3(aim.x, aim.y, aim.z);
        const n = new THREE.Vector3(aim.nx, aim.ny, aim.nz);
        const qn = new THREE.Quaternion().setFromUnitVectors(PLANE_FWD, n);
        aimRef.current.position.copy(p).addScaledVector(n, 0.001);
        aimRef.current.quaternion.copy(qn);
        jitterRef.current.position.copy(p).addScaledVector(n, 0.0012);
        jitterRef.current.quaternion.copy(qn);

        // 把偏移半徑從畫面比例換成世界尺寸，抖動圈才真的等於「會偏多少」
        const dist = camera.position.distanceTo(p);
        const worldPerPx =
          (2 * Math.tan(((camera.fov * Math.PI) / 180) / 2) * dist) / size.height;
        const r = Math.max(
          0.0015,
          swing.previewOffsetR * size.width * worldPerPx,
        );
        jitterRef.current.scale.setScalar(r);
        const mat = jitterRef.current.material as THREE.MeshBasicMaterial;
        mat.color.setHex(
          session.aimOff ? 0xff2f2f : swing.isOvershooting ? 0xff5a3c : 0xd9a22b,
        );
        (aimRef.current.material as THREE.MeshBasicMaterial).color.setHex(
          session.aimOff ? 0xff6b6b : 0xf6f1e6,
        );
      }
    }

    /* 錘子：握在手裡，繞著手畫弧 */
    if (hammerRef.current && handleRef.current) {
      const anim = hammerAnim.current;
      let lift = 0;
      let tx = 0;
      let ty = 0;
      let tz = 0;
      let show = false;

      if (anim.t < 1) {
        // 落錘。整段 0.4 秒，前 34% 是砸下去（約 136 ms），剩下是反彈收回。
        //
        // 這一段**不能綁 session.aim**：放開的那一刻 aim 就被清成 null，
        // 綁著的話錘子會在落下之前就消失，玩家永遠看不到往下揮那一下
        // （Glen 2026-11-07 回報的就是這個）。所以落點在結算時就存進 anim。
        const prev = anim.t;
        anim.t = Math.min(1, anim.t + dt / 0.4);
        if (prev < CONTACT_T && anim.t >= CONTACT_T) flushPending();
        const k =
          anim.t < CONTACT_T
            ? 1 - Math.pow(anim.t / CONTACT_T, 1.8)
            : 0.45 * Math.sin(((anim.t - CONTACT_T) / (1 - CONTACT_T)) * Math.PI);
        lift = anim.lift * k;
        tx = anim.x;
        ty = anim.y;
        tz = anim.z;
        show = true;
      } else if (armed && aim) {
        lift = 0.1 + 0.9 * swing.windupRatio;
        tx = aim.x;
        ty = aim.y;
        tz = aim.z;
        show = true;
      }
      hammerRef.current.visible = show;

      if (show) {
        // 手固定在鏡頭附近。camera 的位置與朝向這一幀上面已經設好了
        camera.updateMatrixWorld();
        tmp.hand.copy(HAND_LOCAL).applyMatrix4(camera.matrixWorld);
        tmp.target.set(tx, ty + HEAD_CLEAR, tz);

        // 手指向落點的向量，就是放下時的錘子。後擺就是把它繞著手往上轉。
        tmp.arm.subVectors(tmp.target, tmp.hand);
        const reach = tmp.arm.length();
        if (reach > 1e-4) {
          // 轉軸取水平、且垂直於 arm 所在的鉛直面，這樣轉起來是「抬高」
          tmp.axis.crossVectors(tmp.arm, UP);
          if (tmp.axis.lengthSq() > 1e-8) {
            tmp.axis.normalize();
            tmp.arm.applyAxisAngle(tmp.axis, lift * MAX_SWING);
          }
          // 錘頭落在弧上，握柄從錘頭指回手裡
          hammerRef.current.position.copy(tmp.hand).add(tmp.arm);
          tmp.dir.copy(tmp.arm).multiplyScalar(-1).normalize();

          // 明確建一組基底，不要用 setFromUnitVectors。
          //
          // setFromUnitVectors(UP, dir) 只保證握柄指對方向，繞著握柄的扭轉
          // 是任意的 —— 也就是錘面朝哪邊沒人管。那是「看起來不像在揮錘」
          // 的主因（Glen 2026-11-07 第三輪）。
          //   local +y = 握柄方向（錘頭指回手裡）
          //   local +z = 揮擊平面的法線（水平，就是上面那根轉軸）
          //   local +x = 兩者的叉積，剛好是錘頭長軸該躺的方向
          tmp.side.copy(tmp.axis);
          tmp.fwd.crossVectors(tmp.dir, tmp.side).normalize();
          tmp.basis.makeBasis(tmp.fwd, tmp.dir, tmp.side);
          hammerRef.current.quaternion.setFromRotationMatrix(tmp.basis);

          // 手腕：舉起來的時候錘頭往後翻，落下時打平。
          // 這一下不動握柄，所以柄還是接在手上
          if (headRef.current) headRef.current.rotation.z = -lift * 0.62;
          // 握柄每幀拉長到剛好接到手上，瞄遠瞄近都不會斷開或穿出去
          handleRef.current.scale.y = reach;
          handleRef.current.position.y = reach / 2;
        }
      }
    }

    /* 撞擊的光與環 */
    if (sparkRef.current && sparkRef.current.intensity > 0.01) {
      sparkRef.current.intensity *= Math.exp(-dt * 11);
    }
    if (ringRef.current) {
      if (ringAnim.current < 1) {
        ringAnim.current = Math.min(1, ringAnim.current + dt / 0.3);
        const k = ringAnim.current;
        ringRef.current.visible = true;
        ringRef.current.scale.setScalar(0.005 + k * 0.05);
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      } else {
        ringRef.current.visible = false;
      }
    }

    /* 節流把摘要推給 HUD */
    syncAcc.current += dt;
    if (syncAcc.current > 0.08) {
      syncAcc.current = 0;
      const seg = aim?.seg ?? lastSeg.current;
      const ext = wp.sectionExtent(seg);
      const poly: number[] = [];
      for (let k = 0; k < RADIAL; k++) poly.push(wp.radii[seg * RADIAL + k] * 1000);
      const fit = fitProfile(wp, session.target);
      useHud.getState().patch({
        heat: wp.temp[seg],
        heatName: heatLabel(wp.temp[seg]),
        station: session.station,
        travelling: session.travel > 0,
        air: session.forge.air,
        core: session.forge.core,
        insert: session.insert,
        scorch: wp.worstScorch,
        profileErr: Array.from(fit.perSeg),
        profileWithin: fit.within,
        profileLenErr: fit.lengthErr,
        profileDone: fit.done,
        windup: swing.windupRatio,
        overshoot: swing.isOvershooting,
        roll: wp.roll,
        feed: wp.feed,
        lengthMm: wp.length * 1000,
        sectionW: ext.w * 1000,
        sectionH: ext.h * 1000,
        sectionPoly: poly,
        aimSeg: seg,
        hits: wp.hits,
        cracks: wp.cracks,
        heats: wp.heats,
      });
    }
  });

  return (
    <>
      <mesh ref={aimRef} visible={false}>
        <ringGeometry args={[0.0022, 0.0034, 20]} />
        <meshBasicMaterial color="#f6f1e6" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh ref={jitterRef} visible={false}>
        <ringGeometry args={[0.92, 1, 40]} />
        <meshBasicMaterial color="#d9a22b" transparent opacity={0.5} depthTest={false} />
      </mesh>
      <mesh ref={ringRef} visible={false}>
        <ringGeometry args={[0.7, 1, 24]} />
        <meshBasicMaterial
          color="#ffd089"
          transparent
          opacity={0}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight ref={sparkRef} color="#ffcf8a" intensity={0} distance={1.2} decay={2} />
      <pointLight ref={barLightRef} intensity={0} distance={1.9} decay={2} />
      {/*
        群組原點就是落點；局部 +y 是握柄方向（指回手），
        +x 是錘頭長軸躺的方向，+z 是揮擊平面的法線。
      */}
      <group ref={hammerRef} visible={false}>
        {/* 錘頭長軸沿 x，整塊往握柄那邊抬一點，打擊面才落在原點上 */}
        <mesh ref={headRef} position={[0, 0.032, 0]}>
          <boxGeometry args={[0.1, 0.048, 0.044]} />
          <meshStandardMaterial color="#8a857c" roughness={0.38} metalness={0.25} />
        </mesh>
        {/* 單位長度的柄，每幀縮放到剛好接到手，所以這裡不寫死長度 */}
        <mesh ref={handleRef}>
          <cylinderGeometry args={[0.0105, 0.0135, 1, 10]} />
          <meshStandardMaterial color="#7a5a3a" roughness={0.85} />
        </mesh>
      </group>
    </>
  );
}

/** 夾在範圍裡 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
