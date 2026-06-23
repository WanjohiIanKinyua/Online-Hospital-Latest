import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiArrowLeft, FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiVolumeX } from 'react-icons/fi';
import '../styles/Consultation.css';
import { API_BASE_URL } from '../config/api';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const iceServerHasTurn = (server) => {
  const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
  return urls.some((url) => typeof url === 'string' && url.toLowerCase().startsWith('turn'));
};

const parseIceServers = () => {
  try {
    const configured = process.env.REACT_APP_ICE_SERVERS;
    if (configured) {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasTurn = parsed.some(iceServerHasTurn);
        return hasTurn ? parsed : [...parsed, ...FALLBACK_ICE_SERVERS.filter(iceServerHasTurn)];
      }
    }
  } catch (error) {
    // Fall back to public relay servers below.
  }

  return FALLBACK_ICE_SERVERS;
};

const RTC_CONFIG = {
  iceServers: parseIceServers(),
  iceCandidatePoolSize: 4
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
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [mutedByAdmin, setMutedByAdmin] = useState(false);
  const [cameraControlledByAdmin, setCameraControlledByAdmin] = useState(false);
  const [mediaWarning, setMediaWarning] = useState('');
  const [remotePlaybackBlocked, setRemotePlaybackBlocked] = useState(false);
  const [remoteHasAudio, setRemoteHasAudio] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');

  const meetingClientIdRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const micEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(true);
  const meetingEndedRef = useRef(false);
  const participantsRef = useRef([]);
  const pendingIceCandidatesRef = useRef({});
  const remotePlaybackTriedRef = useRef(false);
  const remoteAttachTaskRef = useRef(null);
  const connectionRetryTimersRef = useRef({});
  const negotiationRetryCountsRef = useRef({});

  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const userName = localStorage.getItem('userName') || 'User';

  const roomId = `appointment-${appointmentId}`;
  const isAdmin = userRole === 'admin';
  const endRedirectTimerRef = useRef(null);
  const remoteParticipant = participants[0] || null;
  const patientParticipant = participants.find((p) => p.role === 'patient') || null;

  // Keep refs in sync with state
  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Re-attach streams after loading completes (refs are now available)
  useEffect(() => {
    if (loading) return;
    if (localStreamRef.current) {
      attachLocalStream(localStreamRef.current).catch(() => {});
    }
    if (remoteStreamRef.current && remoteStreamRef.current.getTracks().length > 0) {
      attachRemoteStream(remoteStreamRef.current).catch(() => {});
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [loading]);

  // Main mount effect
  useEffect(() => {
    let mounted = true;

    const fetchAppointment = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!mounted) return;

        setAppointment(response.data);
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

  // ---- Utility ----

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

  const shouldCreateOfferTo = (targetClientId) => (
    Boolean(targetClientId) && getMeetingClientId() < targetClientId
  );

  const findSenderByKind = (pc, kind) => {
    const trackSender = pc.getSenders().find((sender) => sender.track?.kind === kind);
    if (trackSender) return trackSender;

    const transceiver = pc.getTransceivers?.().find((item) => (
      item.sender?.track?.kind === kind || item.receiver?.track?.kind === kind
    ));
    return transceiver?.sender || null;
  };

  const ensureTransceiver = (pc, kind) => {
    if (!pc.getTransceivers) return null;
    const existing = pc.getTransceivers().find((item) => (
      item.sender?.track?.kind === kind || item.receiver?.track?.kind === kind
    ));
    if (existing) {
      if (existing.direction === 'inactive' || existing.direction === 'recvonly') {
        existing.direction = 'sendrecv';
      }
      return existing;
    }
    return pc.addTransceiver(kind, { direction: 'sendrecv' });
  };

  const renegotiateWithPeers = () => {
    Object.entries(peerConnectionsRef.current).forEach(([socketId, pc]) => {
      if (pc?.signalingState === 'stable') {
        createAndSendOffer(socketId, pc, true);
      }
    });
  };

  const hasRemoteTracks = () => (
    Boolean(remoteStreamRef.current?.getTracks?.().some((track) => track.readyState === 'live'))
  );

  const clearConnectionRetry = (socketId) => {
    if (connectionRetryTimersRef.current[socketId]) {
      clearTimeout(connectionRetryTimersRef.current[socketId]);
      delete connectionRetryTimersRef.current[socketId];
    }
  };

  const queuePendingIceCandidate = (socketId, candidate) => {
    pendingIceCandidatesRef.current[socketId] = pendingIceCandidatesRef.current[socketId] || [];
    pendingIceCandidatesRef.current[socketId].push(candidate);
  };

  const scheduleConnectionRetry = (socketId, pc, delay = 5000) => {
    if (!shouldCreateOfferTo(socketId) || meetingEndedRef.current) return;
    clearConnectionRetry(socketId);

    connectionRetryTimersRef.current[socketId] = setTimeout(() => {
      delete connectionRetryTimersRef.current[socketId];
      const currentPc = peerConnectionsRef.current[socketId] || pc;
      if (!currentPc || currentPc.connectionState === 'connected' || hasRemoteTracks()) return;

      const attempts = (negotiationRetryCountsRef.current[socketId] || 0) + 1;
      negotiationRetryCountsRef.current[socketId] = attempts;
      setConnectionMessage('Connecting media. Retrying secure video/audio link...');

      if (currentPc.signalingState === 'stable') {
        try {
          currentPc.restartIce?.();
        } catch (restartError) {
          // Some browsers do not expose restartIce.
        }
        createAndSendOffer(socketId, currentPc, true);
      }

      if (attempts >= 3 && !hasRemoteTracks()) {
        setConnectionMessage('Video/audio still cannot connect. Check Vercel REACT_APP_ICE_SERVERS or use private TURN relay credentials, then redeploy.');
      } else {
        scheduleConnectionRetry(socketId, currentPc, 6000);
      }
    }, delay);
  };

  // ---- Media ----

  const getMediaStatus = (stream = localStreamRef.current) => {
    const audioTrack = stream?.getAudioTracks?.()[0];
    const videoTrack = stream?.getVideoTracks?.()[0];
    return {
      micEnabled: Boolean(audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled),
      cameraEnabled: Boolean(videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled)
    };
  };

  const updateMediaStateFromStream = (stream = localStreamRef.current) => {
    const status = getMediaStatus(stream);
    setMicEnabled(status.micEnabled);
    setCameraEnabled(status.cameraEnabled);
    micEnabledRef.current = status.micEnabled;
    cameraEnabledRef.current = status.cameraEnabled;
    return status;
  };

  const ensureLocalStream = () => {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }
    return localStreamRef.current;
  };

  const addOrReplaceLocalTrack = (track) => {
    const stream = ensureLocalStream();

    // Remove existing track of same kind from local stream
    const existingTrack = stream.getTracks().find((item) => item.kind === track.kind);
    if (existingTrack) {
      stream.removeTrack(existingTrack);
      existingTrack.stop();
    }
    stream.addTrack(track);

    // Replace track on all existing peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      ensureTransceiver(pc, track.kind);
      const sender = findSenderByKind(pc, track.kind);
      if (sender) {
        sender.replaceTrack(track).catch((err) => {
          console.error(`replaceTrack ${track.kind} failed on existing PC:`, err);
        });
      } else {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.error(`addTrack ${track.kind} on existing PC:`, err);
        }
      }
    });
  };

  const addTracksFromStream = (stream) => {
    stream.getTracks().forEach((track) => {
      track.enabled = true;
      addOrReplaceLocalTrack(track);
    });
  };

  const acquireAudioTrack = async () => {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const track = audioStream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone track was found.');
    track.enabled = true;
    addOrReplaceLocalTrack(track);
    return track;
  };

  const acquireVideoTrack = async () => {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    const track = videoStream.getVideoTracks()[0];
    if (!track) throw new Error('No camera track was found.');
    track.enabled = true;
    addOrReplaceLocalTrack(track);
    return track;
  };

  const requestInitialMedia = async () => {
    const failures = [];
    ensureLocalStream();

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      addTracksFromStream(mediaStream);
      console.log('Camera and microphone acquired together.');
    } catch (combinedError) {
      console.error('Combined media acquisition error:', combinedError);

      try {
        const track = await acquireAudioTrack();
        console.log('Audio track acquired, enabled:', track.enabled);
      } catch (audioError) {
        console.error('Audio acquisition error:', audioError);
        failures.push('microphone');
      }

      try {
        const track = await acquireVideoTrack();
        console.log('Video track acquired, enabled:', track.enabled);
      } catch (videoError) {
        console.error('Video acquisition error:', videoError);
        failures.push('camera');
      }
    }

    await attachLocalStream(localStreamRef.current).catch(() => {});
    const status = updateMediaStateFromStream(localStreamRef.current);

    if (failures.length > 0) {
      setMediaWarning(`Please allow ${failures.join(' and ')} access, then use the controls below to enable it.`);
    } else {
      setMediaWarning('');
    }

    console.log('Initial media requested. Mic:', status.micEnabled, 'Camera:', status.cameraEnabled, 'Local tracks:', localStreamRef.current.getTracks().length);
    return status;
  };

  // ---- Signalling ----

  const sendSignal = async (targetClientId, type, payload) => {
    const clientId = getMeetingClientId();
    if (!targetClientId || meetingEndedRef.current) return;

    try {
      await axios.post(
        meetingUrl('/signals'),
        { clientId, targetClientId, type, payload },
        { headers: authHeaders() }
      );
    } catch (signalError) {
      console.error('Meeting signal error:', signalError);
    }
  };

  // ---- Participant management ----

  const reconcileParticipants = (nextParticipants) => {
    const normalized = (nextParticipants || []).map((p) => ({
      ...p,
      socketId: p.socketId || p.clientId
    }));
    const activeIds = new Set(normalized.map((participant) => participant.socketId));

    Object.keys(peerConnectionsRef.current).forEach((socketId) => {
      if (!activeIds.has(socketId)) {
        closePeerConnection(socketId);
      }
    });

    setParticipants(normalized);

    normalized.forEach((participant) => {
      if (participant.socketId === getMeetingClientId()) return;
      if (!peerConnectionsRef.current[participant.socketId]) {
        createPeerConnection(participant.socketId, shouldCreateOfferTo(participant.socketId));
      }
    });
  };

  const handleMeetingEnded = (endedBy) => {
    if (meetingEndedRef.current) return;
    meetingEndedRef.current = true;
    setMeetingEnded(true);
    setError(`Meeting ended by ${endedBy || 'Admin'}.`);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (remoteAttachTaskRef.current) {
      clearTimeout(remoteAttachTaskRef.current);
      remoteAttachTaskRef.current = null;
    }

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

      if (signal.type === 'participant-joined' && fromClientId) {
        if (fromClientId === getMeetingClientId()) continue;
        if (peerConnectionsRef.current[fromClientId]) continue;
        createPeerConnection(fromClientId, shouldCreateOfferTo(fromClientId));
      }

      if (signal.type === 'participant-updated' && payload.participant) {
        const p = { ...payload.participant, socketId: payload.participant.socketId || payload.participant.clientId };
        setParticipants((prev) => {
          const idx = prev.findIndex((x) => x.socketId === p.socketId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = p;
            return copy;
          }
          return prev;
        });
        if (p.socketId !== getMeetingClientId() && !peerConnectionsRef.current[p.socketId]) {
          createPeerConnection(p.socketId, shouldCreateOfferTo(p.socketId));
        }
      }

      if (signal.type === 'participant-left' && fromClientId) {
        setParticipants((prev) => prev.filter((p) => p.socketId !== fromClientId));
        closePeerConnection(fromClientId);
      }

      if (signal.type === 'webrtc-offer' && fromClientId && payload.offer) {
        console.log('Received offer from:', fromClientId);
        const pc = getOrCreatePC(fromClientId, false);
        const offerCollision = pc.signalingState !== 'stable';
        const shouldIgnoreOffer = offerCollision && shouldCreateOfferTo(fromClientId);

        if (shouldIgnoreOffer) {
          console.warn('Ignoring colliding offer from:', fromClientId);
          continue;
        }

        if (offerCollision) {
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rollbackError) {
            console.warn('Offer rollback skipped:', rollbackError);
          }
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          console.log('Remote description set for offer from:', fromClientId);
          await flushPendingIceCandidates(fromClientId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log('Sending answer to:', fromClientId);
          await sendSignal(fromClientId, 'webrtc-answer', {
            answer: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription
          });
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      }

      if (signal.type === 'webrtc-answer' && fromClientId && payload.answer) {
        console.log('Received answer from:', fromClientId);
        const pc = peerConnectionsRef.current[fromClientId];
        if (pc) {
          try {
            if (pc.signalingState !== 'have-local-offer') {
              console.warn('Ignoring answer while signaling state is:', pc.signalingState);
              continue;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            console.log('Remote description set for answer from:', fromClientId);
            await flushPendingIceCandidates(fromClientId);
          } catch (err) {
            console.error('Error setting answer:', err);
          }
        }
      }

      if (signal.type === 'webrtc-ice-candidate' && fromClientId && payload.candidate) {
        const pc = peerConnectionsRef.current[fromClientId];
        if (!pc) {
          queuePendingIceCandidate(fromClientId, payload.candidate);
          continue;
        }

        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            queuePendingIceCandidate(fromClientId, payload.candidate);
          }
        } catch (iceError) {
          console.error('ICE candidate error:', iceError);
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
        console.error('Poll error:', pollError.response?.data?.error || pollError.message);
      }
    }
  };

  const sendParticipantState = async (nextMicEnabled, nextCameraEnabled) => {
    if (meetingEndedRef.current) return;

    try {
      await axios.post(
        meetingUrl('/heartbeat'),
        {
          clientId: getMeetingClientId(),
          userName,
          micEnabled: nextMicEnabled,
          cameraEnabled: nextCameraEnabled
        },
        { headers: authHeaders() }
      );
    } catch (heartbeatError) {
      console.error('Heartbeat error:', heartbeatError.response?.data?.error || heartbeatError.message);
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
    if (startingMeeting || meetingStarted) return;

    try {
      setStartingMeeting(true);
      setError('');
      console.log('Starting meeting...');
      const mediaStatus = await requestInitialMedia();
      console.log('Media acquired. Mic:', mediaStatus.micEnabled, 'Camera:', mediaStatus.cameraEnabled);

      const response = await axios.post(
        meetingUrl('/join'),
        {
          clientId: getMeetingClientId(),
          userName,
          micEnabled: mediaStatus.micEnabled,
          cameraEnabled: mediaStatus.cameraEnabled
        },
        { headers: authHeaders() }
      );

      const existingParticipants = (response.data.participants || []).map((p) => ({
        ...p,
        socketId: p.socketId || p.clientId
      }));
      console.log('Existing participants:', existingParticipants.length);
      setParticipants(existingParticipants);

      // Create peer connections to all existing participants
      existingParticipants.forEach((participant) => {
        if (participant.socketId === getMeetingClientId()) return;
        createPeerConnection(participant.socketId, shouldCreateOfferTo(participant.socketId));
      });

      startMeetingPolling();
      setMeetingStarted(true);
    } catch (mediaError) {
      console.error('Meeting start error:', mediaError);
      setError(
        mediaError.response?.data?.error ||
        'Could not enter the consultation room. Please reload and try again.'
      );
    } finally {
      setStartingMeeting(false);
    }
  };

  // ---- Peer Connection Management ----

  const getOrCreatePC = (socketId, shouldCreateOffer = shouldCreateOfferTo(socketId)) => {
    if (peerConnectionsRef.current[socketId]) return peerConnectionsRef.current[socketId];
    return createPeerConnection(socketId, shouldCreateOffer);
  };

  const createPeerConnection = (targetSocketId, shouldCreateOffer = shouldCreateOfferTo(targetSocketId)) => {
    if (peerConnectionsRef.current[targetSocketId]) {
      return peerConnectionsRef.current[targetSocketId];
    }

    if (targetSocketId === getMeetingClientId()) {
      throw new Error('Cannot create PC to self');
    }

    console.log('Creating peer connection to:', targetSocketId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[targetSocketId] = pc;

    ensureTransceiver(pc, 'audio');
    ensureTransceiver(pc, 'video');

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          const sender = findSenderByKind(pc, track.kind);
          if (sender) {
            sender.replaceTrack(track).catch((err) => {
              console.error(`replaceTrack ${track.kind} for ${targetSocketId}:`, err);
            });
          } else {
            pc.addTrack(track, localStreamRef.current);
          }
        } catch (err) {
          console.error(`addTrack ${track.kind} for ${targetSocketId}:`, err);
        }
      });
    }

    pc.ontrack = (event) => {
      console.log('ontrack fired from:', targetSocketId, 'kind:', event.track?.kind);
      if (!event.track) return;
      setConnectionMessage('');
      clearConnectionRetry(targetSocketId);

      // Get or create the remote stream
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      // Check if this exact track is already in the stream
      const exists = remoteStreamRef.current.getTracks().find(
        (t) => t.kind === event.track.kind && t.id === event.track.id
      );

      if (!exists) {
        remoteStreamRef.current.addTrack(event.track);
        console.log(`Added ${event.track.kind} track to remote stream. Tracks:`, remoteStreamRef.current.getTracks().length);
      }

      if (event.track.kind === 'audio') {
        setRemoteHasAudio(true);
      }
      if (event.track.kind === 'video') {
        setRemoteHasVideo(true);
      }

      // Always attempt to attach the combined stream
      if (remoteVideoRef.current) {
        attachRemoteStream(remoteStreamRef.current).catch(() => {});
      } else {
        // Retry after a short delay if ref isn't ready
        if (remoteAttachTaskRef.current) clearTimeout(remoteAttachTaskRef.current);
        remoteAttachTaskRef.current = setTimeout(() => {
          remoteAttachTaskRef.current = null;
          if (remoteStreamRef.current) {
            attachRemoteStream(remoteStreamRef.current).catch(() => {});
          }
        }, 300);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(targetSocketId, 'webrtc-ice-candidate', {
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
      }).catch(() => {});
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state for ${targetSocketId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionMessage('');
        clearConnectionRetry(targetSocketId);
      }
      if (pc.iceConnectionState === 'checking') {
        setConnectionMessage('Connecting media...');
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setConnectionMessage('Media connection dropped. Retrying...');
        if (pc.signalingState === 'stable') {
          try {
            pc.restartIce?.();
          } catch (restartError) {
            // Some browsers do not expose restartIce.
          }
          createAndSendOffer(targetSocketId, pc, true);
        }
        scheduleConnectionRetry(targetSocketId, pc, 2000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${targetSocketId}:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        setConnectionMessage('Video/audio connection failed. Retrying...');
        if (pc.signalingState === 'stable') {
          createAndSendOffer(targetSocketId, pc, true);
        }
        scheduleConnectionRetry(targetSocketId, pc, 2000);
      }
      if (pc.connectionState === 'connected') {
        console.log(`Successfully connected to ${targetSocketId}`);
        setError('');
        setConnectionMessage('');
        clearConnectionRetry(targetSocketId);
      }
    };

    if (shouldCreateOffer) {
      createAndSendOffer(targetSocketId, pc);
      scheduleConnectionRetry(targetSocketId, pc);
    }

    return pc;
  };

  const createAndSendOffer = (targetSocketId, pc, iceRestart = false) => {
    if (!pc || meetingEndedRef.current) return;
    if (pc.signalingState !== 'stable') {
      console.log(`Cannot create offer for ${targetSocketId}, state: ${pc.signalingState}`);
      return;
    }

    console.log(`Creating offer for ${targetSocketId}, track count:`, localStreamRef.current?.getTracks().length || 0);
    pc.createOffer({ iceRestart })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        console.log(`Sending offer to ${targetSocketId}`);
        sendSignal(targetSocketId, 'webrtc-offer', {
          offer: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription
        }).catch(() => {});
      })
      .catch((offerErr) => {
        console.error('Offer error:', offerErr);
      });
  };

  const closePeerConnection = (socketId) => {
    clearConnectionRetry(socketId);
    delete negotiationRetryCountsRef.current[socketId];
    const pc = peerConnectionsRef.current[socketId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[socketId];
    }
    delete pendingIceCandidatesRef.current[socketId];
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

    if (remoteAttachTaskRef.current) {
      clearTimeout(remoteAttachTaskRef.current);
      remoteAttachTaskRef.current = null;
    }

    Object.keys(connectionRetryTimersRef.current).forEach((socketId) => {
      clearConnectionRetry(socketId);
    });

    const clientId = meetingClientIdRef.current;
    if (clientId && !meetingEndedRef.current) {
      axios.post(
        meetingUrl('/leave'),
        { clientId },
        { headers: authHeaders() }
      ).catch(() => {});
    }

    Object.keys(peerConnectionsRef.current).forEach((socketId) => {
      closePeerConnection(socketId);
    });

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const emitParticipantState = (nextMicEnabled, nextCameraEnabled) => {
    sendParticipantState(nextMicEnabled, nextCameraEnabled);
  };

  // ---- Video element attachment ----

  const attachLocalStream = async (stream) => {
    if (!localVideoRef.current) return;
    if (localVideoRef.current.srcObject === stream) return;
    console.log('Attaching local stream, track count:', stream?.getTracks?.().length || 0);
    localVideoRef.current.srcObject = stream;
    try {
      await localVideoRef.current.play();
    } catch (playErr) {
      console.warn('Local playback error:', playErr);
    }
  };

  const attachRemoteStream = async (stream) => {
    if (!remoteVideoRef.current) {
      console.warn('Remote video ref not available yet, will retry');
      if (remoteAttachTaskRef.current) clearTimeout(remoteAttachTaskRef.current);
      remoteAttachTaskRef.current = setTimeout(() => {
        remoteAttachTaskRef.current = null;
        if (remoteStreamRef.current) {
          attachRemoteStream(remoteStreamRef.current).catch(() => {});
        }
      }, 300);
      return;
    }

    const videoTracks = stream?.getVideoTracks?.() || [];
    const audioTracks = stream?.getAudioTracks?.() || [];
    console.log(`Attaching remote stream - video: ${videoTracks.length}, audio: ${audioTracks.length}`);

    // Only set srcObject if different from current to avoid restarting playback
    if (remoteVideoRef.current.srcObject !== stream) {
      remoteVideoRef.current.srcObject = stream;
      console.log('Set remote video srcObject');
    }

    remoteVideoRef.current.muted = true;
    remoteVideoRef.current.autoplay = true;
    remoteVideoRef.current.playsInline = true;

    try {
      await remoteVideoRef.current.play();
      console.log('Remote video playing successfully');
      setRemotePlaybackBlocked(false);
    } catch (playErr) {
      console.warn('Remote playback error:', playErr.message);
      // On "NotAllowedError" the browser requires user interaction
      if (playErr.name === 'NotAllowedError') {
        setRemotePlaybackBlocked(true);
      }
    }

    if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== stream) {
      remoteAudioRef.current.srcObject = stream;
    }

    if (audioTracks.length > 0) {
      setRemoteHasAudio(true);
      if (remoteAudioRef.current && remotePlaybackTriedRef.current === false) {
        remotePlaybackTriedRef.current = true;
        try {
          remoteAudioRef.current.muted = false;
          await remoteAudioRef.current.play();
          setRemotePlaybackBlocked(false);
        } catch (audioPlayErr) {
          if (audioPlayErr.name === 'NotAllowedError') {
            setRemotePlaybackBlocked(true);
          }
        }
      }
    }
  };

  const enableRemotePlayback = async () => {
    if (!remoteStreamRef.current) return;
    try {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = true;
        await remoteVideoRef.current.play();
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
        await remoteAudioRef.current.play();
      }
      setRemotePlaybackBlocked(false);
      setError('');
    } catch (playErr) {
      setError('Browser blocked remote audio/video playback. Click the video area again or check browser site permissions.');
    }
  };

  const flushPendingIceCandidates = async (socketId) => {
    const pc = peerConnectionsRef.current[socketId];
    const candidates = pendingIceCandidatesRef.current[socketId] || [];
    if (!pc || !pc.remoteDescription || candidates.length === 0) return;

    pendingIceCandidatesRef.current[socketId] = [];
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (iceError) {
        console.error('Queued ICE candidate error:', iceError);
      }
    }
  };

  const replaceVideoTrackForPeers = (track) => {
    Object.entries(peerConnectionsRef.current).forEach(([socketId, pc]) => {
      if (!pc) return;
      ensureTransceiver(pc, 'video');
      const sender = findSenderByKind(pc, 'video');
      if (sender) {
        sender.replaceTrack(track).catch((err) => {
          console.error('Failed to replace video track:', err);
        });
      } else if (localStreamRef.current && track) {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch (err) {
          console.error('Failed to add video track:', err);
        }
      }
      if (pc.signalingState === 'stable') {
        createAndSendOffer(socketId, pc);
      }
    });
  };

  // ---- Controls ----

  const toggleMic = (forcedState = null, forcedByAdmin = false) => {
    if (!localStreamRef.current) {
      ensureLocalStream();
    }

    const nextState = typeof forcedState === 'boolean' ? forcedState : !micEnabledRef.current;
    const audioTracks = localStreamRef.current.getAudioTracks();

    if (nextState && audioTracks.length === 0) {
      acquireAudioTrack()
        .then(async () => {
          await attachLocalStream(localStreamRef.current).catch(() => {});
          const status = updateMediaStateFromStream(localStreamRef.current);
          setMediaWarning('');
          setMutedByAdmin(false);
          emitParticipantState(status.micEnabled, status.cameraEnabled);
          renegotiateWithPeers();
        })
        .catch(() => {
          setMediaWarning('Microphone access is blocked. Allow microphone permission in your browser, then try again.');
          setMicEnabled(false);
          micEnabledRef.current = false;
          emitParticipantState(false, cameraEnabledRef.current);
        });
      return;
    }

    audioTracks.forEach((track) => {
      try { track.enabled = nextState; } catch (e) { /* ignore */ }
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

    ensureLocalStream();

    const existingVideoTrack = localStreamRef.current.getVideoTracks()[0];

    if (nextState) {
      if (existingVideoTrack && existingVideoTrack.readyState === 'live') {
        existingVideoTrack.enabled = true;
        setCameraEnabled(true);
        cameraEnabledRef.current = true;
      } else {
        try {
          const freshTrack = await acquireVideoTrack();
          await attachLocalStream(localStreamRef.current).catch(() => {});
          replaceVideoTrackForPeers(freshTrack);
          setCameraEnabled(true);
          cameraEnabledRef.current = true;
        } catch (cameraError) {
          setMediaWarning('Camera access is blocked. Allow camera permission in your browser, then try again.');
          setCameraEnabled(false);
          cameraEnabledRef.current = false;
          return;
        }
      }
      setError('');
    } else if (existingVideoTrack) {
      try { existingVideoTrack.enabled = false; } catch (e) { /* ignore */ }
      setCameraEnabled(false);
      cameraEnabledRef.current = false;
    }

    if (!forcedByAdmin) {
      setCameraControlledByAdmin(false);
    }
    await attachLocalStream(localStreamRef.current).catch(() => {});
    emitParticipantState(micEnabledRef.current, cameraEnabledRef.current);
  };

  const retryMediaPermissions = async () => {
    const status = await requestInitialMedia();
    emitParticipantState(status.micEnabled, status.cameraEnabled);
    renegotiateWithPeers();
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

  // ---- Render ----

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
      {!meetingStarted && (
        <div className="room-alert">
          <button type="button" className="inline-alert-action" onClick={startMeeting} disabled={startingMeeting}>
            {startingMeeting ? 'Joining...' : 'Join with camera and mic'}
          </button>
        </div>
      )}
      {mediaWarning && (
        <div className="room-alert room-alert-danger">
          {mediaWarning}
          <button type="button" className="inline-alert-action" onClick={retryMediaPermissions}>
            Enable camera/mic
          </button>
        </div>
      )}
      {error && appointment && !meetingEnded && (
        <div className="room-alert room-alert-danger">{error}</div>
      )}
      {connectionMessage && meetingStarted && (
        <div className="room-alert room-alert-danger">{connectionMessage}</div>
      )}

      <>
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
            {remoteParticipant && remoteParticipant.cameraEnabled !== false && !remoteHasVideo && (
              <span className="video-status-pill">
                <FiVideoOff /> Video connecting
              </span>
            )}
            {!remoteHasAudio && remoteParticipant && remoteParticipant.micEnabled !== false && (
              <span className="video-status-pill">
                <FiVolumeX /> Audio connecting
              </span>
            )}
          </div>
          <video ref={remoteVideoRef} autoPlay muted playsInline className="video-element" />
          <audio ref={remoteAudioRef} autoPlay />
          {remotePlaybackBlocked && (
            <button type="button" className="waiting-overlay playback-overlay" onClick={enableRemotePlayback}>
              Click to enable sound and video
            </button>
          )}
          {meetingStarted && participants.length === 0 && <div className="waiting-overlay">Waiting for other participant...</div>}
          {meetingStarted && participants.length > 0 && !remoteHasVideo && (
            <div className="waiting-overlay">Connecting remote video...</div>
          )}
        </div>
      </div>

      <div className="meeting-controls">
        <button type="button" className={`control-btn ${micEnabled ? '' : 'off'}`} onClick={() => toggleMic()} disabled={!meetingStarted}>
          {micEnabled ? <FiMic /> : <FiMicOff />} {micEnabled ? 'Mute' : 'Unmute'}
        </button>

        <button type="button" className={`control-btn ${cameraEnabled ? '' : 'off'}`} onClick={toggleCamera} disabled={!meetingStarted}>
          {cameraEnabled ? <FiVideo /> : <FiVideoOff />} {cameraEnabled ? 'Camera Off' : 'Camera On'}
        </button>

        {isAdmin && (
          <button type="button" className="control-btn warn" onClick={mutePatient} disabled={!meetingStarted || !patientParticipant}>
            <FiVolumeX /> Mute Patient
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            className="control-btn warn"
            onClick={togglePatientCamera}
            disabled={!meetingStarted || !patientParticipant}
          >
            {patientParticipant?.cameraEnabled === false ? <FiVideo /> : <FiVideoOff />}
            {patientParticipant?.cameraEnabled === false ? ' Camera On Patient' : ' Camera Off Patient'}
          </button>
        )}

        {isAdmin && (
          <button type="button" className="control-btn danger" onClick={endMeetingAsAdmin} disabled={!meetingStarted}>
            <FiPhoneOff /> End Meeting
          </button>
        )}
      </div>
      </>
    </div>
  );
}

export default Consultation;
