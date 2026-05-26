import React from 'react';
import type { Project, ProductionRule } from '../types';
import { 
  Ruler, Compass, Info, Type, Shield, Sparkles
} from 'lucide-react';

interface RuleEngineProps {
  project: Project;
  onUpdateProject: (updates: Partial<Project>) => void;
}

export const RuleEngine: React.FC<RuleEngineProps> = ({
  project,
  onUpdateProject,
}) => {
  const { rules, measurementUnit } = project;

  // Convert internal inches to current unit for displays
  const getUnitMultiplier = () => {
    if (measurementUnit === 'cm') return 2.54;
    if (measurementUnit === 'mm') return 25.4;
    return 1.0;
  };

  const toDisplayValue = (inches: number) => {
    const val = inches * getUnitMultiplier();
    return parseFloat(val.toFixed(2));
  };

  const fromDisplayValue = (displayVal: number) => {
    return displayVal / getUnitMultiplier();
  };

  const handleStepperChange = (field: keyof ProductionRule, increment: number, min: number, max: number) => {
    const currentVal = rules[field] as number;
    const newVal = Math.max(min, Math.min(max, currentVal + increment));
    updateRule(field, newVal);
  };

  const updateRule = (field: keyof ProductionRule, value: any) => {
    onUpdateProject({
      rules: {
        ...rules,
        [field]: value
      }
    });
  };

  const unitLabel = measurementUnit === 'inches' ? 'in' : measurementUnit === 'cm' ? 'cm' : 'mm';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: '#070a12', height: '100%', overflowY: 'auto' }}>
      
      {/* 1. CALIBRATION SYSTEM (MEASUREMENT UNIT) */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ruler size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', fontFamily: 'monospace' }}>Measurement Unit</span>
          </div>
          <span style={{ fontSize: '9px', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>CALIBRATION v1.2</span>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-muted)' }}>
          {(['inches', 'cm', 'mm'] as const).map((unit) => (
            <button
              key={unit}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '10px',
                fontWeight: 'bold',
                color: measurementUnit === unit ? '#fff' : 'var(--text-secondary)',
                background: measurementUnit === unit ? 'var(--accent-blue)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
              onClick={() => onUpdateProject({ measurementUnit: unit })}
            >
              {unit.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: LOGO PLACEMENT */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-muted)', paddingBottom: '8px' }}>
          <Compass size={14} style={{ color: 'var(--accent-blue)' }} />
          <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>Placement Rules</h4>
        </div>

        {/* Collar Offset */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Collar Offset spacing</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{unitLabel}</span>
          </div>
          <div className="rule-stepper" style={{ height: '28px' }}>
            <button className="stepper-btn" onClick={() => handleStepperChange('frontLogoSpacingCollarInches', -fromDisplayValue(0.25), 1.0, 8.0)} style={{ width: '28px' }}>-</button>
            <input
              type="text"
              className="stepper-value"
              value={toDisplayValue(rules.frontLogoSpacingCollarInches)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) updateRule('frontLogoSpacingCollarInches', fromDisplayValue(parsed));
              }}
              style={{ fontSize: '11px' }}
            />
            <button className="stepper-btn" onClick={() => handleStepperChange('frontLogoSpacingCollarInches', fromDisplayValue(0.25), 1.0, 8.0)} style={{ width: '28px' }}>+</button>
          </div>
        </div>

        {/* Sponsor spacing */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sponsor Boundary spacing</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{unitLabel}</span>
          </div>
          <div className="rule-stepper" style={{ height: '28px' }}>
            <button className="stepper-btn" onClick={() => handleStepperChange('sponsorSpacingInches', -fromDisplayValue(0.25), 0.5, 4.0)} style={{ width: '28px' }}>-</button>
            <input
              type="text"
              className="stepper-value"
              value={toDisplayValue(rules.sponsorSpacingInches)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) updateRule('sponsorSpacingInches', fromDisplayValue(parsed));
              }}
              style={{ fontSize: '11px' }}
            />
            <button className="stepper-btn" onClick={() => handleStepperChange('sponsorSpacingInches', fromDisplayValue(0.25), 0.5, 4.0)} style={{ width: '28px' }}>+</button>
          </div>
        </div>

        {/* Quick alignment buttons */}
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Align Front Logos</span>
          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-muted)' }}>
            {(['left', 'center', 'right'] as const).map((align) => {
              const isActive = rules.chestAlignment === align;
              return (
                <button
                  key={align}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: isActive ? '#fff' : 'var(--text-disabled)',
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => {
                    updateRule('chestAlignment', align);
                    updateRule('autoCenter', align === 'center');
                  }}
                >
                  {align}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: TYPOGRAPHY RULES */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-muted)', paddingBottom: '8px' }}>
          <Type size={14} style={{ color: 'var(--accent-blue)' }} />
          <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>Typography Specs</h4>
        </div>

        {/* Surname spacing */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Surname spacing below collar</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{unitLabel}</span>
          </div>
          <div className="rule-stepper" style={{ height: '28px' }}>
            <button className="stepper-btn" onClick={() => handleStepperChange('surnameSpacingCollarInches', -fromDisplayValue(0.5), 2.0, 10.0)} style={{ width: '28px' }}>-</button>
            <input
              type="text"
              className="stepper-value"
              value={toDisplayValue(rules.surnameSpacingCollarInches)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) updateRule('surnameSpacingCollarInches', fromDisplayValue(parsed));
              }}
              style={{ fontSize: '11px' }}
            />
            <button className="stepper-btn" onClick={() => handleStepperChange('surnameSpacingCollarInches', fromDisplayValue(0.5), 2.0, 10.0)} style={{ width: '28px' }}>+</button>
          </div>
        </div>

        {/* Player Number height */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Player Number height</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{unitLabel}</span>
          </div>
          <div className="rule-stepper" style={{ height: '28px' }}>
            <button className="stepper-btn" onClick={() => handleStepperChange('playerNumberHeightInches', -fromDisplayValue(0.5), 6.0, 12.0)} style={{ width: '28px' }}>-</button>
            <input
              type="text"
              className="stepper-value"
              value={toDisplayValue(rules.playerNumberHeightInches)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) updateRule('playerNumberHeightInches', fromDisplayValue(parsed));
              }}
              style={{ fontSize: '11px' }}
            />
            <button className="stepper-btn" onClick={() => handleStepperChange('playerNumberHeightInches', fromDisplayValue(0.5), 6.0, 12.0)} style={{ width: '28px' }}>+</button>
          </div>
        </div>

        {/* Max width */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Max text safe width</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{unitLabel}</span>
          </div>
          <div className="rule-stepper" style={{ height: '28px' }}>
            <button className="stepper-btn" onClick={() => handleStepperChange('maxTextWidthInches', -fromDisplayValue(0.5), 6.0, 18.0)} style={{ width: '28px' }}>-</button>
            <input
              type="text"
              className="stepper-value"
              value={toDisplayValue(rules.maxTextWidthInches)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) updateRule('maxTextWidthInches', fromDisplayValue(parsed));
              }}
              style={{ fontSize: '11px' }}
            />
            <button className="stepper-btn" onClick={() => handleStepperChange('maxTextWidthInches', fromDisplayValue(0.5), 6.0, 18.0)} style={{ width: '28px' }}>+</button>
          </div>
        </div>

        {/* Auto fit toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-muted)', paddingTop: '10px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Auto-fit font boundaries</span>
            <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }} title="Automatically compresses long surnames to fit safety boundaries">
              <Info size={10} style={{ color: 'var(--text-disabled)' }} />
            </div>
          </div>
          <input
            type="checkbox"
            checked={rules.autoFitSizing}
            onChange={(e) => updateRule('autoFitSizing', e.target.checked)}
            style={{ cursor: 'pointer', width: '14px', height: '14px' }}
          />
        </div>
      </div>

      {/* SECTION 3: SAFETY & ZONE MARGINS */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-muted)', paddingBottom: '8px' }}>
          <Shield size={14} style={{ color: 'var(--accent-blue)' }} />
          <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>Print Safety Zones</h4>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {/* Safe Zone */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Safe Margin</span>
              <span style={{ fontSize: '8px', color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>Inner border ({unitLabel})</span>
            </div>
            <div className="rule-stepper" style={{ height: '26px' }}>
              <button className="stepper-btn" onClick={() => handleStepperChange('safeMarginInches', -fromDisplayValue(0.05), 0.25, 1.5)} style={{ width: '22px', fontSize: '10px' }}>-</button>
              <input
                type="text"
                className="stepper-value"
                value={toDisplayValue(rules.safeMarginInches)}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed)) updateRule('safeMarginInches', fromDisplayValue(parsed));
                }}
                style={{ fontSize: '10px' }}
              />
              <button className="stepper-btn" onClick={() => handleStepperChange('safeMarginInches', fromDisplayValue(0.05), 0.25, 1.5)} style={{ width: '22px', fontSize: '10px' }}>+</button>
            </div>
          </div>

          {/* Bleed Zone */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Bleed Bounds</span>
              <span style={{ fontSize: '8px', color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>Seam offset ({unitLabel})</span>
            </div>
            <div className="rule-stepper" style={{ height: '26px' }}>
              <button className="stepper-btn" onClick={() => handleStepperChange('bleedInches', -fromDisplayValue(0.05), 0.1, 0.5)} style={{ width: '22px', fontSize: '10px' }}>-</button>
              <input
                type="text"
                className="stepper-value"
                value={toDisplayValue(rules.bleedInches)}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed)) updateRule('bleedInches', fromDisplayValue(parsed));
                }}
                style={{ fontSize: '10px' }}
              />
              <button className="stepper-btn" onClick={() => handleStepperChange('bleedInches', fromDisplayValue(0.05), 0.1, 0.5)} style={{ width: '22px', fontSize: '10px' }}>+</button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: SMART AUTOMATION ASSISTANT */}
      <div style={{ 
        background: 'linear-gradient(135deg, #111524 0%, #0c0e18 100%)', 
        border: '1px solid rgba(0, 112, 243, 0.25)', 
        borderRadius: '8px', 
        padding: '16px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        boxShadow: '0 0 10px rgba(0, 112, 243, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(0, 112, 243, 0.2)', paddingBottom: '8px' }}>
          <Sparkles size={14} style={{ color: 'var(--accent-blue)' }} />
          <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>AI Auto-Assist</h4>
        </div>

        {/* Toggles List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Auto-Center Align */}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500' }}>Center Align</span>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>Locks designs to layout center</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={rules.autoCenter}
                onChange={(e) => updateRule('autoCenter', e.target.checked)}
                style={{ cursor: 'pointer', width: '13px', height: '13px' }}
              />
            </div>
          </label>

          {/* Snap Guides */}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500' }}>Figma Snap Guides</span>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>Real-time guide line alignment</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={rules.smartSnapping}
                onChange={(e) => updateRule('smartSnapping', e.target.checked)}
                style={{ cursor: 'pointer', width: '13px', height: '13px' }}
              />
            </div>
          </label>

          {/* Collision Prevention */}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500' }}>Collision Prevention</span>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>Keeps logos from overlapping</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={rules.collisionPrevention}
                onChange={(e) => updateRule('collisionPrevention', e.target.checked)}
                style={{ cursor: 'pointer', width: '13px', height: '13px' }}
              />
            </div>
          </label>

          {/* Dynamic Scale Compensation */}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500' }}>Scale Compensation</span>
              <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>Scales fonts dynamically per size</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={rules.dynamicScaling}
                onChange={(e) => updateRule('dynamicScaling', e.target.checked)}
                style={{ cursor: 'pointer', width: '13px', height: '13px' }}
              />
            </div>
          </label>
        </div>
      </div>

    </div>
  );
};
