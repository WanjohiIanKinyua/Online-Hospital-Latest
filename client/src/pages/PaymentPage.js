import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import '../styles/PaymentPage.css';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import { API_BASE_URL } from '../config/api';

function PaymentPage() {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const paymentPhoneNumber = '0703120716';

  const fetchAppointment = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointment(response.data);
    } catch (err) {
      setError('Failed to load appointment details');
    }
  }, [appointmentId, token]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const handlePayment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
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

      setPaymentSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!appointment) {
    return <div className="loading">Loading payment details...</div>;
  }

  if (paymentSuccess) {
    return (
      <div className="payment-page">
        <div className="success-container">
          <div className="success-icon">
            <FiCheckCircle size={64} />
          </div>
          <h1>Payment Successful!</h1>
          <p>Your consultation has been confirmed.</p>
          <div className="success-details">
            <p>
              Appointment Date: <strong>{new Date(appointment.appointmentDate).toLocaleDateString()}</strong>
            </p>
            <p>
              Time: <strong>{appointment.appointmentTime}</strong>
            </p>
            <p>
              Amount Paid: <strong>KSH 1000</strong>
            </p>
          </div>
          <p style={{ marginTop: '20px', color: '#999' }}>Redirecting to dashboard in 3 seconds...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page">
      <div className="container">
        <Link to="/dashboard" className="back-button">
          <FiArrowLeft /> Back to Dashboard
        </Link>

        <div className="payment-card">
          <h1>Complete Your Payment</h1>

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="appointment-details">
            <h3>Appointment Details</h3>
            <div className="detail-item">
              <span>Doctor:</span>
              <strong>{appointment.doctorName}</strong>
            </div>
            <div className="detail-item">
              <span>Date:</span>
              <strong>{new Date(appointment.appointmentDate).toLocaleDateString()}</strong>
            </div>
            <div className="detail-item">
              <span>Time:</span>
              <strong>{appointment.appointmentTime}</strong>
            </div>
          </div>

          <form onSubmit={handlePayment}>
            <div className="manual-payment-instruction">
              <span>Payment</span>
              <strong>Send money to {paymentPhoneNumber}</strong>
            </div>

            <div className="price-summary">
              <div className="summary-row">
                <span>Consultation Fee:</span>
                <strong>KSH 1000</strong>
              </div>
              <div className="summary-row">
                <span>Processing Fee:</span>
                <strong>KSH 0</strong>
              </div>
              <div className="summary-row total">
                <span>Total Amount:</span>
                <strong>KSH 1000</strong>
              </div>
            </div>

            <button type="submit" className="btn-pay" disabled={loading}>
              {loading ? 'Booking...' : 'Book'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;
