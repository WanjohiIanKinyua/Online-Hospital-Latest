import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiEdit2, FiPlus, FiCheckCircle, FiVideo } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('meeting');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [formData, setFormData] = useState({
    meetingLink: '',
    medications: '',
    dosageInstructions: '',
    medicalNotes: '',
    followUpRecommendations: ''
  });

  const token = localStorage.getItem('token');
  const navigate = useNavigate();
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
      console.error('Failed to load appointments:', error);
      alert('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const openMeetingModal = (appointment) => {
    setSelectedAppointment(appointment);
    setModalType('meeting');
    setFormData((prev) => ({ ...prev, meetingLink: appointment.meetingLink || '' }));
    setShowModal(true);
  };

  const openPrescriptionModal = (appointment) => {
    setSelectedAppointment(appointment);
    setModalType('prescription');
    setFormData({
      meetingLink: '',
      medications: '',
      dosageInstructions: '',
      medicalNotes: '',
      followUpRecommendations: ''
    });
    setShowModal(true);
  };

  const handleAddMeetingLink = async () => {
    if (!formData.meetingLink.trim()) {
      alert('Please enter a meeting link');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/chat/appointments/${selectedAppointment.id}/fallback-link`,
        {
          meetingLink: formData.meetingLink.trim()
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setShowModal(false);
      await loadAppointments();
      alert('Meeting link saved and shared with patient in chat');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save and share meeting link');
    }
  };

  const handleIssuePrescription = async () => {
    if (!formData.medications.trim()) {
      alert('Please enter medications');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/prescriptions/issue`,
        {
          appointmentId: selectedAppointment.id,
          medications: formData.medications,
          dosageInstructions: formData.dosageInstructions,
          medicalNotes: formData.medicalNotes,
          followUpRecommendations: formData.followUpRecommendations,
          doctorName: 'Dr. Merceline'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setShowModal(false);
      alert('Prescription issued successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to issue prescription');
    }
  };

  const handleCompleteAppointment = async (appointmentId) => {
    try {
      await axios.put(
        `${API_BASE_URL}/api/admin/appointment-status`,
        { appointmentId, status: 'completed' },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      await loadAppointments();
      alert('Appointment marked as completed');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update appointment');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading appointments...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Recent Bookings</h1>
            <p className="dashboard-subtitle">Manage recent bookings, meeting links, status, and prescriptions</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title-section">
              <h2 className="card-title">All Booking Records</h2>
            </div>
          </div>

          <div className="card-content">
            {appointments.length === 0 ? (
              <div className="empty-message">No appointments found</div>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Email</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Approval</th>
                      <th>Reason</th>
                      <th>Payment</th>
                      <th>Meeting</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((apt) => (
                      <tr key={apt.id}>
                        <td>{getDisplayName(apt)}</td>
                        <td>{apt.email}</td>
                        <td>{formatDate(apt.appointmentDate || apt.appointmentdate)}</td>
                        <td>{apt.appointmentTime}</td>
                        <td>
                          <span className={`status-badge status-${apt.status}`}>{apt.status}</span>
                        </td>
                        <td>
                          <span className={`status-badge status-${apt.approvalStatus || 'pending'}`}>
                            {apt.approvalStatus || 'pending'}
                          </span>
                        </td>
                        <td>{apt.approvalReason || <span className="text-muted">-</span>}</td>
                        <td>
                          <span className={`status-badge status-${apt.paymentStatus}`}>{apt.paymentStatus}</span>
                        </td>
                        <td>
                          {apt.meetingLink ? (
                            <a href={apt.meetingLink} target="_blank" rel="noreferrer" className="inline-link">
                              Open link
                            </a>
                          ) : (
                            <span className="text-muted">Not set</span>
                          )}
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button className="btn-small" onClick={() => openMeetingModal(apt)} title="Add/Edit meeting link">
                              <FiEdit2 size={14} />
                            </button>
                            <button className="btn-small" onClick={() => openPrescriptionModal(apt)} title="Issue prescription">
                              <FiPlus size={14} />
                            </button>
                            {apt.status !== 'completed' && (
                              <button
                                className="btn-small btn-success"
                                onClick={() => handleCompleteAppointment(apt.id)}
                                title="Mark completed"
                              >
                                <FiCheckCircle size={14} />
                              </button>
                            )}
                            <button
                              className="btn-small"
                              onClick={() => navigate(`/consultation/${apt.id}`)}
                              title="Open consultation room"
                            >
                              <FiVideo size={14} />
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
            <div className="modal-content">
              <div className="modal-header">
                {modalType === 'meeting' ? 'Add Meeting Link' : 'Issue Prescription'}
                <span className="modal-close" onClick={() => setShowModal(false)}>&times;</span>
              </div>

              <form>
                {modalType === 'meeting' && (
                  <div className="form-group">
                    <label htmlFor="meetingLink">Meeting Link</label>
                    <input
                      type="url"
                      id="meetingLink"
                      name="meetingLink"
                      value={formData.meetingLink}
                      onChange={handleFormChange}
                      placeholder="Paste Google Meet or Zoom link"
                    />
                  </div>
                )}

                {modalType === 'prescription' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="medications">Medications</label>
                      <textarea
                        id="medications"
                        name="medications"
                        value={formData.medications}
                        onChange={handleFormChange}
                        rows="3"
                        placeholder="Enter medications"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="dosageInstructions">Dosage Instructions</label>
                      <textarea
                        id="dosageInstructions"
                        name="dosageInstructions"
                        value={formData.dosageInstructions}
                        onChange={handleFormChange}
                        rows="3"
                        placeholder="Enter dosage instructions"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="medicalNotes">Medical Notes</label>
                      <textarea
                        id="medicalNotes"
                        name="medicalNotes"
                        value={formData.medicalNotes}
                        onChange={handleFormChange}
                        rows="3"
                        placeholder="Enter medical notes"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="followUpRecommendations">Follow-up Recommendations</label>
                      <textarea
                        id="followUpRecommendations"
                        name="followUpRecommendations"
                        value={formData.followUpRecommendations}
                        onChange={handleFormChange}
                        rows="3"
                        placeholder="Enter follow-up recommendations"
                      />
                    </div>
                  </>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={modalType === 'meeting' ? handleAddMeetingLink : handleIssuePrescription}
                  >
                    {modalType === 'meeting' ? 'Save & Share' : 'Issue Prescription'}
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

export default AdminAppointments;
