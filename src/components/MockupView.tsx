import React, { useState } from 'react';
import type { Project } from '../types';
import { Layers, Lightbulb, Eye } from 'lucide-react';

interface MockupViewProps {
  project: Project;
}

export const MockupView: React.FC<MockupViewProps> = ({ project }) => {
  const [viewAngle, setViewAngle] = useState<'front' | 'back' | 'perspective'>('front');
  const [material, setMaterial] = useState<'mesh' | 'poly' | 'spandex'>('mesh');
  const [lighting, setLighting] = useState<'studio' | 'dramatic' | 'warehouse'>('studio');

  const { baseColors, prompt, selectedPresetId, logos } = project;

  // Render simulated sublimation design patterns on 3D view
  const getSublimationStyle = () => {
    // Generate complex design pattern depending on parameters
    return {
      background: `linear-gradient(135deg, ${baseColors.primary} 0%, ${baseColors.secondary} 50%, ${baseColors.accent} 100%)`,
    };
  };

  // Creases overlay SVG to simulate fabrics
  const getShadingStyle = () => {
    if (lighting === 'dramatic') {
      return 'rgba(0,0,0,0.8)';
    } else if (lighting === 'warehouse') {
      return 'rgba(255,255,255,0.05)';
    }
    return 'none';
  };

  return (
    <div className="mockup-canvas-viewport">
      {/* 3D Environment Stage Wrapper */}
      <div
        style={{
          position: 'relative',
          width: '420px',
          height: '420px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          perspective: '1200px',
        }}
      >
        {/* Soft Shadow Base */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            width: '260px',
            height: '24px',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, transparent 70%)',
            filter: 'blur(8px)',
            transform: 'rotateX(85deg)',
            zIndex: 1,
          }}
        />

        {/* 3D Model Outer Frame */}
        <div
          style={{
            position: 'relative',
            width: '320px',
            height: '360px',
            transform: viewAngle === 'perspective' ? 'rotateY(25deg) rotateX(5deg)' : 'none',
            transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 2,
          }}
        >
          {/* Main Jersey Canvas Texture */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              ...getSublimationStyle(),
              clipPath: 'polygon(15% 15%, 26% 8%, 50% 12%, 74% 8%, 85% 15%, 92% 38%, 81% 40%, 82% 95%, 18% 95%, 19% 40%, 8% 38%)',
              boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
            }}
          >
            {/* Dynamic Preset Layer */}
            {(prompt || selectedPresetId) && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.3,
                  backgroundImage: `
                    repeating-linear-gradient(45deg, transparent, transparent 15px, ${baseColors.accent} 15px, ${baseColors.accent} 30px),
                    radial-gradient(circle at 50% 50%, ${baseColors.highlight} 0%, transparent 60%)
                  `,
                  mixBlendMode: 'overlay',
                }}
              />
            )}

            {/* Mesh Texture Overlay */}
            {material === 'mesh' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.15,
                  backgroundImage: 'radial-gradient(circle, #fff 25%, transparent 26%)',
                  backgroundSize: '3px 3px',
                  mixBlendMode: 'overlay',
                }}
              />
            )}

            {/* Poly Spandex Glow */}
            {material === 'spandex' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.12,
                  background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.4) 50%, transparent)',
                  transform: 'skewX(-20deg) scale(1.5)',
                  mixBlendMode: 'screen',
                }}
              />
            )}

            {/* Graphic Logos mapping (FRONT VIEW ONLY) */}
            {viewAngle !== 'back' && logos.map((logo) => {
              // position rules mapped
              const logoTop = 32 + project.rules.frontLogoSpacingCollarInches * 2;
              return (
                <div
                  key={logo.id}
                  style={{
                    position: 'absolute',
                    top: `${logoTop}%`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: `${logo.sizeInches * 12}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 4,
                  }}
                >
                  {logo.url ? (
                    <img src={logo.url} alt={logo.name} style={{ width: '100%', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
                  ) : (
                    <div style={{
                      fontWeight: 800,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: baseColors.highlight,
                      letterSpacing: '0.08em',
                      textShadow: '0 2px 4px rgba(0,0,0,0.6)',
                    }}>
                      {logo.name}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Back names mapping (BACK VIEW ONLY) */}
            {viewAngle === 'back' && (
              <div
                style={{
                  position: 'absolute',
                  top: `${20 + project.rules.surnameSpacingCollarInches * 2.2}%`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '80%',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{
                  fontSize: `${project.rules.playerNameHeightInches * 4.5}px`,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: baseColors.highlight,
                  lineHeight: 1,
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  whiteSpace: 'nowrap',
                }}>
                  {project.roster[0]?.name || 'PLAYER'}
                </div>
                <div style={{
                  fontSize: `${project.rules.playerNumberHeightInches * 7}px`,
                  fontWeight: 900,
                  color: baseColors.highlight,
                  marginTop: '6px',
                  fontFamily: 'Outfit',
                  textShadow: '0 3px 6px rgba(0,0,0,0.9)',
                }}>
                  {project.roster[0]?.number || '99'}
                </div>
              </div>
            )}

            {/* Realistic Creases & Shadow Overlay */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: lighting === 'dramatic' ? 0.6 : 0.45,
                mixBlendMode: 'multiply',
                pointerEvents: 'none',
              }}
            >
              {/* Armhole shadows */}
              <path d="M 15,15 C 20,30 20,50 18,95" fill="none" stroke="black" strokeWidth="2.5" />
              <path d="M 85,15 C 80,30 80,50 82,95" fill="none" stroke="black" strokeWidth="2.5" />
              {/* Collar shadow */}
              <path d="M 26,8 C 35,20 65,20 74,8" fill="none" stroke="black" strokeWidth="3" />
              {/* Fabric creases */}
              <path d="M 20,40 C 35,45 50,38 80,42" fill="none" stroke="black" strokeWidth="1.2" opacity="0.7" />
              <path d="M 15,75 C 30,72 60,82 85,78" fill="none" stroke="black" strokeWidth="1" opacity="0.6" />
              <path d="M 50,12 C 48,40 52,70 50,95" fill="none" stroke="black" strokeWidth="1" opacity="0.4" />
            </svg>

            {/* Realistic Light Hilite Overlay */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: lighting === 'studio' ? 0.35 : 0.2,
                mixBlendMode: 'overlay',
                pointerEvents: 'none',
              }}
            >
              <path d="M 26,8 C 22,25 22,45 20,90" fill="none" stroke="white" strokeWidth="2.5" />
              <path d="M 45,15 C 47,40 45,70 48,90" fill="none" stroke="white" strokeWidth="1.5" />
            </svg>

            {/* Extra environment colors */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: getShadingStyle(),
              mixBlendMode: 'overlay',
              pointerEvents: 'none'
            }}/>
          </div>
        </div>
      </div>

      {/* 3D Mockup Inspector Drawer Floating panel */}
      <div className="mockup-controls">
        <div className="mockup-controls-group">
          <Eye size={12} />
          <span>Camera:</span>
          <select value={viewAngle} onChange={(e) => setViewAngle(e.target.value as any)}>
            <option value="front">Front View</option>
            <option value="back">Back View</option>
            <option value="perspective">Perspective Angled</option>
          </select>
        </div>

        <div className="mockup-controls-group">
          <Layers size={12} />
          <span>Weave:</span>
          <select value={material} onChange={(e) => setMaterial(e.target.value as any)}>
            <option value="mesh">Esports Interlock Mesh</option>
            <option value="poly">Polyester Interlock</option>
            <option value="spandex">Poly-Spandex Blend</option>
          </select>
        </div>

        <div className="mockup-controls-group">
          <Lightbulb size={12} />
          <span>Lighting:</span>
          <select value={lighting} onChange={(e) => setLighting(e.target.value as any)}>
            <option value="studio">Studio Clean</option>
            <option value="dramatic">Dramatic Dark Mode</option>
            <option value="warehouse">Warehouse Bright</option>
          </select>
        </div>
      </div>
    </div>
  );
};
