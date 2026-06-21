import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import '../../styles/ModernDashboard.css';
import '../../styles/AdminManagement.css';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { API_BASE_URL } from '../../config/api';

function AdminSchedule() {
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [slotForm, setSlotForm] = useState({ slotDate: '', slotTime: '' });
  const [bulkForm, setBulkForm] = useState({
    mode: 'day',
    startDate: '',
    startTime: '09:00',
    endTime: '17:00',
    intervalMinutes: 60
  });

  const token = localStorage.getItem('token');

  const loadSlots = useCallback(async () => {
    try {
      setPageError('');
      const response = await axios.get(`${API_BASE_URL}/api/admin/availability`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailabilitySlots(response.data);
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.message || 'Unknown error';
      setPageError(`Failed to load availability (${status || 'no-status'}): ${message}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleSlotChange = (e) => {
    const { name, value } = e.target;
    setSlotForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBulkChange = (e) => {
    const { name, value } = e.target;
    setBulkForm((prev) => ({ ...prev, [name]: value }));
  };

  const addAvailabilitySlot = async (e) => {
    e.preventDefault();
    if (!slotForm.slotDate || !slotForm.slotTime) {
      alert('Please select date and time');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/admin/availability`, slotForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSlotForm({ slotDate: '', slotTime: '' });
      await loadSlots();
      alert('Availability slot created successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add availability slot');
    }
  };

  const addBulkAvailability = async (e) => {
    e.preventDefault();

    if (!bulkForm.startDate) {
      alert('Please select a start date');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/admin/availability/bulk`, bulkForm, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert(`${response.data.created} slots created (${response.data.skipped} duplicates skipped)`);
      await loadSlots();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create bulk slots');
    }
  };

  const deleteAvailabilitySlot = async (slotId) => {
    const confirmed = await window.confirm('Delete this availability slot?');
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/admin/availability/${slotId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadSlots();
      alert('Availability slot deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete slot');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <div className="loading-spinner">Loading schedule...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-text">
            <h1 className="dashboard-title">Schedule</h1>
            <p className="dashboard-subtitle">Set single slots, full-day, or full-week availability windows</p>
          </div>
        </div>

        {pageError && <div className="alert alert-danger">{pageError}</div>}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Add Single Time Slot</h2>
          </div>
          <div className="card-content">
            <form onSubmit={addAvailabilitySlot} className="admin-inline-form">
              <div className="form-group">
                <label htmlFor="slotDate">Date</label>
                <input type="date" id="slotDate" name="slotDate" value={slotForm.slotDate} onChange={handleSlotChange} min={today} />
              </div>
              <div className="form-group">
                <label htmlFor="slotTime">Time</label>
                <input type="time" id="slotTime" name="slotTime" value={slotForm.slotTime} onChange={handleSlotChange} />
              </div>
              <button type="submit" className="btn-primary-small admin-inline-submit">
                <FiPlus /> Add Slot
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Add Whole Day / Whole Week</h2>
          </div>
          <div className="card-content">
            <form onSubmit={addBulkAvailability}>
              <div className="bulk-grid">
                <div className="form-group">
                  <label htmlFor="mode">Mode</label>
                  <select id="mode" name="mode" value={bulkForm.mode} onChange={handleBulkChange}>
                    <option value="day">Whole Day</option>
                    <option value="week">Whole Week</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="startDate">Start Date</label>
                  <input type="date" id="startDate" name="startDate" value={bulkForm.startDate} onChange={handleBulkChange} min={today} />
                </div>

                <div className="form-group">
                  <label htmlFor="startTime">Available From</label>
                  <input type="time" id="startTime" name="startTime" value={bulkForm.startTime} onChange={handleBulkChange} />
                </div>

                <div className="form-group">
                  <label htmlFor="endTime">Available To</label>
                  <input type="time" id="endTime" name="endTime" value={bulkForm.endTime} onChange={handleBulkChange} />
                </div>

                <div className="form-group">
                  <label htmlFor="intervalMinutes">Slot Interval (minutes)</label>
                  <select
                    id="intervalMinutes"
                    name="intervalMinutes"
                    value={bulkForm.intervalMinutes}
                    onChange={handleBulkChange}
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={45}>45</option>
                    <option value={60}>60</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary-small">
                <FiPlus /> Generate Slots
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Current Availability</h2>
          </div>
          <div className="card-content">
            {availabilitySlots.length === 0 ? (
              <p className="empty-message">No availability slots defined.</p>
            ) : (
              <div className="table-responsive">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availabilitySlots.map((slot) => (
                      <tr key={slot.id}>
                        <td>{new Date(slot.slotDate).toLocaleDateString()}</td>
                        <td>{slot.slotTime}</td>
                        <td>
                          <button className="btn-small btn-danger" onClick={() => deleteAvailabilitySlot(slot.id)}>
                            <FiTrash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminSchedule;
