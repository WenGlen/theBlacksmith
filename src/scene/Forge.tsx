/**
 * 爐火。
 *
 * 這是整個場景唯一的主光源，而且是刻意的：
 * `02_操作轉化設計.md` 原則 3 說「看得到的東西才算資訊」。
 * 房間夠暗、工件自己發光，判色才是真的在判色，不是在看美術貼的濾鏡。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Forge as ForgeModel } from '../game/forge/forge';

export function Forge({ forge }: { forge: ForgeModel }) {
  const lightRef = useRef<PointLight>(null);
  const coalRef = useRef<Mesh>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    const n =
      Math.sin(t.current * 7.3) * 0.5 +
      Math.sin(t.current * 13.1 + 1.7) * 0.3 +
      Math.sin(t.current * 23.7 + 0.4) * 0.2;
    if (lightRef.current) {
      // 送風會讓爐火變旺，這是玩家唯一看得到的風量回饋
      // 這盞燈是整個房間的主光源，鐵砧那邊全靠它，不能為了爐前的構圖調低。
      // 近距離過曝的其實是炭床自己的 emissive，壓那個就好
      const strength = 11 + 9 * forge.glow;
      lightRef.current.intensity = strength * (0.84 + 0.16 * n);
    }
    if (coalRef.current) {
      const m = coalRef.current.material as MeshStandardMaterial;
      m.emissiveIntensity = 0.1 + 0.26 * forge.glow;
    }
  });

  return (
    <group position={[-1.32, 0, -1.25]} rotation={[0, 0.55, 0]}>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.02, 0.76, 0.8]} />
        <meshStandardMaterial color="#241d19" roughness={0.95} />
      </mesh>
      {/* 炭床 */}
      <mesh ref={coalRef} position={[0, 0.775, 0]}>
        <boxGeometry args={[0.62, 0.05, 0.46]} />
        <meshStandardMaterial
          color="#5a1c06"
          emissive="#ff5c14"
          emissiveIntensity={0.18}
          roughness={1}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.92, 0]}
        color="#ff7320"
        intensity={15}
        distance={8.5}
        decay={2}
      />
    </group>
  );
}
