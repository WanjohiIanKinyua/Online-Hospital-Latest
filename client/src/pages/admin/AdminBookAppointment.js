import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiClock } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminBookAppointment() {
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [bookableSlots, setBookableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    patientId: '',
    appointmentDate: '',
    appointmentTime: '',
    doctorName: 'Dr. Merceline'
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [patientsRes, doctorsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/admin/patients`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/api/appointments/doctors`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        setPatients(patientsRes.data);
        setDoctors(doctorsRes.data);
        if (doctorsRes.data.length > 0) {
          setFormData((prev) => ({ ...prev, doctorName: doctorsRes.data[0].fullName }));
        }
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to load booking data');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [token]);

  useEffect(() => {
    const fetchAvailableSlots = async () => {
      if (!formData.appointmentDate) {
        setBookableSlots([]);
        return;
      }

      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/available-slots`, {
          params: { date: formData.appointmentDate },
          headers: { Authorization: `Bearer ${token}` }
        });
        setBookableSlots(response.data);
      } catch (error) {
        setBookableSlots([]);
      }
    };

    fetchAvailableSlots();
  }, [formData.appointmentDate, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'appointmentDate') {
      setFormData((prev) => ({ ...prev, appointmentDate: value, appointmentTime: '' }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.patientId || !formData.appointmentDate || !formData.appointmentTime) {
      alert('Please select patient, date, and time');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/admin/appointments/book`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert('Appointment booked successfully');
      setFormData({
        patientId: '',
        appointmentDate: '',
        appointmentTime: '',
        doctorName: doctors.length > 0 ? doctors[0].fullName : 'Dr. Merceline'
      });
      setBookableSlots([]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to book appointment for patient');
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const filteredPatients = patients.filter((patient) => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return true;
    return String(patient.fullName || '').toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading booking form...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Book Appointment For Patient</h1>
            <p className="dashboard-subtitle">Create and auto-approve appointment bookings from available slots</p>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="patientSearch">Search Patient By Name</label>
                  <input
                    type="text"
                    id="patientSearch"
                    name="patientSearch"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Type patient name..."
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="patientId">Patient</label>
                  <select id="patientId" name="patientId" value={formData.patientId} onChange={handleChange}>
                    <option value="">Select patient</option>
                    {filteredPatients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.fullName} ({patient.email})
                      </option>
                    ))}
                  </select>
                  {patientSearch.trim() && filteredPatients.length === 0 && (
                    <p className="text-muted">No patients found for "{patientSearch}".</p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="doctorName">Doctor/Department</label>
                  <select id="doctorName" name="doctorName" value={formData.doctorName} onChange={handleChange}>
                    {doctors.length > 0 ? (
                      doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.fullName}>
                          {doctor.fullName}
                        </option>
                      ))
                    ) : (
                      <option value="Dr. Merceline">Dr. Merceline</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="appointmentDate">Date</label>
                  <input
                    type="date"
                    id="appointmentDate"
                    name="appointmentDate"
                    value={formData.appointmentDate}
                    onChange={handleChange}
                    min={today}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="appointmentTime">Available Time</label>
                  <select
                    id="appointmentTime"
                    name="appointmentTime"
                    value={formData.appointmentTime}
                    onChange={handleChange}
                    disabled={!formData.appointmentDate}
                  >
                    <option value="">Select available time</option>
                    {bookableSlots.map((slot) => (
                      <option key={slot.id} value={slot.slotTime}>
                        {slot.slotTime}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!formData.appointmentDate && <p className="text-muted">Select date to load available slots.</p>}
              {formData.appointmentDate && bookableSlots.length === 0 && (
                <p className="text-muted">No available slots for this date.</p>
              )}

              <button type="submit" className="btn-primary-small">
                <FiClock /> Book For Patient
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminBookAppointment;
