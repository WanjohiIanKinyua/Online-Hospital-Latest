import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import '../styles/ChatRoom.css';
import { API_BASE_URL } from '../config/api';

const GENERAL_THREAD_ID = 'general-enquiries';

function PatientChat() {
  const token = localStorage.getItem('token');
  const [appointments, setAppointments] = useState([]);
  const [generalThread, setGeneralThread] = useState(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBackupLink, setSelectedBackupLink] = useState('');
  const messagesContainerRef = useRef(null);
  const scrollToBottom = () => {
    if (!messagesContainerRef.current) return;
    const node = messagesContainerRef.current;
    node.scrollTop = node.scrollHeight;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  };

  const selectedAppointment = useMemo(
    () => appointments.find((a) => a.id === selectedAppointmentId && selectedAppointmentId !== GENERAL_THREAD_ID),
    [appointments, selectedAppointmentId]
  );
  const sharedBackupLink = useMemo(() => {
    if (selectedAppointment?.meetingLink) return selectedAppointment.meetingLink;
    const withLink = appointments.find((apt) => apt.meetingLink);
    return withLink?.meetingLink || '';
  }, [appointments, selectedAppointment]);
  const totalUnread = useMemo(
    () =>
      appointments.reduce((sum, apt) => sum + Number(apt.unreadCount || 0), 0) +
      Number(generalThread?.unreadCount || 0),
    [appointments, generalThread]
  );

  useEffect(() => {
    loadAppointments();
    loadGeneralThread();
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  useEffect(() => {
    if (!selectedAppointmentId) return;
    if (selectedAppointmentId === GENERAL_THREAD_ID) {
      loadGeneralMessages();
    } else {
      loadMessages(selectedAppointmentId);
    }

    const intervalId = setInterval(() => {
      if (selectedAppointmentId === GENERAL_THREAD_ID) {
        loadGeneralMessages();
      } else {
        loadMessages(selectedAppointmentId);
      }
      loadAppointments(false);
      loadGeneralThread();
    }, 5000);

    return () => clearInterval(intervalId);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [selectedAppointmentId]);

  const loadAppointments = async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data);
      if (!selectedAppointmentId) {
        setSelectedAppointmentId(GENERAL_THREAD_ID);
      }
    } catch (error) {
      // no-op
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const loadMessages = async (appointmentId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/appointments/${appointmentId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      // no-op
    }
  };

  const loadGeneralThread = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/general/threads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGeneralThread(response.data?.[0] || null);
    } catch (error) {
      setGeneralThread(null);
    }
  };

  const loadGeneralMessages = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/general/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      // no-op
    }
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages.length, selectedAppointmentId]);

  const sendMessage = async () => {
    if (!selectedAppointmentId || !messageInput.trim()) return;

    try {
      if (selectedAppointmentId === GENERAL_THREAD_ID) {
        await axios.post(
          `${API_BASE_URL}/api/chat/general/messages`,
          { message: messageInput },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/api/chat/appointments/${selectedAppointmentId}/messages`,
          { message: messageInput },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setMessageInput('');
      if (selectedAppointmentId === GENERAL_THREAD_ID) {
        await loadGeneralMessages();
      } else {
        await loadMessages(selectedAppointmentId);
      }
      await loadAppointments(false);
      await loadGeneralThread();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to send message');
    }
  };

  const openBackupLinkModal = (e, link) => {
    e.preventDefault();
    if (!link) return;
    setSelectedBackupLink(link);
  };

  const copyBackupLink = async () => {
    if (!selectedBackupLink) return;
    try {
      await navigator.clipboard.writeText(selectedBackupLink);
      alert('Backup meet link copied.');
    } catch (copyError) {
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  const openGeneralChat = () => {
    setSelectedAppointmentId(GENERAL_THREAD_ID);
    setMessageInput('');
  };

  if (loading) {
    return (
      <DashboardLayout role="patient">
        <div className="chat-loading">Loading chat...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="patient">
      <div className="chat-page">
        <div className="chat-sidebar">
          <h3>Your Chats</h3>
          <p className="chat-unread-summary">
            Unread messages: {totalUnread}
          </p>
          <div className="general-chat-highlight">
            <div className="general-chat-title">General Enquiries</div>
            <div className="general-chat-subtitle">No appointment needed</div>
            <div className="general-chat-note">Separate from booked appointment chats</div>
          </div>
          <button
            type="button"
            className="btn-start-enquiry"
            onClick={openGeneralChat}
          >
            + Start New Chat (General)
          </button>
          <button
            className={`chat-thread ${selectedAppointmentId === GENERAL_THREAD_ID ? 'active' : ''}`}
            onClick={openGeneralChat}
          >
            <div className="chat-thread-title-row">
              <span className="chat-thread-title">General Enquiries</span>
              {Number(generalThread?.unreadCount || 0) > 0 && (
                <span className="chat-unread-badge">{Number(generalThread?.unreadCount || 0)}</span>
              )}
            </div>
            <div className="chat-thread-sub">
              {generalThread?.lastMessage || 'Ask any question without booking an appointment.'}
            </div>
          </button>

          <p className="chat-section-title">Appointment Chats</p>
          {appointments.length === 0 ? (
            <p className="chat-empty">No appointments available for chat.</p>
          ) : (
            appointments.map((apt) => (
              <button
                key={apt.id}
                className={`chat-thread ${selectedAppointmentId === apt.id ? 'active' : ''}`}
                onClick={() => setSelectedAppointmentId(apt.id)}
              >
                <div className="chat-thread-title-row">
                  <span className="chat-thread-title">
                    {new Date(apt.appointmentDate).toLocaleDateString()} {apt.appointmentTime}
                  </span>
                  {Number(apt.unreadCount || 0) > 0 && (
                    <span className="chat-unread-badge">{Number(apt.unreadCount || 0)}</span>
                  )}
                </div>
                <div className="chat-thread-sub">{apt.lastMessage || 'No messages yet'}</div>
                {Number(apt.unreadCount || 0) > 0 && (
                  <div className="chat-thread-unread-text">
                    {Number(apt.unreadCount || 0)} unread message{Number(apt.unreadCount || 0) > 1 ? 's' : ''}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        <div className="chat-main">
          <div className="chat-main-header">
            <h2>{selectedAppointmentId === GENERAL_THREAD_ID ? 'General Enquiries Chat' : 'Doctor Chat Room'}</h2>
            {selectedAppointmentId !== GENERAL_THREAD_ID && (
              <button
                type="button"
                className="backup-link-btn"
                onClick={openGeneralChat}
              >
                Start New Enquiry
              </button>
            )}
            {sharedBackupLink && (
              <button
                type="button"
                className="backup-link-btn"
                onClick={(e) => openBackupLinkModal(e, sharedBackupLink)}
              >
                Open Shared Link
              </button>
            )}
            {selectedAppointment && (
              <div className="chat-main-meta">
                <span>Approval: {selectedAppointment.approvalStatus || 'pending'}</span>
              </div>
            )}
          </div>

          <div className="chat-messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">
                {selectedAppointmentId === GENERAL_THREAD_ID
                  ? 'Start a new general conversation with the doctor/admin team.'
                  : 'Start the conversation with your doctor.'}
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.senderRole === 'patient' ? 'mine' : 'theirs'}`}>
                  <div className="chat-message-name">{msg.senderName}</div>
                  <div className="chat-message-text">{msg.message}</div>
                  <div className="chat-message-time">{new Date(msg.createdAt).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>

          <div className="chat-input-bar">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type your question or reminder to the doctor..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
              }}
            />
            <button type="button" onClick={sendMessage}>Send</button>
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
                <button type="button" className="btn-submit" onClick={copyBackupLink}>
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
    </DashboardLayout>
  );
}

export default PatientChat;
