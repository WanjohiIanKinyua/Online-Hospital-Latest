import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../styles/AuthPages.css';
import { API_BASE_URL } from '../config/api';

const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [resetCode, setResetCode] = useState(() => location.state?.resetCode || token || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
    setError('');
    setMessage('');

    if (!resetCode.trim() && !token) {
      setError('Reset code is required. Paste the code from forgot password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      setError('Password must be at least 6 characters and include 1 uppercase letter, 1 number, and 1 special character.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
        token: token || resetCode.trim(),
        resetCode: resetCode.trim(),
        newPassword,
        confirmPassword
      });

      setMessage(response.data?.message || 'Password reset successful. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password.');
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
          <h2>Reset password</h2>
          <p className="auth-subtitle">Enter reset code and your new password</p>

          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label htmlFor="newPassword">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                placeholder="Enter new password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                placeholder="Confirm new password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="resetCode">Reset Code</label>
            <input
              type="text"
              id="resetCode"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              required
              placeholder="Paste reset code"
            />
            <p className="password-hint">
              Use at least 6 characters with one letter, one number, and one special character.
            </p>
          </div>

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
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Back to <Link to="/login">login</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
