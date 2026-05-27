import React from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Layers,
  Image, Type, Square, ChevronUp, ChevronDown,
  Sparkles
} from 'lucide-react';
import type { FabricLayer } from './FabricCanvas';
import type { SponsorLogo } from '../types';

interface AssetsLayersPanelProps {
  layers: FabricLayer[];
  selectedLayerId: string | null;
  onLayerSelect: (id: string) => void;
  onToggleVisibility: (id: string, currentVisible: boolean) => void;
  onToggleLock: (id: string, currentLocked: boolean) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  style?: React.CSSProperties;
  logos?: SponsorLogo[];
  onAddLogoToCanvas?: (url: string, name: string) => void;
  onNavigateToBrief?: () => void;
}

const TypeIcon: React.FC<{ type: FabricLayer['type'] }> = ({ type }) => {
  if (type === 'text') return <Type size={12} style={{ color: '#7c3aed' }} />;
  if (type === 'image') return <Image size={12} style={{ color: '#f5a623' }} />;
  if (type === 'shape') return <Square size={12} style={{ color: '#0070f3' }} />;
  return <Layers size={12} style={{ color: 'var(--text-disabled)' }} />;
};

export const AssetsLayersPanel: React.FC<AssetsLayersPanelProps> = ({
  layers,
  selectedLayerId,
  onLayerSelect,
  onToggleVisibility,
  onToggleLock,
  onBringForward,
  onSendBackward,
  style,
  logos = [],
  onAddLogoToCanvas,
  onNavigateToBrief,
}) => {
  const [logosExpanded, setLogosExpanded] = React.useState(true);
  const [layersExpanded, setLayersExpanded] = React.useState(true);

  return (
    <aside className="layers-sidebar" style={style}>
      {/* ── Collapsible Sponsor Logos Section ── */}
      <div className="assets-section">
        <div 
          className="assets-section-header" 
          onClick={() => setLogosExpanded(!logosExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Image size={13} style={{ color: 'var(--accent-blue)' }} />
            <span>Sponsor Graphics</span>
            {logos.length > 0 && (
              <span className="assets-count-badge">{logos.length}</span>
            )}
          </div>
          {logosExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </div>

        {logosExpanded && (
          <>
            {logos.length === 0 ? (
              <div className="logo-assets-empty">
                No logo assets loaded. 
                <br />
                <button 
                  className="logo-assets-link-btn" 
                  onClick={onNavigateToBrief}
                >
                  Upload in Brief Spec
                </button>
              </div>
            ) : (
              <div className="logo-assets-grid">
                {logos.map((logo) => (
                  <div
                    key={logo.id}
                    className="logo-asset-card"
                    onClick={() => onAddLogoToCanvas?.(logo.url, logo.name)}
                    title="Click to place on canvas"
                  >
                    <div className="logo-asset-thumb">
                      {logo.url ? <img src={logo.url} alt={logo.name} /> : 'IMG'}
                    </div>
                    <div className="logo-asset-info">
                      <span className="logo-asset-name">{logo.name}</span>
                      <span className={`logo-asset-resolution ${logo.resolutionStatus}`}>
                        {logo.dpi} DPI
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Collapsible Layers Section ── */}
      <div 
        className="assets-section-header" 
        onClick={() => setLayersExpanded(!layersExpanded)}
        style={{ borderBottom: '1px solid #15151f' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} style={{ color: 'var(--accent-blue)' }} />
          <span>Layers</span>
          {layers.length > 0 && (
            <span className="assets-count-badge">{layers.length}</span>
          )}
        </div>
        {layersExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </div>

      {layersExpanded && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Layer count info bar */}
          {layers.length > 0 && (
            <div className="layers-count-bar">
              {layers.length} object{layers.length !== 1 ? 's' : ''} on canvas
            </div>
          )}

          {/* Empty State */}
          {layers.length === 0 && (
            <div className="layers-empty-state">
              <Sparkles size={24} style={{ color: 'var(--text-disabled)', opacity: 0.4 }} />
              <div className="layers-empty-title">No layers yet</div>
              <div className="layers-empty-sub">
                Use the toolbar to add text, shapes, or logos to the canvas.
              </div>
            </div>
          )}

          {/* Layer List */}
          {layers.length > 0 && (
            <div className="layer-list">
              {layers.map((layer, idx) => {
                const isSelected = selectedLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    className={`layer-item ${isSelected ? 'active' : ''} ${!layer.visible ? 'hidden-layer' : ''}`}
                    onClick={() => onLayerSelect(layer.id)}
                  >
                    {/* Type Icon */}
                    <div className="layer-type-icon">
                      <TypeIcon type={layer.type} />
                    </div>

                    {/* Layer Name */}
                    <div className="layer-item-name">
                      {layer.name}
                      {layer.locked && (
                        <span className="layer-locked-badge">Locked</span>
                      )}
                    </div>

                    {/* Layer Actions */}
                    <div className="layer-item-actions">
                      <button
                        className="layer-action-btn"
                        title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                        onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id, layer.visible); }}
                      >
                        {layer.visible ? <Eye size={11} /> : <EyeOff size={11} className="active" />}
                      </button>
                      <button
                        className="layer-action-btn"
                        title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                        onClick={e => { e.stopPropagation(); onToggleLock(layer.id, layer.locked); }}
                      >
                        {layer.locked ? <Lock size={11} className="active" /> : <Unlock size={11} />}
                      </button>
                      <button
                        className="layer-action-btn"
                        title="Bring Forward"
                        onClick={e => { e.stopPropagation(); onBringForward(layer.id); }}
                        disabled={idx === 0}
                      >
                        <ChevronUp size={11} />
                      </button>
                      <button
                        className="layer-action-btn"
                        title="Send Backward"
                        onClick={e => { e.stopPropagation(); onSendBackward(layer.id); }}
                        disabled={idx === layers.length - 1}
                      >
                        <ChevronDown size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
