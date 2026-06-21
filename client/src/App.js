import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import axios from 'axios';
import './App.css';
import { API_BASE_URL } from './config/api';

// Pages
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PatientDashboard from './pages/PatientDashboard';
import PatientAppointments from './pages/PatientAppointments';
import PatientChat from './pages/PatientChat';
import PatientProfile from './pages/PatientProfile';
import AdminDashboard from './pages/AdminDashboard';
import AdminAppointments from './pages/admin/AdminAppointments';
import AdminPatients from './pages/admin/AdminPatients';
import AdminSchedule from './pages/admin/AdminSchedule';
import AdminApprovals from './pages/admin/AdminApprovals';
import AdminBookAppointment from './pages/admin/AdminBookAppointment';
import AdminDoctors from './pages/admin/AdminDoctors';
import AdminChat from './pages/admin/AdminChat';
import AdminDoctorNotes from './pages/admin/AdminDoctorNotes';
import BookAppointment from './pages/BookAppointment';
import Consultation from './pages/Consultation';
import PaymentPage from './pages/PaymentPage';
import Prescriptions from './pages/Prescriptions';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const ACTIVITY_POLL_MS = 5000;

const toNumber = (value) => Number(value || 0);
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const getLatestAppointment = (appointments = []) => {
  if (!Array.isArray(appointments) || appointments.length === 0) return null;

  const sorted = [...appointments].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.createdat || a.appointmentDate || 0).getTime();
    const bTime = new Date(b.createdAt || b.createdat || b.appointmentDate || 0).getTime();
    return bTime - aTime;
  });

  return sorted[0];
};

const buildAdminNotice = (unreadCount, pendingBooked) => {
  const parts = [];
  if (unreadCount > 0) {
    parts.push(`You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} from patients.`);
  }
  if (pendingBooked > 0) {
    parts.push(`You have ${pendingBooked} booked appointment${pendingBooked === 1 ? '' : 's'} awaiting action.`);
  }
  return parts.join(' ');
};

const buildPatientNotice = (unreadCount, latestStatus) => {
  const parts = [];
  if (unreadCount > 0) {
    parts.push(`You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} from admin.`);
  }
  if (latestStatus === 'approved' || latestStatus === 'rejected') {
    parts.push(`Your last booking was ${latestStatus}.`);
  }
  return parts.join(' ');
};

const getAlertVariant = (message = '') => {
  const normalized = String(message).toLowerCase();
  const errorTokens = [
    'fail',
    'failed',
    'error',
    'cannot',
    'not allowed',
    'not found',
    'invalid',
    'required',
    'rejected',
    'unable'
  ];

  return errorTokens.some((token) => normalized.includes(token)) ? 'error' : 'success';
};

function IdleSessionHandler({ isAuthenticated, userRole }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !userRole) {
      return undefined;
    }

    let timeoutId;

    const logoutForInactivity = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userId');
      localStorage.removeItem('userName');
      window.dispatchEvent(new Event('storage'));
      navigate('/', { replace: true });
    };

    const resetInactivityTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutForInactivity, IDLE_TIMEOUT_MS);
    };

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });

    resetInactivityTimer();

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, [isAuthenticated, userRole, navigate]);

  return null;
}

function GlobalActivityNotifier({ isAuthenticated, userRole }) {
  const [notice, setNotice] = useState('');
  const isPrimedRef = useRef(false);
  const snapshotRef = useRef({
    unread: 0,
    pendingBooked: 0,
    latestBookingKey: ''
  });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 60000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!isAuthenticated || !userRole) {
      isPrimedRef.current = false;
      snapshotRef.current = {
        unread: 0,
        pendingBooked: 0,
        latestBookingKey: ''
      };
      setNotice('');
      return undefined;
    }

    let stopped = false;

    const fetchUnreadCount = async (token, role) => {
      try {
        const unreadRes = await axios.get(`${API_BASE_URL}/api/chat/unread-summary`, {
          headers: authHeaders(token)
        });
        return role === 'admin'
          ? toNumber(unreadRes.data?.unreadFromPatients || unreadRes.data?.unreadTotal)
          : toNumber(unreadRes.data?.unreadFromAdmin || unreadRes.data?.unreadTotal);
      } catch (primaryError) {
        try {
          const [appointmentThreadsRes, generalThreadsRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/api/chat/appointments`, {
              headers: authHeaders(token)
            }),
            axios.get(`${API_BASE_URL}/api/chat/general/threads`, {
              headers: authHeaders(token)
            })
          ]);

          const appointmentUnread = (appointmentThreadsRes.data || []).reduce(
            (sum, item) => sum + toNumber(item.unreadCount),
            0
          );
          const generalUnread = (generalThreadsRes.data || []).reduce(
            (sum, item) => sum + toNumber(item.unreadCount),
            0
          );
          return appointmentUnread + generalUnread;
        } catch (fallbackError) {
          return snapshotRef.current.unread;
        }
      }
    };

    const pollActivity = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const unreadCount = await fetchUnreadCount(token, userRole);

        if (userRole === 'admin') {
          const appointmentsRes = await axios.get(`${API_BASE_URL}/api/admin/appointments`, {
            headers: authHeaders(token)
          });
          const pendingBooked = (appointmentsRes.data || []).filter(
            (apt) => apt.approvalStatus === 'pending' || apt.status === 'pending'
          ).length;

          if (!stopped && !isPrimedRef.current) {
            const initialNotice = buildAdminNotice(unreadCount, pendingBooked);
            if (initialNotice) {
              setNotice(initialNotice);
            }
          } else if (!stopped && isPrimedRef.current) {
            const hasNewMessages = unreadCount > snapshotRef.current.unread;
            const hasNewBookings = pendingBooked > snapshotRef.current.pendingBooked;
            if (hasNewMessages || hasNewBookings) {
              const liveNotice = buildAdminNotice(unreadCount, pendingBooked);
              if (liveNotice) {
                setNotice(liveNotice);
              }
            }
          }

          if (!stopped) {
            snapshotRef.current = {
              unread: unreadCount,
              pendingBooked,
              latestBookingKey: ''
            };
          }
        } else {
          const appointmentsRes = await axios.get(`${API_BASE_URL}/api/appointments`, {
            headers: authHeaders(token)
          });
          const latest = getLatestAppointment(appointmentsRes.data || []);
          const latestStatus = latest?.approvalStatus || '';
          const latestBookingKey = latest ? `${latest.id}:${latestStatus}` : '';

          if (!stopped && !isPrimedRef.current) {
            const initialNotice = buildPatientNotice(unreadCount, latestStatus);
            if (initialNotice) {
              setNotice(initialNotice);
            }
          } else if (!stopped && isPrimedRef.current) {
            const hasNewAdminText = unreadCount > snapshotRef.current.unread;
            let shouldNotify = false;
            if (
              latestBookingKey &&
              latestBookingKey !== snapshotRef.current.latestBookingKey &&
              (latestStatus === 'approved' || latestStatus === 'rejected')
            ) {
              shouldNotify = true;
            } else if (hasNewAdminText) {
              shouldNotify = true;
            }
            if (shouldNotify) {
              const liveNotice = buildPatientNotice(unreadCount, latestStatus);
              if (liveNotice) {
                setNotice(liveNotice);
              }
            }
          }

          if (!stopped) {
            snapshotRef.current = {
              unread: unreadCount,
              pendingBooked: 0,
              latestBookingKey
            };
          }
        }

        if (!stopped && !isPrimedRef.current) {
          isPrimedRef.current = true;
        }
      } catch (error) {
        // Silent failure: keep polling for next successful cycle.
      }
    };

    pollActivity();
    const intervalId = setInterval(pollActivity, ACTIVITY_POLL_MS);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }, [isAuthenticated, userRole]);

  if (!notice) return null;

  return (
    <div className="global-activity-notice" role="status" aria-live="polite">
      <div className="global-activity-notice-text">{notice}</div>
      <button
        type="button"
        className="global-activity-notice-close"
        onClick={() => setNotice('')}
        aria-label="Close activity notification"
      >
        x
      </button>
    </div>
  );
}

function GlobalAlertBridge() {
  const [alertState, setAlertState] = useState({
    open: false,
    message: '',
    variant: 'success',
    mode: 'alert',
    resolver: null
  });

  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    const originalConfirm = window.confirm.bind(window);

    window.alert = (message) => {
      setAlertState({
        open: true,
        message: String(message || ''),
        variant: getAlertVariant(message),
        mode: 'alert',
        resolver: null
      });
    };

    window.confirm = (message) => new Promise((resolve) => {
      setAlertState({
        open: true,
        message: String(message || ''),
        variant: 'confirm',
        mode: 'confirm',
        resolver: resolve
      });
    });

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, []);

  useEffect(() => {
    if (!alertState.open || alertState.mode === 'confirm') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAlertState((current) => ({ ...current, open: false, resolver: null }));
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [alertState.open, alertState.message, alertState.mode]);

  if (!alertState.open) {
    return null;
  }

  const closePopup = (confirmed = false) => {
    if (typeof alertState.resolver === 'function') {
      alertState.resolver(confirmed);
    }
    setAlertState((current) => ({ ...current, open: false, resolver: null }));
  };

  const title =
    alertState.mode === 'confirm'
      ? 'Please Confirm'
      : alertState.variant === 'error'
        ? 'Action Needed'
        : 'Success';

  return (
    <div className="global-alert-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className={`global-alert-popup ${alertState.variant}`}>
        <button
          type="button"
          className="global-alert-close"
          onClick={() => closePopup(false)}
          aria-label="Close alert"
        >
          x
        </button>
        <div className="global-alert-title">{title}</div>
        <div className="global-alert-message">{alertState.message}</div>
        <div className="global-alert-actions">
          {alertState.mode === 'confirm' ? (
            <>
              <button
                type="button"
                className="global-alert-button secondary"
                onClick={() => closePopup(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="global-alert-button"
                onClick={() => closePopup(true)}
              >
                Confirm
              </button>
            </>
          ) : (
            <button
              type="button"
              className="global-alert-button"
              onClick={() => closePopup(false)}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    
    if (token && role) {
      setIsAuthenticated(true);
      setUserRole(role);
    } else {
      setIsAuthenticated(false);
      setUserRole(null);
    }
  };

  useEffect(() => {
    // Check if user is logged in
    checkAuth();
    setLoading(false);

    // Listen for storage changes (logout from other tabs or within the app)
    window.addEventListener('storage', checkAuth);
    
    return () => {
      window.removeEventListener('storage', checkAuth);
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <IdleSessionHandler isAuthenticated={isAuthenticated} userRole={userRole} />
      <GlobalActivityNotifier isAuthenticated={isAuthenticated} userRole={userRole} />
      <GlobalAlertBridge />
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {!isAuthenticated ? (
          <>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} />} />
            <Route path="/register" element={<Register setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <>
            {userRole === 'patient' && (
              <>
                <Route path="/dashboard" element={<PatientDashboard />} />
                <Route path="/book-appointment" element={<BookAppointment />} />
                <Route path="/appointments" element={<PatientAppointments />} />
                <Route path="/chat" element={<PatientChat />} />
                <Route path="/profile" element={<PatientProfile />} />
                <Route path="/consultation/:appointmentId" element={<Consultation />} />
                <Route path="/payment/:appointmentId" element={<PaymentPage />} />
                <Route path="/prescriptions" element={<Prescriptions />} />
                <Route path="*" element={<Navigate to="/dashboard" />} />
              </>
            )}
            {userRole === 'admin' && (
              <>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/schedule" element={<AdminSchedule />} />
                <Route path="/admin/approvals" element={<AdminApprovals />} />
                <Route path="/admin/book-for-patient" element={<AdminBookAppointment />} />
                <Route path="/admin/doctors" element={<AdminDoctors />} />
                <Route path="/admin/chat" element={<AdminChat />} />
                <Route path="/admin/doctor-notes" element={<AdminDoctorNotes />} />
                <Route path="/admin/appointments" element={<AdminAppointments />} />
                <Route path="/admin/patients" element={<AdminPatients />} />
                <Route path="/consultation/:appointmentId" element={<Consultation />} />
                <Route path="*" element={<Navigate to="/admin" />} />
              </>
            )}
          </>
        )}
      </Routes>
      <Analytics />
      <SpeedInsights />
    </Router>
  );
}

export default App;
