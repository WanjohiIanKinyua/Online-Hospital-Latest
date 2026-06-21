const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../database');
const { JWT_SECRET, CLIENT_URL } = require('../config/env');

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

const sendResetEmail = async ({ toEmail, resetLink }) => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  if (!host || !user || !pass || !from) {
    console.log('Password reset email fallback (SMTP not configured):', resetLink);
    return { sent: false, usedFallback: true };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    console.log('Password reset email fallback (nodemailer unavailable):', resetLink);
    return { sent: false, usedFallback: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Reset your password',
    text: `Use this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour.</p>`
  });

  return { sent: true, usedFallback: false };
};

exports.register = (req, res) => {
  const { fullName, email, password, phone, dateOfBirth, gender, address } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');

  if (!fullName || !normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!PASSWORD_POLICY_REGEX.test(normalizedPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters and include at least 1 uppercase letter, 1 number, and 1 special character'
    });
  }

  // Hash password
  const hashedPassword = bcrypt.hashSync(normalizedPassword, 10);
  const userId = uuidv4();

  db.run(
    `INSERT INTO users (id, fullName, email, password, phone, dateOfBirth, gender, address, role) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, fullName, normalizedEmail, hashedPassword, phone || null, dateOfBirth || null, gender || null, address || null, 'patient'],
    (err) => {
      if (err) {
        if (
          err.code === '23505' ||
          err.message.includes('UNIQUE constraint failed') ||
          err.message.toLowerCase().includes('duplicate key value')
        ) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Registration failed' });
      }

      const token = jwt.sign({ id: userId, email: normalizedEmail, role: 'patient' }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ message: 'User registered successfully', token, userId });
    }
  );
};

exports.login = (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Login failed' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ 
      message: 'Login successful', 
      token, 
      user: { 
        id: user.id, 
        fullName: user.fullName, 
        email: user.email, 
        role: user.role 
      } 
    });
  });
};

exports.getProfile = (req, res) => {
  db.get('SELECT id, fullName, email, phone, dateOfBirth, gender, address, createdAt FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user);
  });
};

exports.updateProfile = (req, res) => {
  const { fullName, phone, dateOfBirth, gender, address } = req.body;

  db.run(
    `UPDATE users SET fullName = ?, phone = ?, dateOfBirth = ?, gender = ?, address = ? WHERE id = ?`,
    [fullName || '', phone || '', dateOfBirth || '', gender || '', address || '', req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      res.status(200).json({ message: 'Profile updated successfully' });
    }
  );
};

exports.forgotPassword = (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  db.get('SELECT id, email FROM users WHERE email = ?', [normalizedEmail], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to process request' });
    }

    if (!user) {
      return res.status(200).json({
        message: 'If an account with that email exists, a reset link has been sent.'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = Date.now() + RESET_TOKEN_EXPIRY_MS;

    db.run(
      `UPDATE users SET resetTokenHash = ?, resetTokenExpiresAt = ? WHERE id = ?`,
      [tokenHash, expiresAt, user.id],
      async (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: 'Failed to process request' });
        }

        const normalizedClientUrl = String(CLIENT_URL || req.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
        const resetLink = `${normalizedClientUrl}/reset-password?token=${rawToken}`;

        try {
          const result = await sendResetEmail({ toEmail: user.email, resetLink });
          const response = {
            message: 'Reset code generated successfully. Use it below to reset your password.',
            resetCode: rawToken,
            resetCodeExpiresAt: expiresAt
          };

          if (result.usedFallback) {
            response.resetLink = resetLink;
          }

          return res.status(200).json(response);
        } catch (mailError) {
          return res.status(500).json({ error: mailError.message || 'Failed to send reset email' });
        }
      }
    );
  });
};

exports.resetPassword = (req, res) => {
  const { token, resetCode, newPassword, confirmPassword } = req.body;
  const effectiveToken = String(token || resetCode || '').trim();

  if (!effectiveToken || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Reset code and both password fields are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters and include at least 1 uppercase letter, 1 number, and 1 special character'
    });
  }

  const tokenHash = crypto.createHash('sha256').update(effectiveToken).digest('hex');

  db.get(
    `SELECT id, resetTokenExpiresAt FROM users WHERE resetTokenHash = ?`,
    [tokenHash],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reset password' });
      }

      if (!user || !user.resetTokenExpiresAt || Number(user.resetTokenExpiresAt) < Date.now()) {
        return res.status(400).json({ error: 'Reset token is invalid or expired' });
      }

      const hashedPassword = bcrypt.hashSync(newPassword, 10);

      db.run(
        `UPDATE users
         SET password = ?, resetTokenHash = NULL, resetTokenExpiresAt = NULL
         WHERE id = ?`,
        [hashedPassword, user.id],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ error: 'Failed to reset password' });
          }

          return res.status(200).json({ message: 'Password reset successful. Please log in.' });
        }
      );
    }
  );
};
