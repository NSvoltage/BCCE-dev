import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

export const EnterpriseDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  
  const features = [
    'Active Directory Integration',
    'Multi-Department Access Control',
    'Budget Enforcement',
    'Compliance Automation',
    'Cross-Region Deployment'
  ];

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0F172A',
      padding: 50,
    }}>
      <h1 style={{
        fontSize: 56,
        color: 'white',
        textAlign: 'center',
        marginBottom: 50,
        opacity,
      }}>
        Enterprise Features
      </h1>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {features.map((feature, i) => {
          const featureOpacity = interpolate(
            frame,
            [30 + i * 10, 30 + i * 10 + 10],
            [0, 1],
            { extrapolateRight: 'clamp' }
          );
          
          return (
            <div
              key={feature}
              style={{
                backgroundColor: '#1E293B',
                padding: 20,
                marginBottom: 15,
                borderRadius: 10,
                opacity: featureOpacity,
                borderLeft: '4px solid #10B981',
              }}
            >
              <span style={{ fontSize: 24, color: 'white' }}>
                ✓ {feature}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
