/**
 * 第 0 刀：3D 揮錘測試台。
 *
 * 要驗的四件事寫在 `07_3D 化設計與技術選型.md` 第七節：
 *   1. 落點散布不比 2D 版差
 *   2. 收手判定可靠
 *   3. 連續翻轉打得出八角，而且看得懂現在幾度
 *   4. 爐火為唯一光源時，暗櫻桃紅與櫻桃紅分得出來
 */
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Stage } from './scene/Stage';
import { EYE } from './scene/layout';
import { Hud } from './ui/Hud';
import { createSession } from './state/session';

export function App() {
  const session = useMemo(() => createSession(), []);

  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        // preserveDrawingBuffer 讓畫布可以被 toDataURL 取樣。
        // 判色那條驗收（07 第七節第 4 條）不能靠眼睛看截圖決定，
        // 要能直接量兩個溫度算出來的像素差多少。順便也能截圖存檔。
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: EYE, fov: 52, near: 0.02, far: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.22;
        }}
      >
        <Stage session={session} />
      </Canvas>
      <Hud session={session} />
    </div>
  );
}
