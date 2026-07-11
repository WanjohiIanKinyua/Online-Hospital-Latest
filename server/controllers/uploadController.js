const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const MAX_IMAGE_DATA_LENGTH = 6 * 1024 * 1024;
const IMAGE_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;

exports.createUpload = (req, res) => {
  const { title, note, fileName, mimeType, imageData } = req.body;
  const patientId = req.user.id;

  if (!imageData || typeof imageData !== 'string') {
    return res.status(400).json({ error: 'Image is required' });
  }

  if (!IMAGE_DATA_URL_REGEX.test(imageData)) {
    return res.status(400).json({ error: 'Only PNG, JPG, JPEG, or WEBP images are allowed' });
  }

  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return res.status(400).json({ error: 'Image is too large. Please upload a smaller or clearer cropped photo.' });
  }

  const uploadId = uuidv4();
  db.run(
    `
      INSERT INTO test_uploads (id, patientId, title, note, fileName, mimeType, imageData)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      uploadId,
      patientId,
      String(title || '').trim() || 'Test result upload',
      String(note || '').trim(),
      String(fileName || '').trim(),
      String(mimeType || '').trim(),
      imageData
    ],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save upload' });
      }

      return res.status(201).json({
        message: 'Image uploaded successfully',
        uploadId
      });
    }
  );
};

exports.getMyUploads = (req, res) => {
  db.all(
    `
      SELECT id, patientId, title, note, fileName, mimeType, imageData, createdAt
      FROM test_uploads
      WHERE patientId = ?
      ORDER BY createdAt DESC
    `,
    [req.user.id],
    (err, uploads) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch uploads' });
      }

      return res.status(200).json(uploads || []);
    }
  );
};

exports.getAllUploads = (req, res) => {
  db.all(
    `
      SELECT
        tu.id,
        tu.patientId,
        tu.title,
        tu.note,
        tu.fileName,
        tu.mimeType,
        tu.imageData,
        tu.createdAt,
        u.fullName as patientName,
        u.email as patientEmail
      FROM test_uploads tu
      JOIN users u ON tu.patientId = u.id
      ORDER BY tu.createdAt DESC
    `,
    (err, uploads) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch uploads' });
      }

      return res.status(200).json(uploads || []);
    }
  );
};
