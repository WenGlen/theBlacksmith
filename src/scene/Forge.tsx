/**
 * 爐火。
 *
 * 這是整個場景唯一的主光源，而且是刻意的：
 * `02_操作轉化設計.md` 原則 3 說「看得到的東西才算資訊」。
 * 房間夠暗、工件自己發光，判色才是真的在判色，不是在看美術貼的濾鏡。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PointLight } from 'three';

export function Forge() {
  const lightRef = useRef<PointLight>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    const n =
      Math.sin(t.current * 7.3) * 0.5 +
      Math.sin(t.current * 13.1 + 1.7) * 0.3 +
      Math.sin(t.current * 23.7 + 0.4) * 0.2;
    if (lightRef.current) lightRef.current.intensity = 11.5 * (0.84 + 0.16 * n);
  });

  return (
    <group position={[-1.32, 0, -1.25]} rotation={[0, 0.55, 0]}>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.78, 0.76, 0.66]} />
        <meshStandardMaterial color="#241d19" roughness={0.95} />
      </mesh>
      {/* 炭床 */}
      <mesh position={[0, 0.775, 0]}>
        <boxGeometry args={[0.44, 0.05, 0.36]} />
        <meshStandardMaterial
          color="#d9500e"
          emissive="#ff7a22"
          emissiveIntensity={1.9}
          roughness={1}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.92, 0]}
        color="#ff7320"
        intensity={11.5}
        distance={8.5}
        decay={2}
      />
    </group>
  );
}
