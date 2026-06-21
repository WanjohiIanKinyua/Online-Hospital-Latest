import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../styles/AuthPages.css';
import { API_BASE_URL } from '../config/api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetCodeExpiresAt, setResetCodeExpiresAt] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy');

  const copyResetCode = async () => {
    if (!resetCode) return;
    try {
      await navigator.clipboard.writeText(resetCode);
      setCopyLabel('Copied');
      setTimeout(() => setCopyLabel('Copy'), 1200);
    } catch (err) {
      setCopyLabel('Copy Failed');
      setTimeout(() => setCopyLabel('Copy'), 1200);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setResetCode('');
    setResetCodeExpiresAt('');
    setResetLink('');
    setCopyLabel('Copy');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email });
      setMessage(response.data?.message || 'Reset code generated successfully.');
      setResetCode(response.data?.resetCode || '');
      setResetCodeExpiresAt(response.data?.resetCodeExpiresAt || '');
      if (response.data?.resetLink) {
        setResetLink(response.data.resetLink);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Dr.Merceline Naserian</h1>
          <p>Online Hospital</p>
        </div>

        <form onSubmit={handleSubmit}>
          <h2>Forgot Password</h2>
          <p className="auth-subtitle">Enter your email to generate a reset code</p>

          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Reset Code'}
          </button>
        </form>

        {resetCode && (
          <div className="auth-note reset-code-note">
            <p className="reset-code-title">Reset code generated successfully. Use it below to reset your password.</p>
            <div className="reset-code-row">
              <span className="reset-code-label">Reset Code</span>
              <button type="button" className="reset-copy-btn" onClick={copyResetCode}>
                {copyLabel}
              </button>
            </div>
            <div className="reset-code-box">{resetCode}</div>
            <div className="reset-code-expiry">
              Expires:{' '}
              {resetCodeExpiresAt
                ? new Date(Number(resetCodeExpiresAt)).toLocaleString()
                : 'In 1 hour'}
            </div>
            {resetLink && (
              <div className="reset-link-row">
                <a href={resetLink} target="_blank" rel="noreferrer">
                  Open reset page directly
                </a>
              </div>
            )}
          </div>
        )}

        <div className="auth-footer">
          <p><Link to="/reset-password">I have a reset code</Link></p>
          <p>Back to <Link to="/login">login</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
