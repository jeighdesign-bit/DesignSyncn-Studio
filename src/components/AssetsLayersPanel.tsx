import React from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Layers,
  Image, Type, Square, ChevronUp, ChevronDown,
  Sparkles
} from 'lucide-react';
import type { FabricLayer } from './FabricCanvas';

interface AssetsLayersPanelProps {
  layers: FabricLayer[];
  selectedLayerId: string | null;
  onLayerSelect: (id: string) => void;
  onToggleVisibility: (id: string, currentVisible: boolean) => void;
  onToggleLock: (id: string, currentLocked: boolean) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  style?: React.CSSProperties;
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
}) => {
  return (
    <aside className="layers-sidebar" style={style}>
      {/* Header */}
      <div className="layers-sidebar-title">
        <span>Layers</span>
        <Layers size={12} style={{ color: 'var(--accent-blue)' }} />
      </div>

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
    </aside>
  );
};
