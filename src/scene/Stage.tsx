/** 鍛打工位的場景組裝。 */
import { useRef } from 'react';
import type { Mesh } from 'three';
import { Anvil } from './Anvil';
import { Forge } from './Forge';
import { Room } from './Room';
import { StrikeRig } from './StrikeRig';
import { WorkpieceMesh } from './WorkpieceMesh';
import { STATION_POS, STATION_YAW } from './layout';
import type { Session } from '../state/session';

export function Stage({ session }: { session: Session }) {
  const barRef = useRef<Mesh>(null);
  return (
    <>
      <color attach="background" args={['#07050a']} />
      <Room />
      <Forge forge={session.forge} />
      <group position={STATION_POS} rotation={[0, STATION_YAW, 0]}>
        <Anvil />
      </group>
      {/*
        工件掛在場景根部，不在鐵砧底下。第 1 刀之後它要在砧與爐之間移動，
        姿態由 scene/stations.ts 直接算世界座標（見 StrikeRig）。
      */}
      <WorkpieceMesh wp={session.wp} barRef={barRef} />
      <StrikeRig session={session} barRef={barRef} />
    </>
  );
}

