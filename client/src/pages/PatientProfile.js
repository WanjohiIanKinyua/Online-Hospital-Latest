import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import '../styles/ModernDashboard.css';
import '../styles/AdminManagement.css';
import { API_BASE_URL } from '../config/api';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  address: ''
};

function PatientProfile() {
  const token = localStorage.getItem('token');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadProfile = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const profile = response.data || {};
      setFormData({
        fullName: profile.fullName || '',
        email: profile.email || '',
        phone: profile.phone || '',
        dateOfBirth: profile.dateOfBirth || '',
        gender: profile.gender || '',
        address: profile.address || ''
      });
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const saveProfile = async () => {
    if (!formData.fullName.trim()) {
      alert('Full name is required');
      return;
    }

    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/api/auth/profile`,
        {
          fullName: formData.fullName.trim(),
          phone: formData.phone || '',
          dateOfBirth: formData.dateOfBirth || '',
          gender: formData.gender || '',
          address: formData.address || ''
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      localStorage.setItem('userName', formData.fullName.trim());
      window.dispatchEvent(new Event('storage'));
      alert('Profile updated successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="patient">
        <div className="loading-spinner">Loading profile...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="patient">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">My Profile</h1>
            <p className="dashboard-subtitle">View and update your personal information anytime.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Personal Information</h2>
          </div>
          <div className="card-content">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email (read-only)</label>
                <input id="email" name="email" value={formData.email} disabled />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="dateOfBirth">Date of Birth</label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="gender">Gender</label>
                <select id="gender" name="gender" value={formData.gender} onChange={handleChange}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="address">Address</label>
              <textarea id="address" name="address" rows="3" value={formData.address} onChange={handleChange} />
            </div>

            <div className="doctor-notes-actions">
              <button type="button" className="btn-submit" onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default PatientProfile;
