import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCalendar,
  FiFileText,
  FiHeart,
  FiMail,
  FiMenu,
  FiShield,
  FiVideo,
  FiX
} from 'react-icons/fi';
import '../styles/LandingPage.css';

function AboutPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing-page about-page">
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">
            <div className="brand-icon">
              <FiHeart size={20} />
            </div>
            <span className="brand-name">Elite Online Healthcare</span>
          </Link>

          <div className="navbar-links desktop">
            <Link to="/#features" className="nav-link">Features</Link>
            <Link to="/#how-it-works" className="nav-link">How it Works</Link>
            <Link to="/about" className="nav-link active">About</Link>
            <Link to="/login" className="nav-link nav-login-link">Log in</Link>
            <Link to="/register" className="nav-button nav-signup">Get Started</Link>
          </div>

          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>

          {mobileMenuOpen && (
            <div className="navbar-links mobile active">
              <Link to="/#features" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Features</Link>
              <Link to="/#how-it-works" className="nav-link" onClick={() => setMobileMenuOpen(false)}>How it Works</Link>
              <Link to="/about" className="nav-link active" onClick={() => setMobileMenuOpen(false)}>About</Link>
              <Link to="/login" className="nav-link nav-login-link" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
              <Link to="/register" className="nav-button nav-signup" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
            </div>
          )}
        </div>
      </nav>

      <main>
        <section className="about-hero">
          <div className="about-hero-content">
            <div className="hero-subtitle">
              <FiShield size={14} />
              Trusted online healthcare
            </div>
            <h1>About Elite Online Healthcare</h1>
            <p>
              Elite Online Healthcare helps patients access convenient online consultations,
              appointment booking, secure payments, and digital prescriptions from one simple
              platform.
            </p>
            <div className="hero-buttons">
              <Link to="/register" className="btn btn-primary">Book a Consultation</Link>
              <a href="mailto:eliteonlinehealthcare@gmail.com" className="btn btn-secondary">Email Us</a>
            </div>
          </div>

          <div className="about-contact-card">
            <h2>Contact Details</h2>
            <a href="mailto:eliteonlinehealthcare@gmail.com" className="about-contact-link">
              <FiMail />
              eliteonlinehealthcare@gmail.com
            </a>
            <p>
              Use this email for appointment support, consultation questions, prescription
              follow-up, and general patient assistance.
            </p>
          </div>
        </section>

        <section className="about-section">
          <div className="section-header">
            <h2>What We Help With</h2>
            <p>Simple tools for patients and the care team, built around real consultations.</p>
          </div>

          <div className="about-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <FiCalendar />
              </div>
              <h3>Appointment Booking</h3>
              <p>Patients can create an account, book available time slots, and track appointment status.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiVideo />
              </div>
              <h3>Online Consultations</h3>
              <p>Consult with the care team through an in-app video room for approved appointments.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiFileText />
              </div>
              <h3>Digital Prescriptions</h3>
              <p>Receive consultation notes and prescriptions through your patient dashboard.</p>
            </div>
          </div>
        </section>

        <section className="about-founder">
          <div>
            <h2>Patient-First Online Care</h2>
            <p>
              The platform is designed to make healthcare access clearer and faster, from the
              first booking request to the final prescription download.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary">Access Your Account</Link>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-container">
          <p>&copy; 2026 Elite Online Healthcare. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default AboutPage;
