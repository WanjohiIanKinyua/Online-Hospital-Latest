import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { API_BASE_URL } from '../../config/api';

function AdminDoctorNotes() {
  const token = localStorage.getItem('token');
  const editorRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('');

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

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

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

  useEffect(() => {
    loadNotes('');
  }, [loadNotes]);

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
                <button type="button" className="btn-submit" onClick={saveNote}>
                  {selectedNoteId ? 'Update Summary' : 'Save Summary'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminDoctorNotes;
