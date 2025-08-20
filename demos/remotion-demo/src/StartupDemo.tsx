import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

export const StartupDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 10, stiffness: 100 }
  });

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{ transform: `scale(${scale})`, textAlign: 'center' }}>
        <h1 style={{ fontSize: 60, color: 'white', marginBottom: 20 }}>
          Startup Deployment
        </h1>
        <p style={{ fontSize: 28, color: 'white', marginBottom: 40 }}>
          Deploy BCCE in under 30 minutes
        </p>
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          padding: 20,
          borderRadius: 10,
          fontFamily: 'monospace',
          fontSize: 20,
        }}>
          <div>1. ./deploy-layered-integration.sh</div>
          <div>2. Configure Direct Cognito</div>
          <div>3. Onboard developers</div>
          <div>4. Start building!</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
