import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiPlus, FiToggleLeft, FiToggleRight, FiTrash2 } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    specialty: 'General Medicine'
  });

  const token = localStorage.getItem('token');

  const loadDoctors = useCallback(async () => {
    try {
      setPageError('');
      const response = await axios.get(`${API_BASE_URL}/api/admin/doctors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDoctors(response.data);
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.message || 'Unknown error';
      if (status === 404) {
        setPageError('Doctors endpoint not found (404). Restart backend server to load new doctor routes.');
      } else if (status === 401 || status === 403) {
        setPageError('Unauthorized. Log in again as admin to access doctors.');
      } else {
        setPageError(`Failed to load doctors (${status || 'no-status'}): ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddDoctor = async (e) => {
    e.preventDefault();

    if (!formData.fullName.trim()) {
      alert('Doctor name is required');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/admin/doctors`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormData({ fullName: '', specialty: 'General Medicine' });
      await loadDoctors();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add doctor');
    }
  };

  const toggleDoctor = async (doctor) => {
    try {
      await axios.put(
        `${API_BASE_URL}/api/admin/doctors/${doctor.id}/status`,
        { isActive: !Boolean(doctor.isActive) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadDoctors();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update doctor status');
    }
  };

  const deleteDoctor = async (doctor) => {
    const confirmed = await window.confirm(`Delete ${doctor.fullName} permanently? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/admin/doctors/${doctor.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadDoctors();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete doctor');
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading doctors...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Doctors</h1>
            <p className="dashboard-subtitle">Add more doctors and control who appears in booking dropdowns</p>
          </div>
        </div>

        {pageError && <div className="alert alert-danger">{pageError}</div>}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Add Doctor</h2>
          </div>
          <div className="card-content">
            <form onSubmit={handleAddDoctor} className="form-row">
              <div className="form-group">
                <label htmlFor="fullName">Doctor Name</label>
                <input
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="e.g., Dr. John Doe"
                />
              </div>

              <div className="form-group">
                <label htmlFor="specialty">Specialty</label>
                <input
                  id="specialty"
                  name="specialty"
                  value={formData.specialty}
                  onChange={handleChange}
                  placeholder="e.g., Cardiology"
                />
              </div>

              <div className="form-group" style={{ alignSelf: 'end' }}>
                <button type="submit" className="btn-primary-small" style={{ width: '100%' }}>
                  <FiPlus /> Add Doctor
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Doctor List</h2>
          </div>
          <div className="card-content">
            {doctors.length === 0 ? (
              <p className="empty-message">No doctors added yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Specialty</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((doctor) => (
                      <tr key={doctor.id}>
                        <td>{doctor.fullName}</td>
                        <td>{doctor.specialty || 'General Medicine'}</td>
                        <td>
                          <span className={`status-badge ${doctor.isActive ? 'status-approved' : 'status-cancelled'}`}>
                            {doctor.isActive ? 'active' : 'inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button className="btn-small" onClick={() => toggleDoctor(doctor)} title="Toggle active status">
                              {doctor.isActive ? <FiToggleRight size={14} /> : <FiToggleLeft size={14} />}
                            </button>
                            <button
                              className="btn-small btn-danger"
                              onClick={() => deleteDoctor(doctor)}
                              title="Delete doctor permanently"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminDoctors;
