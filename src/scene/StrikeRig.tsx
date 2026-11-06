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
import { RADIAL, SEG } from '../game/workpiece/workpiece';
import { useHud } from '../state/hud';
import type { Session } from '../state/session';
import { ANVIL_TOP, EYE, LOOK_AT } from './layout';

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

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, lx: 0, ly: 0 });
  const shake = useRef(0);
  const hammerAnim = useRef({ t: 1, lift: 0 });
  const ringAnim = useRef(1);
  const lastSeg = useRef(Math.floor(SEG / 2));
  const syncAcc = useRef(0);
  const layersDone = useRef(false);

  const baseQuat = useMemo(() => {
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(...EYE),
      new THREE.Vector3(...LOOK_AT),
      UP,
    );
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, []);

  /** 把螢幕座標打進工件。打不中回 null，那就是打在砧面上 */
  const pick = (clientX: number, clientY: number): Pick | null => {
    const bar = barRef.current;
    if (!bar) return null;
    const rect = gl.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(bar, false)[0];
    if (!hit || !hit.face) return null;
    const local = bar.worldToLocal(hit.point.clone());
    const normal = hit.face.normal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(bar.matrixWorld))
      .normalize();
    return {
      point: hit.point.clone(),
      normal,
      seg: session.wp.segmentAt(local.z),
      angle: Math.atan2(local.y, local.x),
    };
  };

  /* 開發用：把 pick 與 session 掛到 window，方便在主控台探落點 */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rig = {
      pick,
      session,
      bar: () => barRef.current,
      camera,
    };
  });

  /* 揮錘狀態機的事件接到世界上 */
  useEffect(() => {
    const { wp, swing, scatter } = session;
    const hud = useHud.getState();

    swing.handlers = {
      onArm: (p) => {
        const hit = pick(p.x, p.y);
        session.aim = hit
          ? {
              x: hit.point.x, y: hit.point.y, z: hit.point.z,
              nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z,
              seg: hit.seg, angle: hit.angle,
            }
          : null;
        if (hit) lastSeg.current = hit.seg;
      },

      onState: (s, hint) => useHud.getState().patch({ swingState: s, hint }),

      onRecall: () => {
        session.recalls += 1;
        session.aim = null;
        hammerAnim.current.t = 1;
        useHud.getState().patch({ recalls: session.recalls });
        useHud.getState().setFlash('收手', 'flag');
      },

      onHit: (hit) => {
        const bar = barRef.current;
        const mode = useHud.getState().mode;

        // 散布統計：相對鎖定落點的偏移，用畫面寬度正規化
        scatter.push(mode, {
          dx: (hit.landing.x - hit.anchor.x) / size.width,
          dy: (hit.landing.y - hit.anchor.y) / size.width,
          force: hit.force,
        });
        useHud.getState().bumpScatter();

        const land = pick(hit.landing.x, hit.landing.y);
        shake.current = Math.max(shake.current, hit.force);
        hammerAnim.current = { t: 0, lift: 0.05 + 0.33 * swing.windupRatio };

        if (!land || !bar) {
          useHud.getState().setFlash('打在砧面上', 'bad');
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

        const res = wp.strike({
          seg: land.seg,
          angle: land.angle,
          force: hit.force,
          tiltAxial,
          tiltCirc,
        });
        lastSeg.current = land.seg;

        if (sparkRef.current) {
          sparkRef.current.position.copy(land.point);
          sparkRef.current.intensity = 1.2 + hit.force * 5;
        }
        if (ringRef.current) {
          ringRef.current.position.copy(land.point).addScaledVector(land.normal, 0.0015);
          ringRef.current.quaternion.setFromUnitVectors(PLANE_FWD, land.normal);
          ringAnim.current = 0;
        }

        if (hit.intervalMs > 0 && hit.intervalMs < 4000) {
          session.intervals.push(hit.intervalMs);
          if (session.intervals.length > 40) session.intervals.shift();
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
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* 合成事件或沒有 active pointer 時會丟，忽略即可 */
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
      session.swing.pointerMove(e.clientX, e.clientY, now());
    };

    const onUp = (e: PointerEvent) => {
      if (e.button === 2 || look.current.dragging) {
        look.current.dragging = false;
        return;
      }
      session.swing.pointerUp(e.clientX, e.clientY, now());
      session.aim = null;
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
        case 'KeyR':
          session.wp.reheat();
          useHud.getState().patch({ heats: session.wp.heats });
          useHud.getState().setFlash('回爐', 'good');
          break;
        case 'KeyN':
          session.wp.reset();
          session.intervals.length = 0;
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
      }
    };

    const onBlur = () => {
      rollAxis.clear();
      feedAxis.clear();
      session.swing.cancel();
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

    const bar = barRef.current;
    if (bar) {
      bar.rotation.set(0, 0, wp.roll);
      bar.position.set(0, ANVIL_TOP + wp.restHeight(wp.roll), wp.feed);
      bar.updateMatrixWorld();

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

    /* 鏡頭：動作進行中完全不動，只有衝擊震動 */
    const q = new THREE.Quaternion()
      .setFromAxisAngle(UP, look.current.yaw)
      .multiply(baseQuat)
      .multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_X, look.current.pitch));
    camera.quaternion.copy(q);
    camera.position.set(EYE[0], EYE[1], EYE[2]);
    if (shake.current > 0.002) {
      camera.position.x += (Math.random() - 0.5) * shake.current * 0.012;
      camera.position.y += (Math.random() - 0.5) * shake.current * 0.012;
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
        mat.color.setHex(swing.isOvershooting ? 0xff5a3c : 0xd9a22b);
      }
    }

    /* 錘子 */
    if (hammerRef.current) {
      const anim = hammerAnim.current;
      let lift = 0;
      let show = false;
      if (anim.t < 1) {
        anim.t = Math.min(1, anim.t + dt / 0.17);
        const k = anim.t < 0.3 ? 1 - anim.t / 0.3 : ((anim.t - 0.3) / 0.7) * 0.5;
        lift = anim.lift * k;
        show = true;
      } else if (armed) {
        lift = 0.05 + 0.33 * swing.windupRatio;
        show = true;
      }
      hammerRef.current.visible = show && aim !== null;
      if (aim && show) {
        hammerRef.current.position.set(aim.x, aim.y + lift + 0.028, aim.z + lift * 0.42);
        hammerRef.current.rotation.set(
          -0.5 - lift * 1.1,
          0,
          useHud.getState().lastTilt * 0.25,
        );
      }
    }

    /* 撞擊的光與環 */
    if (sparkRef.current && sparkRef.current.intensity > 0.01) {
      sparkRef.current.intensity *= Math.exp(-dt * 11);
    }
    if (ringRef.current) {
      if (ringAnim.current < 1) {
        ringAnim.current = Math.min(1, ringAnim.current + dt / 0.22);
        const k = ringAnim.current;
        ringRef.current.visible = true;
        ringRef.current.scale.setScalar(0.004 + k * 0.022);
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
      useHud.getState().patch({
        heat: wp.temp[seg],
        heatName: heatLabel(wp.temp[seg]),
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
      <group ref={hammerRef} visible={false}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.05, 0.048, 0.105]} />
          <meshStandardMaterial color="#2a2724" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.011, 0.014, 0.33, 10]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
        </mesh>
      </group>
    </>
  );
}

/** 夾在範圍裡 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
