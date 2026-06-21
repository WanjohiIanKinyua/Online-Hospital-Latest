import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import '../styles/Prescriptions.css';
import { FiArrowLeft, FiDownload, FiPrinter } from 'react-icons/fi';
import { DashboardLayout } from '../components/DashboardLayout';
import { API_BASE_URL } from '../config/api';

function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  const fetchPrescriptions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/prescriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPrescriptions(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load prescriptions');
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  const downloadPrescription = (prescription) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const left = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - left * 2;
    let y = 56;

    const addHeading = (text) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(text, left, y);
      y += 18;
    };

    const addParagraph = (text) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text || 'N/A', maxWidth);
      doc.text(lines, left, y);
      y += lines.length * 14 + 8;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('MERCELINE NASERIAN ONLINE HOSPITAL', left, y);
    y += 20;
    doc.setFontSize(12);
    doc.text('DIGITAL PRESCRIPTION', left, y);
    y += 24;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Prescription ID: ${prescription.id}`, left, y);
    y += 14;
    doc.text(`Issued Date: ${new Date(prescription.issuedAt).toLocaleDateString()}`, left, y);
    y += 14;
    doc.text(`Doctor: ${prescription.doctorName || 'Dr. Merceline'}`, left, y);
    y += 24;

    addHeading('MEDICATIONS');
    addParagraph(prescription.medications);

    addHeading('DOSAGE INSTRUCTIONS');
    addParagraph(prescription.dosageInstructions);

    addHeading('MEDICAL NOTES');
    addParagraph(prescription.medicalNotes);

    addHeading('FOLLOW-UP RECOMMENDATIONS');
    addParagraph(prescription.followUpRecommendations || 'Please follow up with your doctor as needed.');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    const disclaimer = 'Disclaimer: This is a digital prescription issued by Dr.Merceline Naserian Online Hospital. Please use it as instructed by your doctor.';
    const disclaimerLines = doc.splitTextToSize(disclaimer, maxWidth);
    doc.text(disclaimerLines, left, y + 8);

    doc.save(`prescription_${prescription.id}.pdf`);
  };

  const generatePrescriptionDocument = (prescription) => {
    return `
MERCELINE NASERIAN ONLINE HOSPITAL
DIGITAL PRESCRIPTION

Prescription ID: ${prescription.id}
Issued Date: ${new Date(prescription.issuedAt).toLocaleDateString()}
Doctor: ${prescription.doctorName || 'Dr. Merceline'}

====================================

MEDICATIONS:
${prescription.medications}

DOSAGE INSTRUCTIONS:
${prescription.dosageInstructions}

MEDICAL NOTES:
${prescription.medicalNotes || 'N/A'}

FOLLOW-UP RECOMMENDATIONS:
${prescription.followUpRecommendations || 'Please follow up with your doctor as needed'}

====================================

Disclaimer: This is a digital prescription issued by Dr.Merceline Naserian Online Hospital.
Please use it as instructed by your doctor.
    `;
  };

  const printPrescription = (prescription) => {
    const window_print = window.open('', '', 'height=400,width=800');
    const content = generatePrescriptionDocument(prescription);
    window_print.document.write('<pre>' + content + '</pre>');
    window_print.document.close();
    window_print.print();
  };

  if (loading) {
    return <div className="loading">Loading prescriptions...</div>;
  }

  return (
    <DashboardLayout role="patient">
      <div className="prescriptions-page">
        <div className="prescriptions-container">
          <Link to="/dashboard" className="back-button">
            <FiArrowLeft /> Back to Dashboard
          </Link>

          <div className="prescriptions-card">
            <h1>Your Prescriptions</h1>

            {error && <div className="alert alert-danger">{error}</div>}

            {prescriptions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">??</div>
                <div className="empty-state-text">No prescriptions yet</div>
                <p style={{ color: '#64748b', marginTop: '10px' }}>
                  Prescriptions will appear here after your consultations
                </p>
              </div>
            ) : (
              <div className="prescriptions-list">
                {prescriptions.map((prescription) => (
                  <div key={prescription.id} className="prescription-item">
                    <div className="prescription-header">
                      <div>
                        <h3>Prescription from {prescription.doctorName || 'Dr. Merceline'}</h3>
                        <p className="prescription-date">
                          Issued on {new Date(prescription.issuedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="prescription-actions">
                        <button
                          className="btn-download-prescription"
                          onClick={() => downloadPrescription(prescription)}
                          title="Download prescription"
                        >
                          <FiDownload /> Download PDF
                        </button>
                        <button
                          className="btn-print-prescription"
                          onClick={() => printPrescription(prescription)}
                          title="Print prescription"
                        >
                          <FiPrinter /> Print
                        </button>
                      </div>
                    </div>

                    <div className="prescription-content">
                      <div className="prescription-section">
                        <h4>Medications</h4>
                        <p>{prescription.medications}</p>
                      </div>

                      {prescription.dosageInstructions && (
                        <div className="prescription-section">
                          <h4>Dosage Instructions</h4>
                          <p>{prescription.dosageInstructions}</p>
                        </div>
                      )}

                      {prescription.medicalNotes && (
                        <div className="prescription-section">
                          <h4>Medical Notes</h4>
                          <p>{prescription.medicalNotes}</p>
                        </div>
                      )}

                      {prescription.followUpRecommendations && (
                        <div className="prescription-section">
                          <h4>Follow-up Recommendations</h4>
                          <p>{prescription.followUpRecommendations}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Prescriptions;
