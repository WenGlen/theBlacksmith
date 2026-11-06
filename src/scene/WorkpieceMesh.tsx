/**
 * 工件網格。
 *
 * 每幀把 Workpiece 的脊線與斷面寫進 BufferGeometry，
 * 幾何只在 version 變了才重算，顏色每幀都更新（料一直在降溫）。
 *
 * 鐵律（07 第六節）：這裡一行 React state 都沒有，全部直接改 attribute。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  VERT_COUNT,
  buildIndices,
  writeHeatColors,
  writePositions,
} from '../game/workpiece/geometry';
import type { Workpiece } from '../game/workpiece/workpiece';

interface Props {
  wp: Workpiece;
  barRef: React.RefObject<THREE.Mesh | null>;
}

export function WorkpieceMesh({ wp, barRef }: Props) {
  const lastVersion = useRef(-1);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(VERT_COUNT * 3), 3),
    );
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERT_COUNT * 3), 3));
    g.setIndex(new THREE.BufferAttribute(buildIndices(), 1));
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      // 底色壓暗，讓畫面上的顏色主要來自自發光而不是反射。
      // 熱鐵本來就是自己在發光，反射率不高；底色一亮，
      // 漫射加上自發光就會一起爆掉，中高溫全部洗成米白。
      color: new THREE.Color(0x4a4540),
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.5,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1,
    });
    // 自發光強度由頂點顏色的亮度決定，取 pow 讓冷鐵真的不發光。
    // 這樣「暗櫻桃紅」跟「櫻桃紅」的差別是真的亮度差，不是貼上去的。
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float heatK = max(max(vColor.r, vColor.g), vColor.b);
         totalEmissiveRadiance *= vColor.rgb * pow(heatK, 2.7) * 0.92;`,
      );
    };
    m.customProgramCacheKey = () => 'heatbar';
    return m;
  }, []);

  useFrame(() => {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = geometry.getAttribute('color') as THREE.BufferAttribute;

    if (wp.version !== lastVersion.current) {
      writePositions(wp, pos.array as Float32Array);
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      lastVersion.current = wp.version;
    }

    writeHeatColors(wp, col.array as Float32Array);
    col.needsUpdate = true;
  });

  return <mesh ref={barRef} geometry={geometry} material={material} castShadow />;
}
