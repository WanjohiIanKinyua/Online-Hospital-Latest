import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../styles/AuthPages.css';
import { API_BASE_URL } from '../config/api';

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const saveAuthItem = (key, value) => {
  localStorage.setItem(key, value);
  sessionStorage.setItem(key, value);
};

function Login({ setIsAuthenticated, setUserRole }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password
      });

      const role = normalizeRole(response.data.user?.role);

      if (!['patient', 'admin'].includes(role)) {
        throw new Error('Your account role is not recognized. Please contact support.');
      }

      saveAuthItem('token', response.data.token);
      saveAuthItem('userRole', role);
      saveAuthItem('userId', response.data.user.id);
      const resolvedName = response.data.user.fullName || response.data.user.fullname || response.data.user.name || '';
      saveAuthItem('userName', resolvedName);
      saveAuthItem('userEmail', response.data.user.email);
      saveAuthItem('mustChangePassword', response.data.user.mustChangePassword ? '1' : '0');
      saveAuthItem('loginSuccess', '1');

      setIsAuthenticated(true);
      setUserRole(role);

      window.location.replace(
        role === 'patient' && response.data.user.mustChangePassword ? '/change-password' : role === 'admin' ? '/admin' : '/dashboard'
      );
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Elite Online Hospital</h1>
          <p>Telemedicine Platform</p>
        </div>

        <form onSubmit={handleLogin}>
          <h2>Login to Your Account</h2>

          {error && <div className="alert alert-danger">{error}</div>}

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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
            <div className="forgot-password-row">
              <Link to="/forgot-password" className="forgot-password-btn">
                Forgot password?
              </Link>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Don't have an account? <Link to="/register">Register here</Link></p>
        </div>
      </div>
    </div>
  );
}

export default Login;
