import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiArrowLeft, FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiVolumeX } from 'react-icons/fi';
import '../styles/Consultation.css';
import { API_BASE_URL } from '../config/api';

const parseIceServers = () => {
  try {
    const configured = process.env.REACT_APP_ICE_SERVERS;
    if (configured) {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (error) {
    // Fall back to public STUN servers below.
  }

  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
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
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [mutedByAdmin, setMutedByAdmin] = useState(false);
  const [cameraControlledByAdmin, setCameraControlledByAdmin] = useState(false);
  const [mediaWarning, setMediaWarning] = useState('');
  const [remotePlaybackBlocked, setRemotePlaybackBlocked] = useState(false);

  const meetingClientIdRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const micEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(true);
  const meetingEndedRef = useRef(false);
  const participantsRef = useRef([]);
  const pendingIceCandidatesRef = useRef({});
  const negotiationTimersRef = useRef({});

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
    if (loading) return;
    if (localStreamRef.current) {
      attachLocalStream(localStreamRef.current);
    }
    if (remoteStreamRef.current) {
      attachRemoteStream(remoteStreamRef.current);
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [loading]);

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
    const existingTrack = stream.getTracks().find((item) => item.kind === track.kind);
    if (existingTrack) {
      stream.removeTrack(existingTrack);
      existingTrack.stop();
    }
    stream.addTrack(track);

    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((item) => item.track && item.track.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track).catch(() => {});
      } else {
        pc.addTrack(track, stream);
      }
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
      video: { facingMode: 'user' },
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
      await acquireAudioTrack();
    } catch (audioError) {
      failures.push('microphone');
    }

    try {
      await acquireVideoTrack();
    } catch (videoError) {
      failures.push('camera');
    }

    await attachLocalStream(localStreamRef.current);
    const status = updateMediaStateFromStream(localStreamRef.current);

    if (failures.length > 0) {
      setMediaWarning(`Please allow ${failures.join(' and ')} access, then use the controls below to enable it.`);
    } else {
      setMediaWarning('');
    }

    return status;
  };

  const renegotiateWithPeers = () => {
    Object.entries(peerConnectionsRef.current).forEach(([socketId, pc]) => {
      if (!pc || pc.signalingState !== 'stable') return;
      if (negotiationTimersRef.current[socketId]) {
        clearTimeout(negotiationTimersRef.current[socketId]);
      }
      negotiationTimersRef.current[socketId] = setTimeout(() => {
        delete negotiationTimersRef.current[socketId];
        const currentPc = peerConnectionsRef.current[socketId];
        if (currentPc && currentPc.signalingState === 'stable') {
          sendOffer(socketId, currentPc);
        }
      }, 250);
    });
  };

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
      } else {
        ensureLocalTracksForPeer(peerConnectionsRef.current[participant.socketId]);
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
    } else {
      ensureLocalTracksForPeer(peerConnectionsRef.current[normalized.socketId]);
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
        console.log('Received offer from:', fromClientId);
        const pc = createPeerConnection(fromClientId, false);
        if (pc.signalingState !== 'stable') {
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rollbackError) {
            console.warn('Offer rollback skipped:', rollbackError);
          }
        }
        console.log('Setting remote description for offer');
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        await flushPendingIceCandidates(fromClientId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('Sending answer to:', fromClientId);
        await sendSignal(fromClientId, 'webrtc-answer', {
          answer: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription
        });
      }

      if (signal.type === 'webrtc-answer' && fromClientId && payload.answer) {
        console.log('Received answer from:', fromClientId);
        const pc = peerConnectionsRef.current[fromClientId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushPendingIceCandidates(fromClientId);
        }
      }

      if (signal.type === 'webrtc-ice-candidate' && fromClientId && payload.candidate) {
        const pc = peerConnectionsRef.current[fromClientId];
        if (pc) {
          try {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              pendingIceCandidatesRef.current[fromClientId] = pendingIceCandidatesRef.current[fromClientId] || [];
              pendingIceCandidatesRef.current[fromClientId].push(payload.candidate);
            }
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

      const existingParticipants = (response.data.participants || []).map(normalizeParticipant);
      console.log('Existing participants:', existingParticipants.length);
      setParticipants(existingParticipants);
      existingParticipants.forEach((participant) => {
        console.log('Creating peer connection to:', participant.socketId);
        createPeerConnection(participant.socketId, true);
      });

      startMeetingPolling();
    } catch (mediaError) {
      console.error('Meeting start error:', mediaError);
      setError(
        mediaError.response?.data?.error ||
        'Could not enter the consultation room. Please reload and try again.'
      );
    }
  };

  const ensureLocalTracksForPeer = (pc) => {
    if (!pc || !localStreamRef.current) return;
    const localTracks = localStreamRef.current.getTracks();
    
    localTracks.forEach((track) => {
      const sender = pc.getSenders().find(
        (s) => s.track && s.track.kind === track.kind
      );
      
      if (!sender) {
        // Add track immediately, regardless of state
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log('Added', track.kind, 'track to peer connection');
        } catch (err) {
          console.error(`Failed to add ${track.kind} track:`, err);
        }
      }
    });
  };

  const createPeerConnection = (targetSocketId, shouldCreateOffer) => {
    if (peerConnectionsRef.current[targetSocketId]) {
      return peerConnectionsRef.current[targetSocketId];
    }

    console.log('Creating peer connection to:', targetSocketId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[targetSocketId] = pc;

    // Add local tracks immediately
    ensureLocalTracksForPeer(pc);

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      console.log('ontrack fired, track kind:', event.track?.kind, 'stream count:', event.streams.length);
      if (remoteStream) {
        attachRemoteStream(remoteStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(targetSocketId, 'webrtc-ice-candidate', {
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.iceConnectionState)) {
        try {
          pc.restartIce();
        } catch (restartError) {
          // Older browsers may not support restartIce.
        }
        if (pc.signalingState === 'stable') {
          sendOffer(targetSocketId, pc);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && pc.signalingState === 'stable') {
        sendOffer(targetSocketId, pc);
      }
    };

    if (shouldCreateOffer) {
      console.log('Should create offer, initiating...');
      sendOffer(targetSocketId, pc);
    } else {
      const shouldSendFallbackOffer = getMeetingClientId() > targetSocketId;
      if (shouldSendFallbackOffer) {
        console.log('Will send fallback offer after timeout');
        offerRetryTimersRef.current[targetSocketId] = setTimeout(() => {
          const currentPc = peerConnectionsRef.current[targetSocketId];
          if (!currentPc) return;
          if (currentPc.currentRemoteDescription) return;
          console.log('Sending fallback offer');
          sendOffer(targetSocketId, currentPc);
        }, 1200);
      }
    }

    return pc;
  };

  const sendOffer = (targetSocketId, pc) => {
    if (!pc || meetingEndedRef.current) return;
    if (pc.signalingState !== 'stable') {
      console.log('Skipping offer, signaling state is:', pc.signalingState);
      return;
    }

    console.log('Creating offer for:', targetSocketId, 'local track count:', localStreamRef.current?.getTracks().length || 0);
    pc.createOffer({ iceRestart: false })
      .then((offer) => {
        console.log('Offer created, setting local description');
        return pc.setLocalDescription(offer);
      })
      .then(() => {
        console.log('Sending offer to:', targetSocketId);
        sendSignal(targetSocketId, 'webrtc-offer', {
          offer: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription
        });
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
    if (negotiationTimersRef.current[socketId]) {
      clearTimeout(negotiationTimersRef.current[socketId]);
      delete negotiationTimersRef.current[socketId];
    }
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

    Object.keys(negotiationTimersRef.current).forEach((socketId) => {
      clearTimeout(negotiationTimersRef.current[socketId]);
      delete negotiationTimersRef.current[socketId];
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
    console.log('Attaching local stream, track count:', stream?.getTracks?.().length || 0);
    localVideoRef.current.srcObject = stream;
    try {
      await localVideoRef.current.play();
    } catch (playErr) {
      console.warn('Local playback error:', playErr);
    }
  };

  const attachRemoteStream = async (stream) => {
    remoteStreamRef.current = stream;
    if (!remoteVideoRef.current) return;
    console.log('Attaching remote stream, track count:', stream?.getTracks?.().length || 0, 'video tracks:', stream?.getVideoTracks?.().length || 0);
    if (remoteVideoRef.current.srcObject !== stream) {
      remoteVideoRef.current.srcObject = stream;
    }
    try {
      await remoteVideoRef.current.play();
      setRemotePlaybackBlocked(false);
    } catch (playErr) {
      console.warn('Remote playback error:', playErr);
      setRemotePlaybackBlocked(true);
    }
  };

  const enableRemotePlayback = async () => {
    if (!remoteVideoRef.current) return;
    try {
      remoteVideoRef.current.muted = false;
      await remoteVideoRef.current.play();
      setRemotePlaybackBlocked(false);
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
      
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(track).catch((err) => {
          console.error('Failed to replace video track:', err);
        });
      } else if (localStreamRef.current && track) {
        // No sender exists, try to add the track
        pc.addTrack(track, localStreamRef.current).catch((err) => {
          console.error('Failed to add video track:', err);
        });
      }
      
      // Renegotiate if connection is stable
      if (pc.signalingState === 'stable') {
        sendOffer(socketId, pc);
      }
    });
  };

  const toggleMic = (forcedState = null, forcedByAdmin = false) => {
    if (!localStreamRef.current) {
      ensureLocalStream();
    }

    const nextState = typeof forcedState === 'boolean' ? forcedState : !micEnabledRef.current;
    const audioTracks = localStreamRef.current.getAudioTracks();

    if (nextState && audioTracks.length === 0) {
      acquireAudioTrack()
        .then(async () => {
          await attachLocalStream(localStreamRef.current);
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
          await attachLocalStream(localStreamRef.current);
          replaceVideoTrackForPeers(freshTrack);
          renegotiateWithPeers();
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
      existingVideoTrack.enabled = false;
      setCameraEnabled(false);
      cameraEnabledRef.current = false;
    }

    if (!forcedByAdmin) {
      setCameraControlledByAdmin(false);
    }
    await attachLocalStream(localStreamRef.current);
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
          <video ref={remoteVideoRef} autoPlay muted={false} playsInline className="video-element" />
          {remotePlaybackBlocked && (
            <button type="button" className="waiting-overlay playback-overlay" onClick={enableRemotePlayback}>
              Click to enable sound and video
            </button>
          )}
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
