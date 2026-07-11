import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import '../styles/ModernDashboard.css';
import '../styles/Uploads.css';
import { FiImage, FiUploadCloud } from 'react-icons/fi';
import { API_BASE_URL } from '../config/api';

const MAX_FILE_SIZE = 4 * 1024 * 1024;

function PatientUploads() {
  const token = localStorage.getItem('token');
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    note: '',
    imageData: '',
    fileName: '',
    mimeType: ''
  });

  const selectedPreviewName = useMemo(() => formData.fileName || 'No image selected', [formData.fileName]);

  const loadUploads = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/uploads/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUploads(response.data || []);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load uploads');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('Image is too large. Please choose an image under 4MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        imageData: String(reader.result || ''),
        fileName: file.name,
        mimeType: file.type
      }));
    };
    reader.readAsDataURL(file);
  };

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!formData.imageData) {
      alert('Please choose an image to upload');
      return;
    }

    setSaving(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/uploads`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFormData({
        title: '',
        note: '',
        imageData: '',
        fileName: '',
        mimeType: ''
      });
      await loadUploads();
      alert('Image uploaded successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to upload image');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="patient">
        <div className="loading-spinner">Loading uploads...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="patient">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Upload Test Results</h1>
            <p className="dashboard-subtitle">Share a clear photo of lab printouts, scans, or other test results with the doctor.</p>
          </div>
        </div>

        <div className="uploads-layout">
          <section className="card upload-form-card">
            <div className="card-header">
              <h2 className="card-title">New Upload</h2>
            </div>
            <div className="card-content">
              <form onSubmit={submitUpload}>
                <div className="form-group">
                  <label htmlFor="title">Title</label>
                  <input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleFieldChange}
                    placeholder="e.g. Blood test results"
                  />
                </div>

                <label className="upload-dropzone" htmlFor="resultImage">
                  {formData.imageData ? (
                    <img src={formData.imageData} alt="Selected test result preview" />
                  ) : (
                    <span className="upload-dropzone-empty">
                      <FiUploadCloud />
                      Choose a photo of your printout
                    </span>
                  )}
                </label>
                <input
                  id="resultImage"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="upload-file-input"
                  onChange={handleImageChange}
                />
                <p className="upload-file-name">{selectedPreviewName}</p>

                <div className="form-group">
                  <label htmlFor="note">Optional Note</label>
                  <textarea
                    id="note"
                    name="note"
                    rows="3"
                    value={formData.note}
                    onChange={handleFieldChange}
                    placeholder="Add anything the doctor should know"
                  />
                </div>

                <button type="submit" className="btn-submit upload-submit" disabled={saving}>
                  <FiUploadCloud /> {saving ? 'Uploading...' : 'Upload Image'}
                </button>
              </form>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">My Uploads</h2>
            </div>
            <div className="card-content">
              {uploads.length === 0 ? (
                <div className="uploads-empty">
                  <FiImage />
                  <p>No images uploaded yet.</p>
                </div>
              ) : (
                <div className="uploads-grid">
                  {uploads.map((upload) => (
                    <article key={upload.id} className="upload-card">
                      <img src={upload.imageData} alt={upload.title || 'Uploaded test result'} />
                      <div className="upload-card-body">
                        <h3>{upload.title || 'Test result upload'}</h3>
                        <p>{upload.note || 'No note added.'}</p>
                        <span>{new Date(upload.createdAt).toLocaleString()}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default PatientUploads;
