import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  address: ''
};

function AdminPatients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('add');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingPatient, setEditingPatient] = useState(null);

  const token = localStorage.getItem('token');
  const getDisplayName = (record) => record.fullName || record.fullname || record.name || '-';
  const formatDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
  };

  const modalTitle = useMemo(() => (mode === 'add' ? 'Add Patient' : 'Edit Patient'), [mode]);

  const loadPatients = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/patients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPatients(response.data);
    } catch (error) {
      console.error('Failed to load patients:', error);
      alert('Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const openAddModal = () => {
    setMode('add');
    setEditingPatient(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (patient) => {
    setMode('edit');
    setEditingPatient(patient);
    setFormData({
      fullName: patient.fullName || patient.fullname || patient.name || '',
      email: patient.email || '',
      password: '',
      phone: patient.phone || '',
      dateOfBirth: patient.dateOfBirth || patient.dateofbirth || '',
      gender: patient.gender || '',
      address: patient.address || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(EMPTY_FORM);
    setEditingPatient(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.fullName.trim() || !formData.email.trim()) {
      alert('Full name and email are required');
      return;
    }

    if (mode === 'add' && !formData.password.trim()) {
      alert('Password is required for new patients');
      return;
    }

    try {
      if (mode === 'add') {
        await axios.post(
          `${API_BASE_URL}/api/admin/patients`,
          {
            fullName: formData.fullName.trim(),
            email: formData.email.trim(),
            password: formData.password,
            phone: formData.phone,
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            address: formData.address
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        alert('Patient created successfully');
      } else {
        await axios.put(
          `${API_BASE_URL}/api/admin/patients/${editingPatient.id}`,
          {
            fullName: formData.fullName.trim(),
            email: formData.email.trim(),
            password: formData.password,
            phone: formData.phone,
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            address: formData.address
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        alert('Patient updated successfully');
      }

      closeModal();
      await loadPatients();
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeletePatient = async (patient) => {
    const confirmed = await window.confirm(`Delete patient ${getDisplayName(patient)}? This also removes their appointments and records.`);
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/admin/patients/${patient.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadPatients();
      alert('Patient deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete patient');
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading patients...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Patients</h1>
            <p className="dashboard-subtitle">Add, edit, and remove patient records</p>
          </div>
          <button className="btn-primary-small" onClick={openAddModal}>
            <FiPlus /> Add Patient
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title-section">
              <h2 className="card-title">Registered Patients</h2>
            </div>
          </div>
          <div className="card-content">
            {patients.length === 0 ? (
              <div className="empty-message">No patients found</div>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>DOB</th>
                      <th>Gender</th>
                      <th>Address</th>
                      <th>Registered</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient) => (
                      <tr key={patient.id}>
                        <td>{getDisplayName(patient)}</td>
                        <td>{patient.email}</td>
                        <td>{patient.phone || <span className="text-muted">N/A</span>}</td>
                        <td>{patient.dateOfBirth || patient.dateofbirth || <span className="text-muted">N/A</span>}</td>
                        <td>{patient.gender || <span className="text-muted">N/A</span>}</td>
                        <td>{patient.address || <span className="text-muted">N/A</span>}</td>
                        <td>{formatDate(patient.createdAt || patient.createdat)}</td>
                        <td>
                          <div className="admin-actions">
                            <button className="btn-small" onClick={() => openEditModal(patient)} title="Edit patient">
                              <FiEdit2 size={14} />
                            </button>
                            <button
                              className="btn-small btn-danger"
                              onClick={() => handleDeletePatient(patient)}
                              title="Delete patient"
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

        {showModal && (
          <div className="modal active">
            <div className="modal-content modal-content-wide">
              <div className="modal-header">
                {modalTitle}
                <span className="modal-close" onClick={closeModal}>&times;</span>
              </div>

              <form>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="fullName">Full Name</label>
                    <input id="fullName" name="fullName" value={formData.fullName} onChange={handleFormChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={formData.email} onChange={handleFormChange} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="password">{mode === 'add' ? 'Password' : 'New Password (optional)'}</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={formData.password}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input id="phone" name="phone" value={formData.phone} onChange={handleFormChange} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="dateOfBirth">Date of Birth</label>
                    <input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleFormChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="gender">Gender</label>
                    <select id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="address">Address</label>
                  <textarea id="address" name="address" rows="3" value={formData.address} onChange={handleFormChange} />
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={handleSubmit}>
                    {mode === 'add' ? 'Create Patient' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminPatients;
