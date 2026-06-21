import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCheckCircle,
  FiCalendar,
  FiVideo,
  FiCreditCard,
  FiShield,
  FiClock,
  FiMenu,
  FiX,
  FiHeart,
  FiBriefcase
} from 'react-icons/fi';
import '../styles/LandingPage.css';

function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing-page">
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">
            <div className="brand-icon">
              <FiHeart size={20} />
            </div>
            <span className="brand-name">Dr.Merceline Naserian</span>
          </Link>

          <div className="navbar-links desktop">
            <a href="#features" className="nav-link">Features</a>
            <a href="#how-it-works" className="nav-link">How it Works</a>
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
              <a href="#features" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="nav-link" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
              <Link to="/login" className="nav-link nav-login-link" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
              <Link to="/register" className="nav-button nav-signup" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
            </div>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-subtitle">
              <FiBriefcase size={14} />
              Dr. merceline Online healthcare platform
            </div>

            <h1 className="hero-title">
              Quality
              <br />
              Healthcare,
              <br />
              <span className="highlight">Anytime, Anywhere</span>
            </h1>

            <p className="hero-description">
              Book appointments, consult with doctors online, and receive digital prescriptions all from the comfort of your home.
            </p>

            <div className="hero-buttons">
              <Link to="/register" className="btn btn-primary">Book a Consultation</Link>
              <a href="#features" className="btn btn-secondary">Learn More</a>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-placeholder">
              <div className="hero-icons">
                <div className="icon-badge">+</div>
                <div className="icon-badge">H</div>
                <div className="icon-badge">*</div>
                <div className="icon-badge">C</div>
                <div className="icon-badge">O</div>
              </div>

              <img
                className="hero-doctor-image"
                src="/images/Naserian.jpeg"
                alt="Doctor using a tablet"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="features-container">
          <div className="section-header">
            <h2>Everything You Need for Better Healthcare</h2>
            <p>A comprehensive telemedicine platform designed for simplicity and reliability.</p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <FiCalendar />
              </div>
              <h3>Easy Booking</h3>
              <p>Schedule appointments at your convenience with real-time slot availability.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiVideo />
              </div>
              <h3>Video Consultations</h3>
              <p>Connect face-to-face with doctors through secure, high-quality video calls.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiCreditCard />
              </div>
              <h3>Secure Payments</h3>
              <p>Simple and safe payment processing at just KSH 1000 per consultation.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiCheckCircle />
              </div>
              <h3>Digital Prescriptions</h3>
              <p>Instantly receive and download prescriptions from your personal dashboard.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiShield />
              </div>
              <h3>Privacy & Security</h3>
              <p>Enterprise-grade encryption protects all your sensitive medical information.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <FiClock />
              </div>
              <h3>24/7 Access</h3>
              <p>Access your medical records, history, and appointments anytime, anywhere.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="how-it-works-container">
          <div className="section-header">
            <h2>How It Works</h2>
            <p>Four simple steps to access quality healthcare from anywhere.</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3>Create Account</h3>
              <p>Register with your details and get instant access to browse doctors.</p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3>Book & Pay</h3>
              <p>Select a time slot and pay securely. No hidden charges.</p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3>Consult Online</h3>
              <p>Join the video consultation at your scheduled appointment time.</p>
            </div>

            <div className="step-card">
              <div className="step-number">04</div>
              <h3>Get Prescription</h3>
              <p>Receive your digital prescription instantly after consultation.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="cta-container">
          <div className="cta-content">
            <h2>Ready to Experience Better Healthcare?</h2>
            <p>Join thousands of patients who trust Dr.Merceline Naserian for quality medical consultations.</p>
            <Link to="/register" className="btn btn-primary btn-large">Create Your Account</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-container">
          <p>&copy; 2026 Dr.Merceline Naserian Online Hospital. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;



