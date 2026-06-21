import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiArrowLeft, FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiVolumeX } from 'react-icons/fi';
import '../styles/Consultation.css';
import { API_BASE_URL } from '../config/api';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const createClientId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function Consultation() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [mutedByAdmin, setMutedByAdmin] = useState(false);
  const [cameraControlledByAdmin, setCameraControlledByAdmin] = useState(false);

  const meetingClientIdRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const micEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(false);
  const meetingEndedRef = useRef(false);
  const participantsRef = useRef([]);

  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const userName = localStorage.getItem('userName') || 'User';

  const roomId = `appointment-${appointmentId}`;
  const isAdmin = userRole === 'admin';
  const offerRetryTimersRef = useRef({});
  const endRedirectTimerRef = useRef(null);
  const remoteParticipant = participants[0] || null;
  const patientParticipant = participants.find((p) => p.role === 'patient') || null;

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    let mounted = true;

    const fetchAppointment = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!mounted) return;

        setAppointment(response.data);
        await startMeeting();
      } catch (err) {
        if (!mounted) return;
        setError(err.response?.data?.error || 'Failed to load appointment details');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAppointment();

    return () => {
      mounted = false;
      cleanupMeeting();
    };
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [appointmentId]);

  const getMeetingClientId = () => {
    if (!meetingClientIdRef.current) {
      meetingClientIdRef.current = createClientId();
    }
    return meetingClientIdRef.current;
  };

  const meetingUrl = (path) => `${API_BASE_URL}/api/meetings/${encodeURIComponent(roomId)}${path}`;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`
  });

  const normalizeParticipant = (participant) => ({
    ...participant,
    socketId: participant.socketId || participant.clientId
  });

  const sendSignal = async (targetClientId, type, payload) => {
    const clientId = getMeetingClientId();
    if (!targetClientId || meetingEndedRef.current) return;

    try {
      await axios.post(
        meetingUrl('/signals'),
        {
          clientId,
          targetClientId,
          type,
          payload
        },
        { headers: authHeaders() }
      );
    } catch (signalError) {
      console.error('Meeting signal error:', signalError);
    }
  };

  const reconcileParticipants = (nextParticipants) => {
    const normalized = (nextParticipants || []).map(normalizeParticipant);
    const activeIds = new Set(normalized.map((participant) => participant.socketId));

    Object.keys(peerConnectionsRef.current).forEach((socketId) => {
      if (!activeIds.has(socketId)) {
        closePeerConnection(socketId);
      }
    });

    setParticipants(normalized);

    normalized.forEach((participant) => {
      if (!peerConnectionsRef.current[participant.socketId]) {
        createPeerConnection(participant.socketId, false);
      }
    });
  };

  const upsertParticipant = (participant) => {
    if (!participant) return;
    const normalized = normalizeParticipant(participant);
    if (normalized.socketId === getMeetingClientId()) return;
    setParticipants((prev) => {
      const others = prev.filter((p) => p.socketId !== normalized.socketId);
      return [...others, normalized];
    });

    if (!peerConnectionsRef.current[normalized.socketId]) {
      createPeerConnection(normalized.socketId, false);
    }
  };

  const handleMeetingEnded = (endedBy) => {
    if (meetingEndedRef.current) return;
    meetingEndedRef.current = true;
    setMeetingEnded(true);
    setError(`Meeting ended by ${endedBy || 'Admin'}.`);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    if (isAdmin) {
      endRedirectTimerRef.current = setTimeout(() => {
        navigate('/admin/doctor-notes');
      }, 400);
    } else {
      endRedirectTimerRef.current = setTimeout(() => {
        navigate('/dashboard');
      }, 1200);
    }
  };

  const handleSignals = async (signals) => {
    for (const signal of signals || []) {
      const payload = signal.payload || {};
      const fromClientId = signal.fromClientId;

      if (signal.type === 'participant-joined') {
        upsertParticipant(payload.participant);
      }

      if (signal.type === 'participant-updated') {
        upsertParticipant(payload.participant);
      }

      if (signal.type === 'participant-left' && fromClientId) {
        setParticipants((prev) => prev.filter((p) => p.socketId !== fromClientId));
        closePeerConnection(fromClientId);
      }

      if (signal.type === 'webrtc-offer' && fromClientId && payload.offer) {
        const pc = createPeerConnection(fromClientId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(fromClientId, 'webrtc-answer', { answer });
      }

      if (signal.type === 'webrtc-answer' && fromClientId && payload.answer) {
        const pc = peerConnectionsRef.current[fromClientId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      }

      if (signal.type === 'webrtc-ice-candidate' && fromClientId && payload.candidate) {
        const pc = peerConnectionsRef.current[fromClientId];
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (iceError) {
            console.error('ICE candidate error:', iceError);
          }
        }
      }

      if (signal.type === 'force-muted-by-admin') {
        setMutedByAdmin(true);
        toggleMic(false, true);
      }

      if (signal.type === 'force-camera-by-admin') {
        setCameraControlledByAdmin(true);
        await toggleCamera(Boolean(payload.enabled), true);
      }

      if (signal.type === 'meeting-ended') {
        handleMeetingEnded(payload.endedBy);
      }
    }
  };

  const pollMeeting = async () => {
    if (meetingEndedRef.current) return;

    try {
      const response = await axios.get(meetingUrl('/poll'), {
        params: { clientId: getMeetingClientId() },
        headers: authHeaders()
      });
      reconcileParticipants(response.data.participants || []);
      await handleSignals(response.data.signals || []);
    } catch (pollError) {
      if (!meetingEndedRef.current) {
        setError(pollError.response?.data?.error || 'Meeting connection is retrying...');
      }
    }
  };

  const sendParticipantState = async (nextMicEnabled, nextCameraEnabled) => {
    if (meetingEndedRef.current) return;

    try {
      const response = await axios.post(
        meetingUrl('/heartbeat'),
        {
          clientId: getMeetingClientId(),
          userName,
          micEnabled: nextMicEnabled,
          cameraEnabled: nextCameraEnabled
        },
        { headers: authHeaders() }
      );
      reconcileParticipants(response.data.participants || []);
    } catch (heartbeatError) {
      if (!meetingEndedRef.current) {
        setError(heartbeatError.response?.data?.error || 'Meeting connection is retrying...');
      }
    }
  };

  const startMeetingPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    pollMeeting();
    pollIntervalRef.current = setInterval(pollMeeting, 1500);
    heartbeatIntervalRef.current = setInterval(() => {
      sendParticipantState(micEnabledRef.current, cameraEnabledRef.current);
    }, 5000);
  };

  const startMeeting = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      localStreamRef.current = stream;
      await attachLocalStream(stream);
      setCameraEnabled(false);
      setMicEnabled(stream.getAudioTracks().some((track) => track.enabled));

      const response = await axios.post(
        meetingUrl('/join'),
        {
          clientId: getMeetingClientId(),
          userName,
          micEnabled: true,
          cameraEnabled: false
        },
        { headers: authHeaders() }
      );

      const existingParticipants = (response.data.participants || []).map(normalizeParticipant);
      setParticipants(existingParticipants);
      existingParticipants.forEach((participant) => {
        createPeerConnection(participant.socketId, true);
      });

      startMeetingPolling();
    } catch (mediaError) {
      setError(
        mediaError.response?.data?.error ||
        'Could not access camera/microphone. Please allow permissions and reload.'
      );
    }
  };

  const createPeerConnection = (targetSocketId, shouldCreateOffer) => {
    if (peerConnectionsRef.current[targetSocketId]) {
      return peerConnectionsRef.current[targetSocketId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[targetSocketId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(targetSocketId, 'webrtc-ice-candidate', {
        candidate: event.candidate
      });
    };

    if (shouldCreateOffer) {
      sendOffer(targetSocketId, pc);
    } else {
      const shouldSendFallbackOffer = getMeetingClientId() > targetSocketId;
      if (shouldSendFallbackOffer) {
        offerRetryTimersRef.current[targetSocketId] = setTimeout(() => {
          const currentPc = peerConnectionsRef.current[targetSocketId];
          if (!currentPc) return;
          if (currentPc.currentRemoteDescription) return;
          sendOffer(targetSocketId, currentPc);
        }, 1200);
      }
    }

    return pc;
  };

  const sendOffer = (targetSocketId, pc) => {
    if (!pc || meetingEndedRef.current) return;

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        sendSignal(targetSocketId, 'webrtc-offer', { offer });
      })
      .catch((offerErr) => {
        console.error('Offer error:', offerErr);
      });
  };

  const closePeerConnection = (socketId) => {
    if (offerRetryTimersRef.current[socketId]) {
      clearTimeout(offerRetryTimersRef.current[socketId]);
      delete offerRetryTimersRef.current[socketId];
    }
    const pc = peerConnectionsRef.current[socketId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[socketId];
    }
  };

  const cleanupMeeting = () => {
    if (endRedirectTimerRef.current) {
      clearTimeout(endRedirectTimerRef.current);
      endRedirectTimerRef.current = null;
    }

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    const clientId = meetingClientIdRef.current;
    if (clientId && !meetingEndedRef.current) {
      axios.post(
        meetingUrl('/leave'),
        { clientId },
        { headers: authHeaders() }
      ).catch(() => {});
    }

    Object.keys(offerRetryTimersRef.current).forEach((socketId) => {
      clearTimeout(offerRetryTimersRef.current[socketId]);
      delete offerRetryTimersRef.current[socketId];
    });

    Object.keys(peerConnectionsRef.current).forEach((socketId) => {
      closePeerConnection(socketId);
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const emitParticipantState = (nextMicEnabled, nextCameraEnabled) => {
    sendParticipantState(nextMicEnabled, nextCameraEnabled);
  };

  const attachLocalStream = async (stream) => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = stream;
    try {
      await localVideoRef.current.play();
    } catch (playErr) {
      // Browsers can block autoplay until user gesture; keep stream attached.
    }
  };

  const replaceVideoTrackForPeers = (track) => {
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(track).catch(() => {});
      } else if (localStreamRef.current && track) {
        pc.addTrack(track, localStreamRef.current);
      }
    });
  };

  const toggleMic = (forcedState = null, forcedByAdmin = false) => {
    if (!localStreamRef.current) return;

    const nextState = typeof forcedState === 'boolean' ? forcedState : !micEnabledRef.current;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = nextState;
    });

    setMicEnabled(nextState);
    micEnabledRef.current = nextState;
    if (!forcedByAdmin) {
      setMutedByAdmin(false);
    }

    emitParticipantState(nextState, cameraEnabledRef.current);
  };

  const toggleCamera = async (forcedState = null, forcedByAdmin = false) => {
    const nextState = typeof forcedState === 'boolean' ? forcedState : !cameraEnabledRef.current;

    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }

    const existingVideoTrack = localStreamRef.current.getVideoTracks()[0];

    if (nextState) {
      if (existingVideoTrack && existingVideoTrack.readyState === 'live') {
        existingVideoTrack.enabled = true;
      } else {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
          });
          const freshTrack = videoStream.getVideoTracks()[0];
          if (freshTrack) {
            if (existingVideoTrack) {
              localStreamRef.current.removeTrack(existingVideoTrack);
              existingVideoTrack.stop();
            }
            localStreamRef.current.addTrack(freshTrack);
            replaceVideoTrackForPeers(freshTrack);
          }
        } catch (cameraError) {
          setError('Unable to access camera. Please allow camera permission and try again.');
          return;
        }
      }
      setError('');
    } else if (existingVideoTrack) {
      existingVideoTrack.enabled = false;
    }

    setCameraEnabled(nextState);
    cameraEnabledRef.current = nextState;
    if (!forcedByAdmin) {
      setCameraControlledByAdmin(false);
    }
    await attachLocalStream(localStreamRef.current);
    emitParticipantState(micEnabledRef.current, nextState);
  };

  const endMeetingAsAdmin = async () => {
    if (!isAdmin) return;

    try {
      const response = await axios.post(
        meetingUrl('/admin/end'),
        { clientId: getMeetingClientId() },
        { headers: authHeaders() }
      );
      handleMeetingEnded(response.data?.endedBy || 'Admin');
    } catch (endError) {
      setError(endError.response?.data?.error || 'Failed to end meeting');
    }
  };

  const mutePatient = async () => {
    if (!isAdmin) return;
    const patient = participantsRef.current.find((p) => p.role === 'patient');
    if (!patient) return;

    try {
      await axios.post(
        meetingUrl('/admin/mute'),
        {
          clientId: getMeetingClientId(),
          targetClientId: patient.socketId
        },
        { headers: authHeaders() }
      );
    } catch (muteError) {
      setError(muteError.response?.data?.error || 'Failed to mute patient');
    }
  };

  const togglePatientCamera = async () => {
    if (!isAdmin) return;
    const patient = patientParticipant;
    if (!patient) return;

    try {
      await axios.post(
        meetingUrl('/admin/camera'),
        {
          clientId: getMeetingClientId(),
          targetClientId: patient.socketId,
          enabled: !Boolean(patient.cameraEnabled)
        },
        { headers: authHeaders() }
      );
    } catch (cameraError) {
      setError(cameraError.response?.data?.error || 'Failed to update patient camera');
    }
  };

  if (loading) {
    return <div className="loading">Loading consultation room...</div>;
  }

  if (error && !appointment) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="consult-room-page">
      <div className="consult-room-header">
        <Link to={isAdmin ? '/admin/appointments' : '/dashboard'} className="back-button">
          <FiArrowLeft /> Back
        </Link>
        <div className="room-meta">
          <h2>Consultation Room</h2>
          {appointment && (
            <p>
              {appointment.doctorName} | {new Date(appointment.appointmentDate).toLocaleDateString()} {appointment.appointmentTime}
            </p>
          )}
        </div>
      </div>

      {meetingEnded && (
        <div className="room-alert room-alert-danger">Meeting has ended.</div>
      )}
      {mutedByAdmin && (
        <div className="room-alert">You were muted by admin.</div>
      )}
      {cameraControlledByAdmin && (
        <div className="room-alert">Your camera was changed by admin.</div>
      )}
      {error && appointment && !meetingEnded && (
        <div className="room-alert room-alert-danger">{error}</div>
      )}

      <div className="video-grid">
        <div className="video-card local">
          <div className="video-label">You ({isAdmin ? 'Admin' : 'Patient'})</div>
          <div className="video-status">
            {!micEnabled && (
              <span className="video-status-pill">
                <FiMicOff /> Muted
              </span>
            )}
            {!cameraEnabled && (
              <span className="video-status-pill">
                <FiVideoOff /> Camera Off
              </span>
            )}
          </div>
          <video ref={localVideoRef} autoPlay muted playsInline className="video-element" />
        </div>

        <div className="video-card remote">
          <div className="video-label">Remote Participant</div>
          <div className="video-status">
            {remoteParticipant && remoteParticipant.micEnabled === false && (
              <span className="video-status-pill">
                <FiMicOff /> Muted
              </span>
            )}
            {remoteParticipant && remoteParticipant.cameraEnabled === false && (
              <span className="video-status-pill">
                <FiVideoOff /> Camera Off
              </span>
            )}
          </div>
          <video ref={remoteVideoRef} autoPlay playsInline className="video-element" />
          {participants.length === 0 && <div className="waiting-overlay">Waiting for other participant...</div>}
        </div>
      </div>

      <div className="meeting-controls">
        <button type="button" className={`control-btn ${micEnabled ? '' : 'off'}`} onClick={() => toggleMic()}>
          {micEnabled ? <FiMic /> : <FiMicOff />} {micEnabled ? 'Mute' : 'Unmute'}
        </button>

        <button type="button" className={`control-btn ${cameraEnabled ? '' : 'off'}`} onClick={toggleCamera}>
          {cameraEnabled ? <FiVideo /> : <FiVideoOff />} {cameraEnabled ? 'Camera Off' : 'Camera On'}
        </button>

        {isAdmin && (
          <button type="button" className="control-btn warn" onClick={mutePatient}>
            <FiVolumeX /> Mute Patient
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            className="control-btn warn"
            onClick={togglePatientCamera}
            disabled={!patientParticipant}
          >
            {patientParticipant?.cameraEnabled === false ? <FiVideo /> : <FiVideoOff />}
            {patientParticipant?.cameraEnabled === false ? ' Camera On Patient' : ' Camera Off Patient'}
          </button>
        )}

        {isAdmin && (
          <button type="button" className="control-btn danger" onClick={endMeetingAsAdmin}>
            <FiPhoneOff /> End Meeting
          </button>
        )}
      </div>
    </div>
  );
}

export default Consultation;
