import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import '../styles/BookAppointment.css';
import { FiArrowLeft } from 'react-icons/fi';
import { DashboardLayout } from '../components/DashboardLayout';
import { API_BASE_URL } from '../config/api';

function BookAppointment() {
  const [formData, setFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    doctorName: 'Dr. Merceline'
  });
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const paymentPhoneNumber = '0703120716';

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/doctors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(response.data);
        if (response.data.length > 0) {
          setFormData((prev) => ({ ...prev, doctorName: response.data[0].fullName }));
        } else {
          setFormData((prev) => ({ ...prev, doctorName: 'Dr. Merceline' }));
        }
      } catch (err) {
        setDoctors([]);
        setFormData((prev) => ({ ...prev, doctorName: 'Dr. Merceline' }));
      }
    };

    fetchDoctors();
  }, [token]);

  useEffect(() => {
    const fetchSlots = async () => {
      if (!formData.appointmentDate) {
        setAvailableSlots([]);
        return;
      }

      setSlotsLoading(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/available-slots`, {
          params: { date: formData.appointmentDate },
          headers: { Authorization: `Bearer ${token}` }
        });
        setAvailableSlots(response.data);
      } catch (err) {
        setAvailableSlots([]);
        setError(err.response?.data?.error || 'Failed to load available slots');
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [formData.appointmentDate, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'appointmentDate') {
      setFormData((prev) => ({
        ...prev,
        appointmentDate: value,
        appointmentTime: ''
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!formData.appointmentDate || !formData.appointmentTime) {
      setError('Please select both date and time');
      setLoading(false);
      return;
    }

    try {
      const appointmentRes = await axios.post(`${API_BASE_URL}/api/appointments/book`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const appointmentId = appointmentRes.data.appointmentId;

      await axios.post(
        `${API_BASE_URL}/api/payments/create`,
        {
          appointmentId,
          amount: 1000,
          paymentMethod: 'manual_phone',
          phoneNumber: paymentPhoneNumber
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setSuccess('You have successfully booked an appointment. Redirecting to booked appointments...');
      setTimeout(() => {
        navigate('/appointments');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to book appointment');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <DashboardLayout role="patient">
      <div className="book-appointment-page">
        <div className="container">
          <Link to="/dashboard" className="back-button">
            <FiArrowLeft /> Back to Dashboard
          </Link>

          <div className="booking-card">
            <h1>Book a Consultation</h1>
            <p className="consultation-fee">Consultation Fee: <strong>KSH 1000</strong></p>

            <form onSubmit={handleBookAppointment}>
              {error && <div className="alert alert-danger">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <div className="form-group">
                <label htmlFor="appointmentDate">Preferred Date</label>
                <input
                  type="date"
                  id="appointmentDate"
                  name="appointmentDate"
                  value={formData.appointmentDate}
                  onChange={handleChange}
                  min={today}
                  required
                />
                <small>Select your preferred consultation date</small>
              </div>

              <div className="form-group">
                <label htmlFor="appointmentTime">Preferred Time</label>
                <select
                  id="appointmentTime"
                  name="appointmentTime"
                  value={formData.appointmentTime}
                  onChange={handleChange}
                  disabled={!formData.appointmentDate || slotsLoading || availableSlots.length === 0}
                  required
                >
                  <option value="">Select available time</option>
                  {availableSlots.map((slot) => (
                    <option key={slot.id} value={slot.slotTime}>
                      {slot.slotTime}
                    </option>
                  ))}
                </select>
                <small>
                  {!formData.appointmentDate
                    ? 'Select a date first'
                    : slotsLoading
                      ? 'Loading available slots...'
                      : availableSlots.length === 0
                        ? 'No available slots for this date'
                        : 'Only admin-available slots are shown'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="doctorName">Doctor/Department</label>
                <select
                  id="doctorName"
                  name="doctorName"
                  value={formData.doctorName}
                  onChange={handleChange}
                >
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

              <div className="payment-instruction">
                <span>Payment</span>
                <strong>Send money to {paymentPhoneNumber}</strong>
              </div>

              <div className="booking-summary">
                <h3>Appointment Summary</h3>
                <div className="summary-item">
                  <span>Consultation Fee:</span>
                  <strong>KSH 1000</strong>
                </div>
                {formData.appointmentDate && (
                  <div className="summary-item">
                    <span>Scheduled Date:</span>
                    <strong>{new Date(formData.appointmentDate).toLocaleDateString()}</strong>
                  </div>
                )}
                {formData.appointmentTime && (
                  <div className="summary-item">
                    <span>Scheduled Time:</span>
                    <strong>{formData.appointmentTime}</strong>
                  </div>
                )}
              </div>

              <button type="submit" className="btn-book-appointment" disabled={loading}>
                {loading ? 'Booking...' : 'Book'}
              </button>

              <p className="disclaimer">
                After booking, your request will be reviewed by admin. If rejected, a reason will be shown on your dashboard.
              </p>
            </form>
          </div>
        </div>
      </div>

    </DashboardLayout>
  );
}

export default BookAppointment;
