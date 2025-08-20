import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  Audio,
} from 'remotion';

// Main demo composition
export const BCCEDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#0F172A' }}>
      {/* Title Scene */}
      <Sequence from={0} durationInFrames={90}>
        <TitleScene />
      </Sequence>

      {/* Architecture Overview */}
      <Sequence from={90} durationInFrames={120}>
        <ArchitectureScene />
      </Sequence>

      {/* Identity Provider Options */}
      <Sequence from={210} durationInFrames={120}>
        <IdentityProvidersScene />
      </Sequence>

      {/* Developer Onboarding Flow */}
      <Sequence from={330} durationInFrames={150}>
        <OnboardingFlowScene />
      </Sequence>

      {/* Governance Features */}
      <Sequence from={480} durationInFrames={120}>
        <GovernanceScene />
      </Sequence>

      {/* Success Metrics */}
      <Sequence from={600} durationInFrames={90}>
        <MetricsScene />
      </Sequence>

      {/* Call to Action */}
      <Sequence from={690} durationInFrames={60}>
        <CallToActionScene />
      </Sequence>
    </AbsoluteFill>
  );
};

// Title scene with animated text
const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const titleScale = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 10,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const subtitleOpacity = interpolate(
    frame,
    [20, 40],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{
      backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        transform: `scale(${titleScale})`,
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: 80,
          fontWeight: 'bold',
          color: 'white',
          marginBottom: 20,
          fontFamily: 'Inter, sans-serif',
        }}>
          BCCE Enterprise Integration
        </h1>
        <p style={{
          fontSize: 32,
          color: 'rgba(255, 255, 255, 0.9)',
          opacity: subtitleOpacity,
          fontFamily: 'Inter, sans-serif',
        }}>
          AWS Solutions Library + Enterprise Governance
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Architecture visualization
const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const layerPositions = [
    { y: 100, label: 'BCCE Governance Layer', color: '#10B981' },
    { y: 250, label: 'Identity Integration', color: '#3B82F6' },
    { y: 400, label: 'AWS Solutions Library', color: '#8B5CF6' },
  ];

  return (
    <AbsoluteFill style={{
      backgroundColor: '#1E293B',
      padding: 50,
    }}>
      <h2 style={{
        fontSize: 48,
        color: 'white',
        textAlign: 'center',
        marginBottom: 50,
        fontFamily: 'Inter, sans-serif',
      }}>
        Layered Architecture
      </h2>
      
      {layerPositions.map((layer, index) => {
        const slideIn = interpolate(
          frame,
          [index * 20, index * 20 + 30],
          [-1000, 0],
          { extrapolateRight: 'clamp' }
        );
        
        return (
          <div
            key={layer.label}
            style={{
              position: 'absolute',
              top: layer.y,
              left: 100,
              right: 100,
              height: 100,
              backgroundColor: layer.color,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translateX(${slideIn}px)`,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{
              fontSize: 28,
              color: 'white',
              fontWeight: 'bold',
              fontFamily: 'Inter, sans-serif',
            }}>
              {layer.label}
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Identity providers showcase
const IdentityProvidersScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const providers = [
    { name: 'Active Directory', usage: '85%', icon: '🏢' },
    { name: 'AWS Identity Center', usage: '40%', icon: '☁️' },
    { name: 'Google Workspace', usage: '30%', icon: '📧' },
    { name: 'Azure AD', usage: '60%', icon: '🔷' },
    { name: 'Okta', usage: '25%', icon: '🔐' },
    { name: 'Direct Cognito', usage: '15%', icon: '🎯' },
  ];

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0F172A',
      padding: 50,
    }}>
      <h2 style={{
        fontSize: 48,
        color: 'white',
        textAlign: 'center',
        marginBottom: 50,
        fontFamily: 'Inter, sans-serif',
      }}>
        Enterprise Identity Support
      </h2>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 30,
        padding: '0 100px',
      }}>
        {providers.map((provider, index) => {
          const scale = spring({
            frame: frame - index * 5,
            fps: 30,
            from: 0,
            to: 1,
            config: {
              damping: 10,
              stiffness: 100,
            },
          });
          
          return (
            <div
              key={provider.name}
              style={{
                backgroundColor: '#1E293B',
                borderRadius: 15,
                padding: 30,
                transform: `scale(${scale})`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 10 }}>
                {provider.icon}
              </div>
              <h3 style={{
                fontSize: 24,
                color: 'white',
                marginBottom: 10,
                fontFamily: 'Inter, sans-serif',
              }}>
                {provider.name}
              </h3>
              <p style={{
                fontSize: 20,
                color: '#10B981',
                fontWeight: 'bold',
                fontFamily: 'Inter, sans-serif',
              }}>
                {provider.usage} of enterprises
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Developer onboarding flow animation
const OnboardingFlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const steps = [
    'Deploy Infrastructure',
    'Configure Identity Provider',
    'Onboard Developer',
    'Set Department & Budget',
    'Grant Model Access',
    'Ready to Code!',
  ];

  return (
    <AbsoluteFill style={{
      backgroundColor: '#1E293B',
      padding: 50,
    }}>
      <h2 style={{
        fontSize: 48,
        color: 'white',
        textAlign: 'center',
        marginBottom: 50,
        fontFamily: 'Inter, sans-serif',
      }}>
        Simple Onboarding Flow
      </h2>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        {steps.map((step, index) => {
          const progress = interpolate(
            frame,
            [index * 20, index * 20 + 20],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          
          return (
            <div
              key={step}
              style={{
                display: 'flex',
                alignItems: 'center',
                opacity: progress,
                transform: `translateX(${(1 - progress) * 100}px)`,
              }}
            >
              <div style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                backgroundColor: progress === 1 ? '#10B981' : '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 20,
              }}>
                <span style={{
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: 24,
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {index + 1}
                </span>
              </div>
              <span style={{
                fontSize: 28,
                color: 'white',
                fontFamily: 'Inter, sans-serif',
              }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Governance features visualization
const GovernanceScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const features = [
    { title: 'Budget Control', value: '$32,000/month', trend: '↓ 20%' },
    { title: 'Active Users', value: '180 developers', trend: '↑ 15%' },
    { title: 'Compliance', value: '100% SOC2', trend: '✓' },
    { title: 'Cost Savings', value: '30% reduced', trend: '↓' },
  ];

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0F172A',
      padding: 50,
    }}>
      <h2 style={{
        fontSize: 48,
        color: 'white',
        textAlign: 'center',
        marginBottom: 50,
        fontFamily: 'Inter, sans-serif',
      }}>
        Enterprise Governance Dashboard
      </h2>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 30,
        padding: '0 100px',
      }}>
        {features.map((feature, index) => {
          const slideUp = interpolate(
            frame,
            [index * 10, index * 10 + 20],
            [100, 0],
            { extrapolateRight: 'clamp' }
          );
          
          return (
            <div
              key={feature.title}
              style={{
                backgroundColor: '#1E293B',
                borderRadius: 15,
                padding: 30,
                transform: `translateY(${slideUp}px)`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              }}
            >
              <h3 style={{
                fontSize: 24,
                color: '#94A3B8',
                marginBottom: 10,
                fontFamily: 'Inter, sans-serif',
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: 36,
                color: 'white',
                fontWeight: 'bold',
                marginBottom: 5,
                fontFamily: 'Inter, sans-serif',
              }}>
                {feature.value}
              </p>
              <span style={{
                fontSize: 20,
                color: '#10B981',
                fontFamily: 'Inter, sans-serif',
              }}>
                {feature.trend}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Success metrics display
const MetricsScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const metrics = [
    { label: 'Deployment Time', value: '< 30 minutes' },
    { label: 'Identity Providers', value: '6 supported' },
    { label: 'Test Success Rate', value: '100%' },
    { label: 'Enterprise Ready', value: 'YES ✓' },
  ];

  const progress = interpolate(frame, [0, 30], [0, 1]);

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: 50,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontSize: 56,
          color: 'white',
          marginBottom: 50,
          fontFamily: 'Inter, sans-serif',
        }}>
          Production Ready
        </h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 30,
          maxWidth: 800,
        }}>
          {metrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 15,
                padding: 30,
                backdropFilter: 'blur(10px)',
                transform: `scale(${progress})`,
              }}
            >
              <p style={{
                fontSize: 20,
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: 10,
                fontFamily: 'Inter, sans-serif',
              }}>
                {metric.label}
              </p>
              <p style={{
                fontSize: 32,
                color: 'white',
                fontWeight: 'bold',
                fontFamily: 'Inter, sans-serif',
              }}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Call to action
const CallToActionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = spring({
    frame,
    fps: 30,
    from: 0,
    to: 1,
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0F172A',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        textAlign: 'center',
        transform: `scale(${scale})`,
      }}>
        <h1 style={{
          fontSize: 64,
          color: 'white',
          marginBottom: 30,
          fontFamily: 'Inter, sans-serif',
        }}>
          Deploy Today
        </h1>
        <p style={{
          fontSize: 28,
          color: '#10B981',
          marginBottom: 40,
          fontFamily: 'Inter, sans-serif',
        }}>
          Enterprise Claude Code with Full Governance
        </p>
        <div style={{
          fontSize: 24,
          color: '#94A3B8',
          fontFamily: 'monospace',
          backgroundColor: '#1E293B',
          padding: 20,
          borderRadius: 10,
          display: 'inline-block',
        }}>
          ./deploy-layered-integration.sh --organization "YourCompany"
        </div>
      </div>
    </AbsoluteFill>
  );
};