import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import '../styles/ModernDashboard.css';
import '../styles/AdminManagement.css';
import { FiUsers, FiCalendar, FiCheckCircle, FiDollarSign, FiArrowRight, FiDownload } from 'react-icons/fi';
import { API_BASE_URL } from '../config/api';

function AdminDashboard() {
  const [stats, setStats] = useState({
    totalPatients: 0,
    totalAppointments: 0,
    completedConsultations: 0,
    pendingAppointments: 0,
    totalRevenue: 0
  });
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const [downloadingIncome, setDownloadingIncome] = useState(false);

  const token = localStorage.getItem('token');
  const getDisplayName = (record) => record.fullName || record.fullname || record.name || '-';
  const formatDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
  };
  const latestPendingLikeAppointments = appointments
    .filter((apt) => {
      const status = String(apt.status || '').toLowerCase();
      const approval = String(apt.approvalStatus || '').toLowerCase();
      return status === 'pending' || status === 'confirmed' || approval === 'pending';
    })
    .slice(0, 5);

  const loadOverview = useCallback(async () => {
    try {
      const [statsRes, appointmentsRes, patientsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/admin/appointments`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/admin/patients`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setStats(statsRes.data);
      setAppointments(appointmentsRes.data);
      setPatients(patientsRes.data);
    } catch (error) {
      console.error('Failed to load admin overview:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const isFreshLogin = localStorage.getItem('loginSuccess') === '1';
    if (isFreshLogin) {
      setShowLoginSuccess(true);
      localStorage.removeItem('loginSuccess');
      setTimeout(() => setShowLoginSuccess(false), 3000);
    }

    loadOverview();
  }, [loadOverview]);

  const downloadIncomeReport = async () => {
    if (downloadingIncome) return;
    setDownloadingIncome(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/payments/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const payments = response.data || [];
      const now = new Date();
      const generatedAt = now.toLocaleString();
      const csvRows = [
        ['Dr. Merceline Online Healthcare Platform - Income Report'],
        [`Generated At,${generatedAt}`],
        [`Total Income (KSH),${stats.totalRevenue || 0}`],
        [''],
        ['Transaction ID', 'Patient', 'Appointment Date', 'Amount (KSH)', 'Method', 'Status', 'Payment Date']
      ];

      payments.forEach((payment) => {
        csvRows.push([
          payment.transactionId || '-',
          payment.fullName || '-',
          payment.appointmentDate ? new Date(payment.appointmentDate).toLocaleDateString() : '-',
          String(payment.amount || 0),
          payment.paymentMethod || '-',
          payment.status || '-',
          payment.paymentDate ? new Date(payment.paymentDate).toLocaleString() : '-'
        ]);
      });

      const csvContent = csvRows
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `income-report-${now.toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to download income report');
    } finally {
      setDownloadingIncome(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading dashboard...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Admin Dashboard</h1>
            <p className="dashboard-subtitle">Overview of hospital performance and recent activity</p>
          </div>
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="btn-export-income"
              onClick={downloadIncomeReport}
              disabled={downloadingIncome}
            >
              <FiDownload />
              {downloadingIncome ? 'Preparing Report...' : 'Download Total Income'}
            </button>
          </div>
        </div>

        {showLoginSuccess && (
          <div className="login-success-banner">You have successfully logged in.</div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon completed">
              <FiUsers />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Patients</div>
              <div className="stat-value">{stats.totalPatients}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon upcoming">
              <FiCalendar />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Appointments</div>
              <div className="stat-value">{stats.totalAppointments}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon payments">
              <FiCheckCircle />
            </div>
            <div className="stat-content">
              <div className="stat-label">Completed Consultations</div>
              <div className="stat-value">{stats.completedConsultations}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon prescriptions">
              <FiDollarSign />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Revenue (KSH)</div>
              <div className="stat-value">{stats.totalRevenue.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title-section">
              <h2 className="card-title">Recent Pending Bookings</h2>
            </div>
            <Link to="/admin/appointments" className="btn-secondary-small">
              View More <FiArrowRight />
            </Link>
          </div>
          <div className="card-content">
            {latestPendingLikeAppointments.length === 0 ? (
              <div className="empty-message">No pending or active bookings right now</div>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestPendingLikeAppointments.map((apt) => (
                      <tr key={apt.id}>
                        <td>{getDisplayName(apt)}</td>
                        <td>{formatDate(apt.appointmentDate || apt.appointmentdate)}</td>
                        <td>{apt.appointmentTime}</td>
                        <td>
                          <span className={`status-badge status-${apt.status}`}>
                            {apt.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title-section">
              <h2 className="card-title">Recent Patients</h2>
            </div>
            <Link to="/admin/patients" className="btn-secondary-small">
              View More <FiArrowRight />
            </Link>
          </div>
          <div className="card-content">
            {patients.length === 0 ? (
              <div className="empty-message">No patients registered</div>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.slice(0, 5).map((patient) => (
                      <tr key={patient.id}>
                        <td>{getDisplayName(patient)}</td>
                        <td>{patient.email}</td>
                        <td>{patient.phone || <span className="text-muted">N/A</span>}</td>
                        <td>{formatDate(patient.createdAt || patient.createdat)}</td>
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

export default AdminDashboard;
