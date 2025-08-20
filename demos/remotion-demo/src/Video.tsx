import { Composition } from 'remotion';
import { BCCEDemo } from './BCCEDemo';
import { StartupDemo } from './StartupDemo';
import { EnterpriseDemo } from './EnterpriseDemo';

export const RemotionVideo: React.FC = () => {
  return (
    <>
      <Composition
        id="BCCEDemo"
        component={BCCEDemo}
        durationInFrames={750}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="StartupDemo"
        component={StartupDemo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="EnterpriseDemo"
        component={EnterpriseDemo}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
