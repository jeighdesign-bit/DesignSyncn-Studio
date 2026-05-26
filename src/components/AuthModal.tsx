import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Mail, Lock } from 'lucide-react';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        onClose();
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
      } else {
        onClose();
      }
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={18} style={{ color: 'var(--accent-blue)' }} />
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <button className="ghost" style={{ padding: '4px' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div style={{ color: 'var(--color-warning)', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 60, 60, 0.1)', padding: '8px', borderRadius: '4px' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="search-input-wrapper">
                <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)' }} />
                <input
                  type="email"
                  className="form-input-text"
                  style={{ paddingLeft: '36px' }}
                  placeholder="hello@designsync.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="search-input-wrapper">
                <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)' }} />
                <input
                  type="password"
                  className="form-input-text"
                  style={{ paddingLeft: '36px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <button type="submit" className="primary" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Log In'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <span
              style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            >
              {isSignUp ? 'Log In' : 'Sign Up'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
