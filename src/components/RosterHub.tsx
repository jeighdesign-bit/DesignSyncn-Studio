import React, { useState } from 'react';
import type { RosterPlayer, Project } from '../types';
import { 
  Upload, Plus, Trash2, 
  AlertTriangle, CheckCircle2, Users, ShieldAlert, Award, Cpu
} from 'lucide-react';

interface RosterHubProps {
  project: Project;
  onUpdateRoster: (roster: RosterPlayer[]) => void;
  onSelectPlayer: (id: string) => void;
}

export const RosterHub: React.FC<RosterHubProps> = ({
  project,
  onUpdateRoster,
  onSelectPlayer,
}) => {
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newSize, setNewSize] = useState<'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL'>('M');
  const [newVariant, setNewVariant] = useState<'Variant A' | 'Variant B' | 'Variant C'>('Variant A');

  // Bulk add states
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Auto Font Scaling rule
  const calculateScale = (name: string): number => {
    if (!name) return 1.0;
    const len = name.trim().length;
    if (len <= 8) return 1.0;
    return Math.max(0.4, Math.min(1.0, 8 / len));
  };

  const handleAddPlayer = () => {
    if (!newName.trim() || !newNumber.trim()) return;
    
    const newPlayer: RosterPlayer = {
      id: Date.now().toString(),
      name: newName.trim().toUpperCase(),
      number: newNumber.trim(),
      size: newSize,
      nameScale: calculateScale(newName),
      variant: newVariant,
      status: 'Mapped'
    };

    const updated = [...project.roster, newPlayer];
    onUpdateRoster(updated);
    onSelectPlayer(newPlayer.id);

    // Reset inputs
    setNewName('');
    setNewNumber('');
  };

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    
    const lines = bulkText.split('\n');
    const newPlayers: RosterPlayer[] = [];
    
    lines.forEach((line, index) => {
      const clean = line.trim();
      if (!clean) return;
      
      const match = clean.match(/^(.+?)(?:\s+|,|-)+(\d+)$/);
      let name = clean;
      let num = '';
      
      if (match) {
        name = match[1].trim();
        num = match[2].trim();
      } else {
        const digits = clean.match(/\d+/);
        if (digits) {
          num = digits[0];
          name = clean.replace(num, '').trim();
        } else {
          num = (project.roster.length + newPlayers.length + 1).toString();
        }
      }
      
      if (!name) name = `PLAYER ${project.roster.length + newPlayers.length + 1}`;
      
      newPlayers.push({
        id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`,
        name: name.toUpperCase(),
        number: num,
        size: 'M',
        nameScale: calculateScale(name),
        variant: 'Variant A',
        status: 'Mapped'
      });
    });
    
    if (newPlayers.length > 0) {
      const updated = [...project.roster, ...newPlayers];
      onUpdateRoster(updated);
      onSelectPlayer(newPlayers[0].id);
    }
    
    setBulkText('');
    setShowBulkAdd(false);
  };

  const handleDeletePlayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = project.roster.filter(p => p.id !== id);
    onUpdateRoster(updated);
    
    if (project.activePlayerId === id && updated.length > 0) {
      onSelectPlayer(updated[0].id);
    }
  };

  const handleFieldChange = (id: string, field: keyof RosterPlayer, value: any) => {
    const updated = project.roster.map(p => {
      if (p.id === id) {
        const updatedPlayer = { ...p, [field]: value };
        if (field === 'name') {
          updatedPlayer.name = value.toUpperCase();
          updatedPlayer.nameScale = calculateScale(value);
        }
        return updatedPlayer;
      }
      return p;
    });
    onUpdateRoster(updated);
  };

  const handleImportPreset = () => {
    const presetPlayers: RosterPlayer[] = [
      { id: 'roster-1', name: 'JAY', number: '7', size: 'M', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' },
      { id: 'roster-2', name: 'MARK', number: '10', size: 'L', nameScale: 1.0, variant: 'Variant B', status: 'Ready for Export' },
      { id: 'roster-3', name: 'LEX', number: '23', size: 'S', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' },
      { id: 'roster-4', name: 'ALEXANDER', number: '99', size: 'XXL', nameScale: calculateScale('ALEXANDER'), variant: 'Variant C', status: 'Ready for Export' },
      { id: 'roster-5', name: 'RODRIGUEZ', number: '14', size: 'XS', nameScale: calculateScale('RODRIGUEZ'), variant: 'Variant B', status: 'Mapped' }
    ];
    onUpdateRoster(presetPlayers);
    onSelectPlayer(presetPlayers[0].id);
  };

  const getValidationWarning = (player: RosterPlayer) => {
    if (player.name.length > 12 && (player.size === 'XS' || player.size === 'S')) {
      return 'Overflow limits';
    }
    if (player.nameScale < 0.6) {
      return 'Extreme Compress';
    }
    if (!player.number || isNaN(Number(player.number))) {
      return 'Invalid Number';
    }
    return null;
  };

  const conflictsCount = project.roster.filter(p => getValidationWarning(p) !== null).length;
  const readyCount = project.roster.filter(p => p.status === 'Ready for Export').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px', background: 'transparent' }}>
      
      {/* ── AI PRODUCTION HUD CARD ── */}
      <div className="ai-hud-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="ai-hud-icon-wrap">
            <Cpu size={14} className="spinning-ai-engine" />
          </div>
          <div>
            <div className="ai-hud-title">AI Production Engine</div>
            <div className="ai-hud-subtitle">Active Autonomic Layouts</div>
          </div>
        </div>
        <div className="ai-hud-divider" />
        <ul className="ai-hud-list">
          <li>
            <span className="bullet">✓</span>
            <span>Auto Placement (Chest & Seam bounds): <strong>ON</strong></span>
          </li>
          <li>
            <span className="bullet">✓</span>
            <span>Dynamic proportional scaling per size: <strong>ON</strong></span>
          </li>
          <li>
            <span className="bullet">✓</span>
            <span>Sublimation bleed/safety zone offset: <strong>AUTO</strong></span>
          </li>
        </ul>
      </div>

      {/* ── STATS DASHBOARD ── */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div className="roster-stat-badge">
          <Users size={11} style={{ color: 'var(--accent-blue)' }} />
          <span>{project.roster.length} Plrs</span>
        </div>
        <div className={`roster-stat-badge ${conflictsCount > 0 ? 'warning' : 'success'}`}>
          {conflictsCount > 0 ? <ShieldAlert size={11} /> : <CheckCircle2 size={11} />}
          <span>{conflictsCount} Warns</span>
        </div>
        <div className="roster-stat-badge purple">
          <Award size={11} />
          <span>{readyCount} Ready</span>
        </div>
      </div>

      {/* ── DATABASE ACTIONS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <button 
          className="inspector-btn-toggle" 
          onClick={() => setShowBulkAdd(!showBulkAdd)}
          style={{ fontSize: '10px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: showBulkAdd ? 'rgba(0,112,243,0.1)' : 'var(--bg-secondary)', border: '1px solid var(--border-muted)', color: showBulkAdd ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
        >
          <Plus size={10} /> Bulk Import
        </button>
        <button 
          className="inspector-btn-toggle" 
          onClick={handleImportPreset} 
          style={{ fontSize: '10px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', color: 'var(--text-secondary)' }}
        >
          <Upload size={10} /> Import CSV
        </button>
      </div>

      {/* Bulk Add Paste Area */}
      {showBulkAdd && (
        <div className="inspector-card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>Bulk Paste Roster</span>
            <span style={{ fontSize: '8px', color: 'var(--text-disabled)' }}>E.g. JAY 7</span>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`JAY 7\nMARK 10\nLEX 23`}
            rows={3}
            className="inspector-input-dark"
            style={{ width: '100%', fontSize: '11px', fontFamily: 'monospace', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              className="inspector-btn-toggle"
              onClick={() => { setShowBulkAdd(false); setBulkText(''); }}
              style={{ padding: '3px 8px', fontSize: '9px' }}
            >
              Cancel
            </button>
            <button
              className="inspector-btn-toggle"
              onClick={handleBulkAdd}
              style={{ padding: '3px 10px', fontSize: '9px', background: 'var(--accent-blue)', color: '#fff' }}
            >
              Load Roster
            </button>
          </div>
        </div>
      )}

      {/* ── QUICK ADD ROW ── */}
      <div className="inspector-card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Quick Add Player</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '6px' }}>
          <input
            type="text"
            placeholder="Surname"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="inspector-input-dark"
            style={{ fontSize: '11px', padding: '4px 6px' }}
          />
          <input
            type="text"
            placeholder="No."
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            className="inspector-input-dark"
            style={{ fontSize: '11px', padding: '4px 6px', textAlign: 'center' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <select
            value={newSize}
            onChange={(e) => setNewSize(e.target.value as any)}
            className="inspector-input-dark"
            style={{ fontSize: '11px', padding: '3px 4px' }}
          >
            <option value="XS">Size XS</option>
            <option value="S">Size S</option>
            <option value="M">Size M</option>
            <option value="L">Size L</option>
            <option value="XL">Size XL</option>
            <option value="XXL">Size 2XL</option>
            <option value="3XL">Size 3XL</option>
          </select>
          <select
            value={newVariant}
            onChange={(e) => setNewVariant(e.target.value as any)}
            className="inspector-input-dark"
            style={{ fontSize: '11px', padding: '3px 4px' }}
          >
            <option value="Variant A">Variant A</option>
            <option value="Variant B">Variant B</option>
            <option value="Variant C">Variant C</option>
          </select>
        </div>

        <button 
          onClick={handleAddPlayer} 
          className="inspector-btn-toggle"
          style={{ width: '100%', background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', padding: '5px 0', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
        >
          <Plus size={12} /> Add to Roster & Sync
        </button>
      </div>

      {/* ── PLAYER DATABASE LIST ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Player Variations</div>
        
        {project.roster.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-disabled)', padding: '20px 0', fontSize: '10px', border: '1px dashed var(--border-muted)', borderRadius: '6px' }}>
            No player variations configured.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto', paddingRight: '2px' }}>
            {project.roster.map((player) => {
              const isActive = project.activePlayerId === player.id;
              const scalePercent = Math.round(player.nameScale * 100);
              const warning = getValidationWarning(player);
              const isReady = player.status === 'Ready for Export';

              return (
                <div
                  key={player.id}
                  onClick={() => onSelectPlayer(player.id)}
                  className={`database-player-card ${isActive ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div className={`active-dot ${isActive ? 'active' : ''}`} />
                    
                    <input
                      type="text"
                      value={player.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleFieldChange(player.id, 'name', e.target.value)}
                      className="db-name-input"
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-disabled)' }}>#</span>
                      <input
                        type="text"
                        value={player.number}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleFieldChange(player.id, 'number', e.target.value)}
                        className="db-number-input"
                      />
                    </div>

                    <button 
                      onClick={(e) => handleDeletePlayer(player.id, e)}
                      className="db-trash-btn"
                      title="Delete Player"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                    <select
                      value={player.size}
                      onChange={(e) => handleFieldChange(player.id, 'size', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="db-select"
                      style={{ flex: 1 }}
                    >
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">2XL</option>
                      <option value="3XL">3XL</option>
                    </select>

                    <select
                      value={player.variant || 'Variant A'}
                      onChange={(e) => handleFieldChange(player.id, 'variant', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="db-select"
                      style={{ flex: 1.5 }}
                    >
                      <option value="Variant A">Variant A</option>
                      <option value="Variant B">Variant B</option>
                      <option value="Variant C">Variant C</option>
                    </select>

                    <span 
                      onClick={(e) => { e.stopPropagation(); handleFieldChange(player.id, 'status', isReady ? 'Mapped' : 'Ready for Export'); }}
                      className={`db-status-badge ${isReady ? 'ready' : 'mapped'}`}
                    >
                      {isReady ? 'Ready' : 'Mapped'}
                    </span>
                  </div>

                  <div style={{ marginTop: '3px' }}>
                    {warning ? (
                      <div className="db-warning-banner">
                        <AlertTriangle size={8} /> {warning}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '7.5px', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>AUTO-SCALE {scalePercent}%</span>
                        <div className="db-scale-bar-bg">
                          <div className="db-scale-bar-fill" style={{ width: `${scalePercent}%`, background: player.nameScale < 0.7 ? 'var(--color-warning)' : 'var(--color-success)' }} />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
