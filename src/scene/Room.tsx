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
      {/* 傳統工房刻意保持昏暗。按住 Tab 把環境光再壓掉，就是 02 第三節的遮光判色 */}
      <ambientLight intensity={dim ? 0.012 : 0.05} color="#4a3a52" />
      <hemisphereLight
        intensity={dim ? 0.01 : 0.04}
        color="#30405a"
        groundColor="#1a1008"
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial color="#16120e" roughness={1} />
      </mesh>

      <mesh position={[0, 1.6, -2.6]}>
        <boxGeometry args={[9, 3.2, 0.2]} />
        <meshStandardMaterial color="#1a1512" roughness={0.95} />
      </mesh>
      <mesh position={[-2.8, 1.6, 0]}>
        <boxGeometry args={[0.2, 3.2, 9]} />
        <meshStandardMaterial color="#17120f" roughness={0.95} />
      </mesh>
    </group>
  );
}
