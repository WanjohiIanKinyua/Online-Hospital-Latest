import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import { FiVideo } from 'react-icons/fi';
import '../styles/ModernDashboard.css';
import { API_BASE_URL } from '../config/api';

function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBackupLink, setSelectedBackupLink] = useState('');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    appointmentDate: '',
    appointmentTime: ''
  });
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const token = localStorage.getItem('token');

  const fetchAppointments = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const fetchSlotsForDate = async (date) => {
    if (!date) {
      setRescheduleSlots([]);
      return;
    }

    setRescheduleSlotsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/appointments/available-slots`, {
        params: { date },
        headers: { Authorization: `Bearer ${token}` }
      });
      setRescheduleSlots(response.data || []);
    } catch (err) {
      setRescheduleSlots([]);
      alert(err.response?.data?.error || 'Failed to load available slots');
    } finally {
      setRescheduleSlotsLoading(false);
    }
  };

  const openRescheduleModal = async (appointment) => {
    setSelectedAppointment(appointment);
    setRescheduleForm({
      appointmentDate: appointment.appointmentDate || '',
      appointmentTime: ''
    });
    setShowRescheduleModal(true);
    await fetchSlotsForDate(appointment.appointmentDate);
  };

  const handleRescheduleDateChange = async (value) => {
    setRescheduleForm((prev) => ({
      ...prev,
      appointmentDate: value,
      appointmentTime: ''
    }));
    await fetchSlotsForDate(value);
  };

  const submitReschedule = async () => {
    if (!selectedAppointment) return;
    if (!rescheduleForm.appointmentDate || !rescheduleForm.appointmentTime) {
      alert('Please choose both date and time');
      return;
    }

    setRescheduleSubmitting(true);
    try {
      await axios.put(
        `${API_BASE_URL}/api/appointments/${selectedAppointment.id}/reschedule`,
        {
          appointmentDate: rescheduleForm.appointmentDate,
          appointmentTime: rescheduleForm.appointmentTime
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      setRescheduleSlots([]);
      setRescheduleForm({ appointmentDate: '', appointmentTime: '' });
      await fetchAppointments();
      alert('Appointment rescheduled successfully');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reschedule appointment');
    } finally {
      setRescheduleSubmitting(false);
    }
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

  const getApprovalColor = (approvalStatus) => {
    switch (approvalStatus) {
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      case 'pending':
      default:
        return 'status-pending';
    }
  };

  const handleOpenBackupLink = (e, link) => {
    e.preventDefault();
    if (!link) return;
    setSelectedBackupLink(link);
  };

  const handleCopyBackupLink = async () => {
    if (!selectedBackupLink) return;
    try {
      await navigator.clipboard.writeText(selectedBackupLink);
      alert('Backup meet link copied.');
    } catch (copyError) {
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  const renderConsultationAction = (appointment) => {
    if (appointment.approvalStatus === 'approved') {
      if (appointment.status === 'completed') {
        return <span className="text-muted">Session completed</span>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <Link to={`/consultation/${appointment.id}`} className="btn-join-meeting">
            <FiVideo /> Enter Care Room
          </Link>
          {appointment.meetingLink && (
            <a
              href={appointment.meetingLink}
              onClick={(e) => handleOpenBackupLink(e, appointment.meetingLink)}
              className="btn-secondary-small"
            >
              Open Backup Meet Link
            </a>
          )}
        </div>
      );
    }

    if (appointment.approvalStatus === 'rejected') {
      if (appointment.paymentStatus === 'completed') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span className="text-muted">Rejected (payment retained)</span>
            <button
              type="button"
              className="btn-secondary-small"
              onClick={() => openRescheduleModal(appointment)}
            >
              Reschedule Paid Appointment
            </button>
          </div>
        );
      }
      return <span className="text-muted">Not approved</span>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span className="text-muted">Awaiting doctor approval</span>
        <button
          type="button"
          className="btn-secondary-small"
          onClick={() => openRescheduleModal(appointment)}
        >
          Reschedule
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout role="patient">
        <div className="loading-spinner">Loading appointments...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="patient">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Recent Bookings</h1>
            <p className="dashboard-subtitle">Track your recent bookings, approval status, and consultations</p>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            {error && <div className="alert alert-danger">{error}</div>}
            {!error && appointments.length === 0 ? (
              <p className="empty-message">No booked appointments found yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Approval</th>
                      <th>Reason</th>
                      <th>Doctor</th>
                      <th>Consultation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td>{new Date(appointment.appointmentDate).toLocaleDateString()} {appointment.appointmentTime}</td>
                        <td>
                          <span className={`status-badge ${getStatusColor(appointment.status)}`}>
                            {appointment.status}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${getApprovalColor(appointment.approvalStatus)}`}>
                            {appointment.approvalStatus || 'pending'}
                          </span>
                        </td>
                        <td>{appointment.approvalReason || <span className="text-muted">-</span>}</td>
                        <td>{appointment.doctorName || 'Dr. Merceline'}</td>
                        <td>{renderConsultationAction(appointment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedBackupLink && (
        <div className="modal active" onClick={() => setSelectedBackupLink('')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Backup Meet Link
              <span className="modal-close" onClick={() => setSelectedBackupLink('')}>&times;</span>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ marginBottom: '0.75rem', color: '#374151' }}>
                The admin shared this backup meeting link for your appointment:
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.88rem',
                  color: '#0f172a',
                  wordBreak: 'break-all'
                }}
              >
                {selectedBackupLink}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setSelectedBackupLink('')}>
                  Close
                </button>
                <button type="button" className="btn-submit" onClick={handleCopyBackupLink}>
                  Copy Link
                </button>
                <a
                  href={selectedBackupLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-submit"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  Open Link
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRescheduleModal && (
        <div className="modal active" onClick={() => setShowRescheduleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Reschedule Appointment
              <span className="modal-close" onClick={() => setShowRescheduleModal(false)}>&times;</span>
            </div>
            <form>
              <div className="form-group">
                <label htmlFor="rescheduleDate">New Date</label>
                <input
                  id="rescheduleDate"
                  type="date"
                  value={rescheduleForm.appointmentDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => handleRescheduleDateChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="rescheduleTime">New Time</label>
                <select
                  id="rescheduleTime"
                  value={rescheduleForm.appointmentTime}
                  onChange={(e) => setRescheduleForm((prev) => ({ ...prev, appointmentTime: e.target.value }))}
                  disabled={!rescheduleForm.appointmentDate || rescheduleSlotsLoading || rescheduleSlots.length === 0}
                >
                  <option value="">Select available time</option>
                  {rescheduleSlots.map((slot) => (
                    <option key={slot.id} value={slot.slotTime}>
                      {slot.slotTime}
                    </option>
                  ))}
                </select>
                <small>
                  {!rescheduleForm.appointmentDate
                    ? 'Select a date first'
                    : rescheduleSlotsLoading
                      ? 'Loading available slots...'
                      : rescheduleSlots.length === 0
                        ? 'No available slots for this date'
                        : 'Only available slots are shown'}
                </small>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowRescheduleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={submitReschedule}
                  disabled={rescheduleSubmitting}
                >
                  {rescheduleSubmitting ? 'Saving...' : 'Save New Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default PatientAppointments;
