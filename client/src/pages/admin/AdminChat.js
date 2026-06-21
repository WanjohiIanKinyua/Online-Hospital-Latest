import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ChatRoom.css';
import { API_BASE_URL } from '../../config/api';

function AdminChat() {
  const token = localStorage.getItem('token');
  const [appointments, setAppointments] = useState([]);
  const [generalThreads, setGeneralThreads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [selectedGeneralPatientId, setSelectedGeneralPatientId] = useState('');
  const [selectedThreadType, setSelectedThreadType] = useState('appointment');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [fallbackLinkInput, setFallbackLinkInput] = useState('');
  const [loading, setLoading] = useState(true);
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
    () => appointments.find((a) => a.id === selectedAppointmentId),
    [appointments, selectedAppointmentId]
  );

  const selectedGeneralThread = useMemo(
    () => generalThreads.find((g) => g.patientId === selectedGeneralPatientId),
    [generalThreads, selectedGeneralPatientId]
  );

  const filteredAppointments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return appointments;
    return appointments.filter((apt) => String(apt.patientName || '').toLowerCase().includes(query));
  }, [appointments, searchTerm]);

  const filteredGeneralThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return generalThreads;
    return generalThreads.filter((thread) => String(thread.patientName || '').toLowerCase().includes(query));
  }, [generalThreads, searchTerm]);

  const totalUnread = useMemo(
    () =>
      appointments.reduce((sum, apt) => sum + Number(apt.unreadCount || 0), 0) +
      generalThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
    [appointments, generalThreads]
  );

  useEffect(() => {
    loadAppointments();
    loadGeneralThreads();
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  useEffect(() => {
    const activeId = selectedThreadType === 'appointment' ? selectedAppointmentId : selectedGeneralPatientId;
    if (!activeId) return;

    const loadSelectedThread = async () => {
      if (selectedThreadType === 'appointment') {
        await loadMessages(selectedAppointmentId);
      } else {
        await loadGeneralMessages(selectedGeneralPatientId);
      }
      await loadAppointments(false);
      await loadGeneralThreads();
    };
    loadSelectedThread();
    if (selectedThreadType === 'appointment') {
      setFallbackLinkInput(selectedAppointment?.meetingLink || '');
    } else {
      setFallbackLinkInput('');
    }

    const intervalId = setInterval(() => {
      if (selectedThreadType === 'appointment') {
        loadMessages(selectedAppointmentId);
      } else {
        loadGeneralMessages(selectedGeneralPatientId);
      }
      loadAppointments(false);
      loadGeneralThreads();
    }, 5000);

    return () => clearInterval(intervalId);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [selectedAppointmentId, selectedGeneralPatientId, selectedThreadType]);

  useEffect(() => {
    setFallbackLinkInput(selectedAppointment?.meetingLink || '');
  }, [selectedAppointment?.meetingLink]);

  const loadAppointments = async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data);
      if (!selectedAppointmentId && !selectedGeneralPatientId && response.data.length > 0) {
        setSelectedAppointmentId(response.data[0].id);
        setSelectedThreadType('appointment');
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

  const loadGeneralThreads = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/general/threads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGeneralThreads(response.data || []);
      if (!selectedAppointmentId && !selectedGeneralPatientId && (response.data || []).length > 0) {
        setSelectedGeneralPatientId(response.data[0].patientId);
        setSelectedThreadType('general');
      }
    } catch (error) {
      // no-op
    }
  };

  const loadGeneralMessages = async (patientId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/general/${patientId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      // no-op
    }
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages.length, selectedAppointmentId, selectedGeneralPatientId, selectedThreadType]);

  const sendMessage = async () => {
    if (!messageInput.trim()) return;

    try {
      if (selectedThreadType === 'general') {
        if (!selectedGeneralPatientId) return;
        await axios.post(
          `${API_BASE_URL}/api/chat/general/${selectedGeneralPatientId}/messages`,
          { message: messageInput },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        if (!selectedAppointmentId) return;
        await axios.post(
          `${API_BASE_URL}/api/chat/appointments/${selectedAppointmentId}/messages`,
          { message: messageInput },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setMessageInput('');
      if (selectedThreadType === 'general') {
        await loadGeneralMessages(selectedGeneralPatientId);
      } else {
        await loadMessages(selectedAppointmentId);
      }
      await loadAppointments(false);
      await loadGeneralThreads();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to send message');
    }
  };

  const shareFallbackLink = async () => {
    if (selectedThreadType !== 'appointment') {
      alert('Backup link is only available for appointment chats');
      return;
    }

    if (!selectedAppointmentId || !fallbackLinkInput.trim()) {
      alert('Please enter a valid Google Meet link');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/chat/appointments/${selectedAppointmentId}/fallback-link`,
        { meetingLink: fallbackLinkInput },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadMessages(selectedAppointmentId);
      await loadAppointments(false);
      alert('Fallback link shared with patient');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to share fallback link');
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="chat-loading">Loading chat...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="chat-page">
        <div className="chat-sidebar">
          <h3>Patient Chats</h3>
          <p className="chat-unread-summary">
            Unread messages: {totalUnread}
          </p>
          <input
            type="text"
            className="chat-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient name..."
          />
          {filteredGeneralThreads.length > 0 && (
            <>
              <p className="chat-section-title">General Enquiries</p>
              {filteredGeneralThreads.map((thread) => (
                <button
                  key={`general-${thread.patientId}`}
                  className={`chat-thread ${selectedThreadType === 'general' && selectedGeneralPatientId === thread.patientId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedThreadType('general');
                    setSelectedGeneralPatientId(thread.patientId);
                  }}
                >
                  <div className="chat-thread-title-row">
                    <span className="chat-thread-title">{thread.patientName}</span>
                    {Number(thread.unreadCount || 0) > 0 && (
                      <span className="chat-unread-badge">{Number(thread.unreadCount || 0)}</span>
                    )}
                  </div>
                  <div className="chat-thread-sub">{thread.lastMessage || 'General enquiry thread'}</div>
                </button>
              ))}
            </>
          )}

          <p className="chat-section-title">Appointment Chats</p>
          {filteredAppointments.length === 0 ? (
            <p className="chat-empty">No appointment chats available.</p>
          ) : (
            filteredAppointments.map((apt) => (
              <button
                key={apt.id}
                className={`chat-thread ${selectedThreadType === 'appointment' && selectedAppointmentId === apt.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedThreadType('appointment');
                  setSelectedAppointmentId(apt.id);
                }}
              >
                <div className="chat-thread-title-row">
                  <span className="chat-thread-title">{apt.patientName}</span>
                  {Number(apt.unreadCount || 0) > 0 && (
                    <span className="chat-unread-badge">
                      {Number(apt.unreadCount || 0)}
                    </span>
                  )}
                </div>
                <div className="chat-thread-sub">
                  {new Date(apt.appointmentDate).toLocaleDateString()} {apt.appointmentTime}
                </div>
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
            <h2>{selectedThreadType === 'general' ? 'General Enquiries Room' : 'Doctor Response Room'}</h2>
            {(selectedAppointment || selectedGeneralThread) && (
              <div className="chat-main-meta">
                <span className="chat-header-unread">
                  You have {totalUnread} unread message{totalUnread === 1 ? '' : 's'}
                </span>
                {selectedThreadType === 'general' && selectedGeneralThread ? (
                  <span>{selectedGeneralThread.patientName} ({selectedGeneralThread.patientEmail})</span>
                ) : (
                  <span>{selectedAppointment?.patientName} ({selectedAppointment?.patientEmail})</span>
                )}
              </div>
            )}
          </div>

          {selectedThreadType === 'appointment' && (
            <div className="fallback-link-box">
              <input
                type="url"
                value={fallbackLinkInput}
                onChange={(e) => setFallbackLinkInput(e.target.value)}
                placeholder="Paste backup Google Meet link here"
              />
              <button type="button" onClick={shareFallbackLink}>Share Backup Link</button>
            </div>
          )}

          <div className="chat-messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">No messages in this conversation yet.</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.senderRole === 'admin' ? 'mine' : 'theirs'}`}>
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
              placeholder={selectedThreadType === 'general' ? 'Reply to general enquiry...' : 'Reply to patient...'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
              }}
            />
            <button type="button" onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminChat;
