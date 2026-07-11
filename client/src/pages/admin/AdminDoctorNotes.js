import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiFileText } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

const getAppointmentTimestamp = (appointment) => {
  const dateValue = appointment.appointmentDate || appointment.appointmentdate || '';
  const timeValue = appointment.appointmentTime || appointment.appointmenttime || '';
  const parsed = new Date(`${dateValue} ${timeValue}`.trim());
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  return new Date(appointment.createdAt || appointment.createdat || 0).getTime();
};

function AdminDoctorNotes() {
  const token = localStorage.getItem('token');
  const editorRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  const [patientMode, setPatientMode] = useState('existing');
  const [patientQuery, setPatientQuery] = useState('');
  const [matchedPatients, setMatchedPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  const [formData, setFormData] = useState({
    patientName: '',
    patientAge: '',
    issue: '',
    noteContent: ''
  });
  const [prescriptionForm, setPrescriptionForm] = useState({
    appointmentId: '',
    medications: '',
    dosageInstructions: '',
    medicalNotes: '',
    followUpRecommendations: ''
  });

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );
  const activePatientId = selectedNote?.patientId || selectedPatient?.id || null;
  const patientPrescriptionAppointments = useMemo(() => (
    appointments.filter((appointment) => (
      appointment.patientId === activePatientId &&
      String(appointment.approvalStatus || '').toLowerCase() === 'approved'
    )).sort((a, b) => getAppointmentTimestamp(b) - getAppointmentTimestamp(a))
  ), [appointments, activePatientId]);

  const formatAppointmentOption = (appointment) => {
    const dateValue = appointment.appointmentDate || appointment.appointmentdate;
    const parsed = dateValue ? new Date(dateValue) : null;
    const dateLabel = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : dateValue || 'No date';
    const statusLabel = appointment.status ? ` - ${appointment.status}` : '';
    return `${dateLabel} ${appointment.appointmentTime || ''}${statusLabel}`.trim();
  };

  const loadNotes = useCallback(async (query = '') => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/notes`, {
        params: { patientQuery: query },
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotes(response.data || []);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load doctor notes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadPatients = useCallback(async (query) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/notes/patients`, {
        params: { query },
        headers: { Authorization: `Bearer ${token}` }
      });
      setMatchedPatients(response.data || []);
    } catch (error) {
      setMatchedPatients([]);
    }
  }, [token]);

  const loadAppointments = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data || []);
    } catch (error) {
      setAppointments([]);
    }
  }, [token]);

  useEffect(() => {
    loadNotes('');
    loadAppointments();
  }, [loadNotes, loadAppointments]);

  useEffect(() => {
    if (patientMode !== 'existing') return;
    if (!patientQuery.trim()) {
      setMatchedPatients([]);
      return;
    }
    const timeout = setTimeout(() => loadPatients(patientQuery.trim()), 250);
    return () => clearTimeout(timeout);
  }, [patientMode, patientQuery, loadPatients]);

  useEffect(() => {
    if (!selectedNote) {
      if (editorRef.current) editorRef.current.innerHTML = '';
      return;
    }
    setFormData({
      patientName: selectedNote.patientName || '',
      patientAge: selectedNote.patientAge || '',
      issue: selectedNote.issue || '',
      noteContent: selectedNote.noteContent || ''
    });
    setSelectedPatient(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = selectedNote.noteContent || '';
    }
  }, [selectedNote]);

  const resetForNewNote = () => {
    setSelectedNoteId('');
    setFormData({ patientName: '', patientAge: '', issue: '', noteContent: '' });
    setSelectedPatient(null);
    setPatientQuery('');
    if (editorRef.current) editorRef.current.innerHTML = '';
  };

  const runEditorCommand = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    setFormData((prev) => ({ ...prev, noteContent: editorRef.current.innerHTML }));
  };

  const handleEditorInput = () => {
    setFormData((prev) => ({
      ...prev,
      noteContent: editorRef.current ? editorRef.current.innerHTML : ''
    }));
  };

  const selectExistingPatient = (patient) => {
    setSelectedPatient(patient);
    setPatientQuery(patient.fullName);
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName || '',
      patientAge: patient.age ?? ''
    }));
    setMatchedPatients([]);
  };

  const saveNote = async () => {
    const content = editorRef.current ? editorRef.current.innerHTML : formData.noteContent;
    const issue = String(formData.issue || '').trim();
    const patientAge = formData.patientAge === '' ? null : Number(formData.patientAge);

    if (!issue) {
      alert('Please enter patient issue/summary title');
      return;
    }

    if (patientMode === 'existing' && !selectedNoteId && !selectedPatient) {
      alert('Please select an existing patient first');
      return;
    }

    if (patientMode === 'new' && !String(formData.patientName || '').trim()) {
      alert('Please enter patient name for new patient note');
      return;
    }

    const payload = {
      patientId: patientMode === 'existing' ? selectedPatient?.id || null : null,
      patientName: patientMode === 'new' ? formData.patientName : selectedPatient?.fullName,
      patientAge,
      issue,
      noteContent: content
    };

    try {
      if (selectedNoteId) {
        await axios.put(`${API_BASE_URL}/api/admin/notes/${selectedNoteId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Doctor note updated');
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/admin/notes`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Doctor note created');
        setSelectedNoteId(response.data.noteId || '');
      }

      await loadNotes(noteSearch);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save doctor note');
    }
  };

  const openPrescriptionModal = () => {
    if (!selectedNoteId) {
      alert('Please save the doctor notes first, then issue the prescription.');
      return;
    }

    if (!activePatientId) {
      alert('Prescriptions can only be issued for registered patients with appointments.');
      return;
    }

    if (patientPrescriptionAppointments.length === 0) {
      alert('No approved appointments found for this patient. First approve the patient appointment.');
      return;
    }

    setPrescriptionForm({
      appointmentId: patientPrescriptionAppointments[0].id,
      medications: '',
      dosageInstructions: '',
      medicalNotes: formData.issue || '',
      followUpRecommendations: ''
    });
    setShowPrescriptionModal(true);
  };

  const handlePrescriptionChange = (e) => {
    const { name, value } = e.target;
    setPrescriptionForm((prev) => ({ ...prev, [name]: value }));
  };

  const issuePrescription = async () => {
    if (!prescriptionForm.appointmentId) {
      alert('Please select an appointment');
      return;
    }

    if (!prescriptionForm.medications.trim()) {
      alert('Please enter medications');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/prescriptions/issue`,
        {
          appointmentId: prescriptionForm.appointmentId,
          medications: prescriptionForm.medications,
          dosageInstructions: prescriptionForm.dosageInstructions,
          medicalNotes: prescriptionForm.medicalNotes,
          followUpRecommendations: prescriptionForm.followUpRecommendations,
          doctorName: 'Dr. Merceline'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setShowPrescriptionModal(false);
      await loadAppointments();
      alert('Prescription issued successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to issue prescription');
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading doctor notes...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Doctor Notes</h1>
            <p className="dashboard-subtitle">Record each patient checkup summary and progress notes.</p>
          </div>
        </div>

        <div className="doctor-notes-layout">
          <aside className="doctor-notes-sidebar card">
            <div className="card-header">
              <h2 className="card-title">Patient Summaries</h2>
            </div>
            <div className="card-content">
              <input
                className="doctor-notes-search"
                placeholder="Search notes by patient..."
                value={noteSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setNoteSearch(value);
                  loadNotes(value);
                }}
              />
              <button type="button" className="btn-primary-small doctor-notes-new-btn" onClick={resetForNewNote}>
                New Summary
              </button>
              <div className="doctor-notes-list">
                {notes.length === 0 ? (
                  <p className="text-muted">No summaries yet.</p>
                ) : (
                  notes.map((note) => (
                    <button
                      type="button"
                      key={note.id}
                      className={`doctor-notes-item ${selectedNoteId === note.id ? 'active' : ''}`}
                      onClick={() => setSelectedNoteId(note.id)}
                    >
                      <strong>{note.patientName}</strong>
                      <span>{note.issue}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="doctor-notes-editor card">
            <div className="card-header">
              <h2 className="card-title">{selectedNoteId ? 'Edit Patient Summary' : 'Create Patient Summary'}</h2>
            </div>
            <div className="card-content">
              {!selectedNoteId && (
                <div className="doctor-notes-mode">
                  <button
                    type="button"
                    className={`btn-small ${patientMode === 'existing' ? '' : 'btn-muted'}`}
                    onClick={() => setPatientMode('existing')}
                  >
                    Existing Patient
                  </button>
                  <button
                    type="button"
                    className={`btn-small ${patientMode === 'new' ? '' : 'btn-muted'}`}
                    onClick={() => setPatientMode('new')}
                  >
                    New Patient
                  </button>
                </div>
              )}

              <div className="form-row">
                {patientMode === 'existing' && !selectedNoteId ? (
                  <div className="form-group doctor-notes-patient-search-wrap">
                    <label htmlFor="patientQuery">Find Existing Patient</label>
                    <input
                      id="patientQuery"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder="Search by patient name"
                    />
                    {matchedPatients.length > 0 && (
                      <div className="doctor-notes-suggestions">
                        {matchedPatients.map((patient) => (
                          <button type="button" key={patient.id} onClick={() => selectExistingPatient(patient)}>
                            {patient.fullName} {patient.email ? `(${patient.email})` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="patientName">Patient Name</label>
                    <input
                      id="patientName"
                      value={formData.patientName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, patientName: e.target.value }))}
                      disabled={Boolean(selectedNoteId) || patientMode === 'existing'}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="patientAge">Age</label>
                  <input
                    id="patientAge"
                    type="number"
                    min="0"
                    value={formData.patientAge}
                    onChange={(e) => setFormData((prev) => ({ ...prev, patientAge: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="issue">Issue / Diagnosis Summary</label>
                <input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) => setFormData((prev) => ({ ...prev, issue: e.target.value }))}
                  placeholder="e.g. Persistent chest pain, migraine follow-up..."
                />
              </div>

              <div className="doctor-notes-toolbar">
                <button type="button" onClick={() => runEditorCommand('bold')}><strong>B</strong></button>
                <button type="button" onClick={() => runEditorCommand('italic')}><em>I</em></button>
                <button type="button" onClick={() => runEditorCommand('underline')}><u>U</u></button>
                <button type="button" onClick={() => runEditorCommand('insertUnorderedList')}>• List</button>
                <button type="button" onClick={() => runEditorCommand('insertOrderedList')}>1. List</button>
                <button type="button" onClick={() => runEditorCommand('formatBlock', '<h2>')}>H2</button>
                <button type="button" onClick={() => runEditorCommand('formatBlock', '<p>')}>Normal</button>
                <select onChange={(e) => runEditorCommand('fontSize', e.target.value)} defaultValue="3">
                  <option value="2">Small</option>
                  <option value="3">Normal</option>
                  <option value="4">Large</option>
                  <option value="5">X-Large</option>
                </select>
              </div>

              <div
                ref={editorRef}
                className="doctor-notes-editor-surface"
                contentEditable
                onInput={handleEditorInput}
                suppressContentEditableWarning
              />

              <div className="doctor-notes-actions">
                <button type="button" className="btn-cancel" onClick={resetForNewNote}>Clear</button>
                <button type="button" className="btn-prescription-action" onClick={openPrescriptionModal}>
                  <FiFileText /> Issue Prescription
                </button>
                <button type="button" className="btn-submit" onClick={saveNote}>
                  {selectedNoteId ? 'Update Summary' : 'Save Summary'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {showPrescriptionModal && (
          <div className="modal active">
            <div className="modal-content">
              <div className="modal-header">
                Issue Prescription
                <span className="modal-close" onClick={() => setShowPrescriptionModal(false)}>&times;</span>
              </div>

              <form>
                <p className="text-muted">
                  Select the appointment this prescription belongs to. You can issue another prescription from the same saved notes when needed.
                </p>
                <div className="form-group">
                  <label htmlFor="appointmentId">Appointment</label>
                  <select
                    id="appointmentId"
                    name="appointmentId"
                    value={prescriptionForm.appointmentId}
                    onChange={handlePrescriptionChange}
                  >
                    {patientPrescriptionAppointments.map((appointment) => (
                      <option key={appointment.id} value={appointment.id}>
                        {formatAppointmentOption(appointment)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="medications">Medications</label>
                  <textarea
                    id="medications"
                    name="medications"
                    value={prescriptionForm.medications}
                    onChange={handlePrescriptionChange}
                    rows="3"
                    placeholder="Enter medications"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="dosageInstructions">Dosage Instructions</label>
                  <textarea
                    id="dosageInstructions"
                    name="dosageInstructions"
                    value={prescriptionForm.dosageInstructions}
                    onChange={handlePrescriptionChange}
                    rows="3"
                    placeholder="Enter dosage instructions"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="medicalNotes">Medical Notes</label>
                  <textarea
                    id="medicalNotes"
                    name="medicalNotes"
                    value={prescriptionForm.medicalNotes}
                    onChange={handlePrescriptionChange}
                    rows="3"
                    placeholder="Enter medical notes"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="followUpRecommendations">Follow-up Recommendations</label>
                  <textarea
                    id="followUpRecommendations"
                    name="followUpRecommendations"
                    value={prescriptionForm.followUpRecommendations}
                    onChange={handlePrescriptionChange}
                    rows="3"
                    placeholder="Enter follow-up recommendations"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowPrescriptionModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={issuePrescription}>
                    Issue Prescription
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminDoctorNotes;
