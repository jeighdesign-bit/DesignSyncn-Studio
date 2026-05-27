import React, { useState } from 'react';
import type { RosterPlayer, Project } from '../types';
import { 
  Upload, RefreshCw, Plus, Trash2, 
  AlertTriangle, CheckCircle2, Users, ShieldAlert, Award
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
      
      // Match name and number: e.g. "JAY 7" or "JAY, 7" or "JAY - 7"
      const match = clean.match(/^(.+?)(?:\s+|,|-)+(\d+)$/);
      
      let name = clean;
      let num = '';
      
      if (match) {
        name = match[1].trim();
        num = match[2].trim();
      } else {
        // Fallback: search for first digit sequence
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
    
    // Clear & close
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
    <div className="roster-hub-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', backgroundColor: '#070a12' }}>
      
      {/* ULTRA-COMPACT TOOLBAR */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '12px', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '8px 16px', 
        background: '#0d111d', 
        borderBottom: '1px solid var(--border-muted)',
        zIndex: 5
      }}>
        {/* Left Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#fff' }}>
            <Users size={12} style={{ color: 'var(--accent-blue)' }} />
            <span>Players: <strong>{project.roster.length}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: conflictsCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {conflictsCount > 0 ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
            <span>Warnings: <strong>{conflictsCount}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-purple)' }}>
            <Award size={12} />
            <span>Ready: <strong>{readyCount}</strong></span>
          </div>
        </div>

        {/* Middle Quick Add Form (Inline Row) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="text"
            placeholder="Surname"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: '100px', height: '24px', fontSize: '11px', padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '4px', outline: 'none' }}
          />
          <input
            type="text"
            placeholder="No."
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            style={{ width: '40px', height: '24px', fontSize: '11px', padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '4px', textAlign: 'center', outline: 'none' }}
          />
          <select
            value={newSize}
            onChange={(e) => setNewSize(e.target.value as any)}
            style={{ height: '24px', fontSize: '11px', padding: '0 4px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '4px', outline: 'none' }}
          >
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
            <option value="3XL">3XL</option>
          </select>
          <select
            value={newVariant}
            onChange={(e) => setNewVariant(e.target.value as any)}
            style={{ height: '24px', fontSize: '11px', padding: '0 4px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '4px', outline: 'none' }}
          >
            <option value="Variant A">Variant A</option>
            <option value="Variant B">Variant B</option>
            <option value="Variant C">Variant C</option>
          </select>
          <button 
            className="primary" 
            onClick={handleAddPlayer} 
            style={{ height: '24px', padding: '0 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', borderRadius: '4px' }}
          >
            <Plus size={10} /> Add
          </button>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            className="ghost" 
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            style={{ fontSize: '10px', height: '24px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-muted)', borderRadius: '4px', color: showBulkAdd ? 'var(--accent-blue)' : 'var(--text-secondary)', background: showBulkAdd ? 'rgba(0,112,243,0.08)' : 'transparent' }}
          >
            <Plus size={10} /> Bulk Add
          </button>
          <button 
            className="ghost" 
            onClick={handleImportPreset} 
            style={{ fontSize: '10px', height: '24px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-muted)', borderRadius: '4px', color: 'var(--text-secondary)' }}
          >
            <Upload size={10} /> Import CSV
          </button>
          <button 
            className="ghost" 
            onClick={() => onSelectPlayer(project.activePlayerId)}
            style={{ fontSize: '10px', height: '24px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-muted)', borderRadius: '4px', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={10} /> Sync
          </button>
        </div>
      </div>

      {/* Bulk Add Paste Area */}
      {showBulkAdd && (
        <div style={{
          background: '#0d111d',
          borderBottom: '1px solid var(--border-muted)',
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 4
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>Bulk Paste Roster List</span>
            <span style={{ fontSize: '9px', color: 'var(--text-disabled)' }}>Type names and numbers, one per line (e.g. JAY 7)</span>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`JAY 7\nMARK 10\nLEX 23`}
            rows={4}
            style={{
              width: '100%',
              fontSize: '11px',
              padding: '6px 10px',
              background: '#070a12',
              border: '1px solid var(--border-muted)',
              color: '#fff',
              borderRadius: '6px',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              className="ghost"
              onClick={() => { setShowBulkAdd(false); setBulkText(''); }}
              style={{ height: '22px', padding: '0 8px', fontSize: '10px', borderRadius: '4px' }}
            >
              Cancel
            </button>
            <button
              className="primary"
              onClick={handleBulkAdd}
              style={{ height: '22px', padding: '0 12px', fontSize: '10px', borderRadius: '4px' }}
            >
              Parse & Load
            </button>
          </div>
        </div>
      )}

      {/* Roster Grid Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {project.roster.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-disabled)', padding: '24px 0', fontSize: '11px', border: '1px dashed var(--border-muted)', borderRadius: '8px' }}>
            No player variations currently synced. Click Import CSV or Bulk Add above to load presets.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
            {project.roster.map((player) => {
              const isActive = project.activePlayerId === player.id;
              const scalePercent = Math.round(player.nameScale * 100);
              const warning = getValidationWarning(player);
              const isReady = player.status === 'Ready for Export';

              return (
                <div
                  key={player.id}
                  onClick={() => onSelectPlayer(player.id)}
                  style={{
                    border: isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-muted)',
                    background: isActive ? 'rgba(0, 112, 243, 0.05)' : 'var(--bg-secondary)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: isActive ? '0 0 8px rgba(0, 112, 243, 0.15)' : 'none',
                  }}
                >
                  {/* Row 1: Radio selection + Name Input + Number Input + Delete button */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div 
                      style={{ 
                        width: '8px', height: '8px', borderRadius: '50%', 
                        border: isActive ? '2px solid var(--accent-blue)' : '1px solid var(--text-disabled)',
                        background: 'transparent',
                        flexShrink: 0
                      }} 
                    />
                    
                    <input
                      type="text"
                      value={player.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleFieldChange(player.id, 'name', e.target.value)}
                      style={{
                        flex: 1, fontSize: '10px', fontWeight: '800', 
                        background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
                        color: '#fff', padding: '1px 0', outline: 'none', textTransform: 'uppercase'
                      }}
                      onFocus={(e) => e.target.style.borderBottomColor = 'var(--accent-blue)'}
                      onBlur={(e) => e.target.style.borderBottomColor = 'transparent'}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-disabled)' }}>#</span>
                      <input
                        type="text"
                        value={player.number}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleFieldChange(player.id, 'number', e.target.value)}
                        style={{
                          width: '20px', fontSize: '10px', fontWeight: '700', 
                          background: 'transparent', border: 'none', borderBottom: '1px solid transparent',
                          color: 'var(--accent-blue)', padding: '1px 0', outline: 'none', textAlign: 'center'
                        }}
                        onFocus={(e) => e.target.style.borderBottomColor = 'var(--accent-blue)'}
                        onBlur={(e) => e.target.style.borderBottomColor = 'transparent'}
                      />
                    </div>

                    <button 
                      title="Delete Player" 
                      onClick={(e) => handleDeletePlayer(player.id, e)}
                      className="ghost"
                      style={{ height: '16px', width: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '4px', flexShrink: 0 }}
                    >
                      <Trash2 size={10} style={{ color: 'var(--color-error)' }} />
                    </button>
                  </div>

                  {/* Row 2: Size Select + Variant Select + Status toggle */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <select
                      value={player.size}
                      onChange={(e) => handleFieldChange(player.id, 'size', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1, height: '18px', fontSize: '9px', padding: '0 2px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '3px' }}
                    >
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                      <option value="3XL">3XL</option>
                    </select>

                    <select
                      value={player.variant || 'Variant A'}
                      onChange={(e) => handleFieldChange(player.id, 'variant', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1.5, height: '18px', fontSize: '9px', padding: '0 2px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: '#fff', borderRadius: '3px' }}
                    >
                      <option value="Variant A">Variant A</option>
                      <option value="Variant B">Variant B</option>
                      <option value="Variant C">Variant C</option>
                    </select>

                    <span 
                      onClick={(e) => { e.stopPropagation(); handleFieldChange(player.id, 'status', isReady ? 'Mapped' : 'Ready for Export'); }}
                      style={{
                        fontSize: '7px',
                        fontWeight: 'bold',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        textTransform: 'uppercase',
                        background: isReady ? 'rgba(0, 112, 243, 0.12)' : 'rgba(0, 230, 118, 0.12)',
                        color: isReady ? 'var(--accent-blue)' : 'var(--color-success)',
                        border: isReady ? '1px solid rgba(0, 112, 243, 0.2)' : '1px solid rgba(0, 230, 118, 0.2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      {isReady ? 'Ready' : 'Mapped'}
                    </span>
                  </div>

                  {/* Row 3: Sizing alert or Font scale bar */}
                  <div>
                    {warning ? (
                      <div style={{ background: 'rgba(245, 166, 35, 0.06)', border: '1px solid rgba(245, 166, 35, 0.15)', borderRadius: '3px', padding: '1px 3px', fontSize: '7.5px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <AlertTriangle size={8} /> {warning}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '7.5px', color: 'var(--text-disabled)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>SCALE {scalePercent}%</span>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px', overflow: 'hidden' }}>
                          <div style={{ width: `${scalePercent}%`, height: '100%', background: player.nameScale < 0.7 ? 'var(--color-warning)' : 'var(--color-success)' }} />
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

      {/* FOOTER AUDIT BAR (Compact buttons only, removed Checked/Audit left panel) */}
      <div 
        style={{ 
          background: '#0a0d1a', 
          borderTop: '1px solid var(--border-muted)', 
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          boxShadow: '0 -4px 10px rgba(0,0,0,0.3)',
          zIndex: 10,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            className="ghost" 
            style={{ height: '24px', fontSize: '9px', padding: '0 10px', border: '1px solid var(--border-muted)', borderRadius: '4px' }}
            onClick={() => console.log('Checking sizing rules...')}
          >
            Check Sizing Rules
          </button>
          <button 
            className="primary" 
            style={{ height: '24px', fontSize: '9px', padding: '0 12px', fontWeight: 'bold', borderRadius: '4px' }}
            onClick={() => console.log('Generating full batch...')}
          >
            Generate Full Batch
          </button>
        </div>
      </div>

    </div>
  );
};
