/**
 * 鐵砧。砧面、砧角、收腰砧身、底座、木墩。
 * 長軸沿 z，寬沿 x。整個工位由外層 group 轉成斜的。
 */
import { ANVIL_TOP, FACE_LEN, FACE_T, FACE_W } from './layout';

// metalness 壓低是有理由的：場景沒有環境貼圖，金屬的鏡面項沒有東西可反射，
// metalness 一高整塊就黑掉。在只有爐火的房間裡，低金屬度 + 高粗糙度
// 反而更像被煤灰裹住的熟鐵（2026-11-07 第二輪）
const IRON = { color: '#565049', roughness: 0.74, metalness: 0.14 } as const;

export function Anvil() {
  const faceY = ANVIL_TOP - FACE_T / 2;
  const waistTop = ANVIL_TOP - FACE_T;
  const waistH = 0.2;
  const baseH = 0.07;
  const baseY = waistTop - waistH - baseH / 2;
  const stumpTop = waistTop - waistH - baseH;

  return (
    <group>
      {/* 砧面 */}
      <mesh position={[0, faceY, 0]} castShadow receiveShadow>
        <boxGeometry args={[FACE_W, FACE_T, FACE_LEN]} />
        <meshStandardMaterial {...IRON} color="#665e54" roughness={0.3} metalness={0.3} />
      </mesh>

      {/* 砧角：從一端延伸出去的錐形 */}
      <mesh position={[0, faceY, FACE_LEN / 2 + 0.085]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[FACE_W * 0.42, 0.19, 18]} />
        <meshStandardMaterial {...IRON} />
      </mesh>

      {/* 硬斬孔 */}
      <mesh position={[0, ANVIL_TOP - 0.004, -FACE_LEN / 2 + 0.07]}>
        <boxGeometry args={[0.026, 0.01, 0.026]} />
        <meshStandardMaterial color="#000" roughness={1} />
      </mesh>

      {/* 收腰砧身 */}
      <mesh position={[0, waistTop - waistH / 2, 0]}>
        <boxGeometry args={[FACE_W * 0.66, waistH, FACE_LEN * 0.4]} />
        <meshStandardMaterial {...IRON} />
      </mesh>

      {/* 底座 */}
      <mesh position={[0, baseY, 0]}>
        <boxGeometry args={[FACE_W * 1.35, baseH, FACE_LEN * 0.62]} />
        <meshStandardMaterial {...IRON} />
      </mesh>

      {/* 木墩 */}
      <mesh position={[0, stumpTop / 2, 0]}>
        <cylinderGeometry args={[0.175, 0.19, stumpTop, 16]} />
        <meshStandardMaterial color="#4b4136" roughness={0.95} />
      </mesh>
    </group>
  );
}
