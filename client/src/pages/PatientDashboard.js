import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import { FiVideo, FiCalendar, FiCheckCircle, FiFileText } from 'react-icons/fi';
import '../styles/ModernDashboard.css';
import { API_BASE_URL } from '../config/api';

function PatientDashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState({
    completedConsultations: 0,
    upcomingAppointments: 0,
    totalPayments: 0,
    pendingPrescriptions: 0
  });
  const [loading, setLoading] = useState(true);
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const isFreshLogin = localStorage.getItem('loginSuccess') === '1';
    if (isFreshLogin) {
      setShowLoginSuccess(true);
      localStorage.removeItem('loginSuccess');
      setTimeout(() => setShowLoginSuccess(false), 3000);
    }

    if (!token) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const [appointmentsRes, prescriptionsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/appointments`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/api/prescriptions`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const appts = appointmentsRes.data;
        const rxs = prescriptionsRes.data;

        setAppointments(appts);
        setPrescriptions(rxs);

        // Calculate stats
        const completed = appts.filter(a => a.status === 'completed').length;
        const upcoming = appts.filter(a => a.status === 'confirmed' && new Date(a.appointmentDate) >= new Date()).length;
        const pending = rxs.filter(r => !r.isDownloaded).length;

        setStats({
          completedConsultations: completed,
          upcomingAppointments: upcoming,
          totalPayments: appts.length,
          pendingPrescriptions: pending
        });

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, token]);

  const latestPendingLikeAppointments = appointments
    .filter((appointment) => {
      const status = String(appointment.status || '').toLowerCase();
      const approval = String(appointment.approvalStatus || '').toLowerCase();
      return (
        (status === 'pending' || status === 'confirmed') &&
        status !== 'completed' &&
        status !== 'cancelled' &&
        approval !== 'rejected'
      );
    })
    .sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate))
    .slice(0, 5);

  const formatDate = (dateStr) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'confirmed':
        return 'status-confirmed';
      case 'completed':
        return 'status-completed';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return '';
    }
  };

  const renderConsultationAction = (appointment) => {
    if (appointment.approvalStatus === 'approved') {
      if (appointment.status === 'completed') {
        return <span className="text-muted">Session completed</span>;
      }
      return (
        <Link to={`/consultation/${appointment.id}`} className="btn-join-meeting">
          <FiVideo /> Enter Care Room
        </Link>
      );
    }

    if (appointment.approvalStatus === 'rejected') {
      return <span className="text-muted">Not approved</span>;
    }

    return <span className="text-muted">Awaiting doctor approval</span>;
  };

  return (
    <DashboardLayout role="patient">
      <div className="dashboard-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Patient Dashboard</h1>
            <p className="dashboard-subtitle">Welcome back! Here's your health overview.</p>
          </div>
        </div>

        {showLoginSuccess && (
          <div className="login-success-banner">You have successfully logged in.</div>
        )}

        {loading ? (
          <div className="loading-spinner">Loading...</div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon completed">
                  <FiCheckCircle />
                </div>
                <div className="stat-content">
                  <p className="stat-label">Total Consultations</p>
                  <p className="stat-value">{stats.completedConsultations}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon upcoming">
                  <FiCalendar />
                </div>
                <div className="stat-content">
                  <p className="stat-label">Upcoming</p>
                  <p className="stat-value">{stats.upcomingAppointments}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon payments">
                  <FiVideo />
                </div>
                <div className="stat-content">
                  <p className="stat-label">Total Bookings</p>
                  <p className="stat-value">{stats.totalPayments}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon prescriptions">
                  <FiFileText />
                </div>
                <div className="stat-content">
                  <p className="stat-label">Prescriptions</p>
                  <p className="stat-value">{prescriptions.length}</p>
                </div>
              </div>
            </div>

            {/* Recent + Pending-like Appointments */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-section">
                  <h2 className="card-title">Recent Pending Appointments</h2>
                </div>
                <div className="card-header-actions">
                  <Link to="/appointments" className="btn-secondary-small">
                    View More
                  </Link>
                  <Link to="/book-appointment" className="btn-primary-small">
                    <span>+ Book New</span>
                  </Link>
                </div>
              </div>
              <div className="card-content">
                {latestPendingLikeAppointments.length === 0 ? (
                  <p className="empty-message">No pending or active appointments. Book a consultation to get started.</p>
                ) : (
                  <div className="appointments-list">
                    {latestPendingLikeAppointments.map((appointment) => (
                      <div key={appointment.id} className="appointment-item">
                        <div className="appointment-info">
                          <p className="appointment-date">
                            {formatDate(appointment.appointmentDate)}
                          </p>
                          <span className={`status-badge ${getStatusColor(appointment.status)}`}>
                            {appointment.status}
                          </span>
                        </div>
                        {renderConsultationAction(appointment)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Prescriptions */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-section">
                  <h2 className="card-title">Recent Prescriptions</h2>
                </div>
                <Link to="/prescriptions" className="btn-secondary-small">
                  View More
                </Link>
              </div>
              <div className="card-content">
                {prescriptions.length === 0 ? (
                  <p className="empty-message">No prescriptions yet. They will appear here after your consultations.</p>
                ) : (
                  <div className="prescriptions-list">
                    {prescriptions.slice(0, 5).map((prescription) => (
                      <div key={prescription.id} className="prescription-item">
                        <div className="prescription-info">
                          <p className="prescription-date">
                            {formatDate(prescription.issuedAt)}
                          </p>
                          <p className="prescription-text">{prescription.medications || 'Prescription details'}</p>
                        </div>
                        <Link to="/prescriptions" className="btn-secondary-small">
                          View Details
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default PatientDashboard;
