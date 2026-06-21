import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiCheck, FiX } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminApprovals() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');
  const getDisplayName = (record) => record.fullName || record.fullname || record.name || '-';
  const formatDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
  };

  const loadAppointments = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const pendingAppointments = useMemo(
    () =>
      appointments
        .filter((apt) => apt.approvalStatus === 'pending')
        .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate)),
    [appointments]
  );

  const handleApproval = async (appointmentId, approvalStatus) => {
    let reason = '';
    if (approvalStatus === 'rejected') {
      reason = window.prompt('Enter rejection reason:') || '';
      if (!reason.trim()) {
        alert('Rejection reason is required');
        return;
      }
    }

    try {
      await axios.put(
        `${API_BASE_URL}/api/admin/appointments/${appointmentId}/approval`,
        { approvalStatus, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadAppointments();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update approval status');
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading approvals...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Pending Appointment Approvals</h1>
            <p className="dashboard-subtitle">Approve or reject appointment requests</p>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            {pendingAppointments.length === 0 ? (
              <p className="empty-message">No pending appointment requests.</p>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Email</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAppointments.map((apt) => (
                      <tr key={apt.id}>
                        <td>{getDisplayName(apt)}</td>
                        <td>{apt.email}</td>
                        <td>{formatDate(apt.appointmentDate || apt.appointmentdate)}</td>
                        <td>{apt.appointmentTime}</td>
                        <td>
                          <div className="admin-actions">
                            <button className="btn-small btn-success" onClick={() => handleApproval(apt.id, 'approved')}>
                              <FiCheck size={14} />
                            </button>
                            <button className="btn-small btn-danger" onClick={() => handleApproval(apt.id, 'rejected')}>
                              <FiX size={14} />
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

export default AdminApprovals;
