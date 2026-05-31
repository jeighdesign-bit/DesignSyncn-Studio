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

          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-disabled)' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color, #333)' }}></div>
            <span style={{ padding: '0 10px', fontSize: '12px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color, #333)' }}></div>
          </div>

          <button
            type="button"
            className="secondary"
            onClick={async () => {
              setError('');
              setLoading(true);
              const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: window.location.origin
                }
              });
              if (oauthError) {
                setError(oauthError.message);
                setLoading(false);
              }
            }}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #333)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
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
