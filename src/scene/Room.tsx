/**
 * 鍛造間本體。
 *
 * 刻意只有地、兩面牆、幾件黑影。這一刀不做美術資產，
 * 要驗的是「爐火當唯一主光源時判不判得出色溫」，牆越樸素越好判。
 */
import { useHud } from '../state/hud';

export function Room() {
  const dim = useHud((s) => s.dim);
  return (
    <group>
      {/*
        亮度分兩檔，這是判色與看得見之間的解法（Glen 2026-11-07 說整個畫面偏暗）：
        平常這一檔要看得見錘子、鐵砧、自己在做什麼；按住 Tab 壓到幾乎全黑，
        那一檔才是 02 第三節要的遮光判色。把兩件事塞進同一個亮度本來就會互相吃掉。
      */}
      <ambientLight intensity={dim ? 0.014 : 0.17} color="#4a3a52" />
      <hemisphereLight
        intensity={dim ? 0.012 : 0.11}
        color="#30405a"
        groundColor="#1a1008"
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial color="#231c15" roughness={1} />
      </mesh>

      <mesh position={[0, 1.6, -2.6]}>
        <boxGeometry args={[9, 3.2, 0.2]} />
        <meshStandardMaterial color="#2b2219" roughness={0.95} />
      </mesh>
      <mesh position={[-2.8, 1.6, 0]}>
        <boxGeometry args={[0.2, 3.2, 9]} />
        <meshStandardMaterial color="#251d16" roughness={0.95} />
      </mesh>
    </group>
  );
}
