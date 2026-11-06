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
      <Forge />
      <group position={STATION_POS} rotation={[0, STATION_YAW, 0]}>
        <Anvil />
        <WorkpieceMesh wp={session.wp} barRef={barRef} />
      </group>
      <StrikeRig session={session} barRef={barRef} />
    </>
  );
}
