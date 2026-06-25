import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiLogOut,
  FiLayout,
  FiCalendar,
  FiPlusSquare,
  FiMessageSquare,
  FiFileText,
  FiSettings,
  FiUsers,
  FiBarChart2,
  FiClock,
  FiCheckSquare,
  FiUserPlus,
  FiUser,
  FiEdit3,
  FiMenu,
  FiX
} from 'react-icons/fi';
import '../styles/DashboardLayout.css';
import { API_BASE_URL } from '../config/api';

export function DashboardLayout({ children, role = 'patient' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarNavRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const userEmail = localStorage.getItem('userEmail') || 'user@example.com';
  const token = localStorage.getItem('token');
  const rawUserName = localStorage.getItem('userName');
  const userName =
    rawUserName && rawUserName !== 'undefined' && rawUserName !== 'null'
      ? rawUserName
      : (userEmail.split('@')[0] || 'User');

  const patientLinks = [
    { to: '/dashboard', icon: FiLayout, label: 'Overview' },
    { to: '/book-appointment', icon: FiPlusSquare, label: 'Book Appointment' },
    { to: '/appointments', icon: FiCalendar, label: 'Booked Appointments' },
    {
      to: '/chat',
      icon: FiMessageSquare,
      label: 'Chat Room',
      showUnreadBadge: true
    },
    { to: '/prescriptions', icon: FiFileText, label: 'Prescriptions' },
    { to: '/profile', icon: FiSettings, label: 'My Profile' }
  ];

  const adminLinks = [
    { to: '/admin', icon: FiBarChart2, label: 'Overview' },
    { to: '/admin/schedule', icon: FiClock, label: 'Schedule' },
    { to: '/admin/approvals', icon: FiCheckSquare, label: 'Approvals' },
    { to: '/admin/book-for-patient', icon: FiUserPlus, label: 'Book Patient' },
    { to: '/admin/doctors', icon: FiUser, label: 'Doctors' },
    { to: '/admin/doctor-notes', icon: FiEdit3, label: 'Doctor Notes' },
    {
      to: '/admin/chat',
      icon: FiMessageSquare,
      label: 'Chat Room',
      showUnreadBadge: true
    },
    { to: '/admin/appointments', icon: FiCalendar, label: 'Appointments' },
    { to: '/admin/patients', icon: FiUsers, label: 'Patients' }
  ];

  const links = role === 'admin' ? adminLinks : patientLinks;
  const sidebarScrollKey = `sidebarScroll:${role}`;
  const overviewPath = role === 'admin' ? '/admin' : '/dashboard';
  const dashboardPaths = links.map((link) => link.to);
  const shouldReplaceSidebarNavigation = (targetPath) => (
    targetPath !== location.pathname &&
    location.pathname !== overviewPath &&
    dashboardPaths.includes(location.pathname) &&
    dashboardPaths.includes(targetPath)
  );

  useLayoutEffect(() => {
    const nav = sidebarNavRef.current;
    if (!nav) return undefined;

    const savedScrollTop = Number(sessionStorage.getItem(sidebarScrollKey) || 0);
    if (savedScrollTop > 0) {
      nav.scrollTop = savedScrollTop;
    }

    const saveScrollPosition = () => {
      sessionStorage.setItem(sidebarScrollKey, String(nav.scrollTop));
    };

    nav.addEventListener('scroll', saveScrollPosition, { passive: true });
    return () => {
      saveScrollPosition();
      nav.removeEventListener('scroll', saveScrollPosition);
    };
  }, [sidebarScrollKey, location.pathname]);

  useEffect(() => {
    if (!token || !['patient', 'admin'].includes(role)) return undefined;

    const loadUnreadSummary = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/chat/unread-summary`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const count = role === 'admin'
          ? Number(response.data?.unreadFromPatients || response.data?.unreadTotal || 0)
          : Number(response.data?.unreadFromAdmin || response.data?.unreadTotal || 0);
        setUnreadChatCount(count);
      } catch (error) {
        try {
          const [appointmentThreadsRes, generalThreadsRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/api/chat/appointments`, {
              headers: { Authorization: `Bearer ${token}` }
            }),
            axios.get(`${API_BASE_URL}/api/chat/general/threads`, {
              headers: { Authorization: `Bearer ${token}` }
            })
          ]);

          const appointmentUnread = (appointmentThreadsRes.data || []).reduce(
            (sum, apt) => sum + Number(apt.unreadCount || 0),
            0
          );
          const generalUnread = (generalThreadsRes.data || []).reduce(
            (sum, thread) => sum + Number(thread.unreadCount || 0),
            0
          );
          setUnreadChatCount(appointmentUnread + generalUnread);
        } catch (fallbackError) {
          setUnreadChatCount(0);
        }
      }
    };

    loadUnreadSummary();
    const intervalId = setInterval(loadUnreadSummary, 10000);
    return () => clearInterval(intervalId);
  }, [role, token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    window.dispatchEvent(new Event('storage'));
    navigate('/');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="dashboard-layout">
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Link to="/" className="brand-logo">
            <span className="brand-icon">+</span>
            <span className="brand-text-wrap">
              <span className="brand-name">{userName}</span>
              <span className="brand-status">
                <span className="status-dot" />
                online
              </span>
            </span>
          </Link>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}>
            <FiX />
          </button>
        </div>

        <nav className="sidebar-nav" ref={sidebarNavRef}>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              replace={shouldReplaceSidebarNavigation(link.to)}
              className={`nav-link ${isActive(link.to) ? 'active' : ''}`}
              onClick={() => {
                if (sidebarNavRef.current) {
                  sessionStorage.setItem(sidebarScrollKey, String(sidebarNavRef.current.scrollTop));
                }
                setSidebarOpen(false);
              }}
            >
              <link.icon className="nav-icon" />
              <span className="nav-label">{link.label}</span>
              {link.showUnreadBadge && unreadChatCount > 0 && (
                <span className="nav-unread-badge">{unreadChatCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <p className="user-email">{userEmail}</p>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <FiLogOut className="logout-icon" />
            Sign Out
          </button>
        </div>
      </aside>

      <button
        className="mobile-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
      >
        {sidebarOpen ? <FiX /> : <FiMenu />}
      </button>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="dashboard-main">{children}</main>
    </div>
  );
}

export default DashboardLayout;
