import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/Uploads.css';
import { FiImage } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminUploads() {
  const token = localStorage.getItem('token');
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUploads = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/uploads/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUploads(response.data || []);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load patient uploads');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading uploads...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Patient Uploads</h1>
            <p className="dashboard-subtitle">View images patients uploaded after lab tests, scans, or printout results.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Uploaded Result Images</h2>
          </div>
          <div className="card-content">
            {uploads.length === 0 ? (
              <div className="uploads-empty">
                <FiImage />
                <p>No patient images uploaded yet.</p>
              </div>
            ) : (
              <div className="uploads-grid admin-uploads-grid">
                {uploads.map((upload) => (
                  <article key={upload.id} className="upload-card admin-upload-card">
                    <a href={upload.imageData} target="_blank" rel="noreferrer">
                      <img src={upload.imageData} alt={upload.title || 'Patient uploaded result'} />
                    </a>
                    <div className="upload-card-body">
                      <h3>Image uploaded by {upload.patientName || 'Patient'}</h3>
                      <p className="upload-card-title">{upload.title || 'Test result upload'}</p>
                      <p>{upload.note || 'No note added.'}</p>
                      <div className="upload-card-meta">
                        <span>{upload.patientEmail}</span>
                        <span>{new Date(upload.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminUploads;
