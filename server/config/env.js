require('dotenv').config();

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required. Add it to server/.env or your deployment environment.`);
  }
  return String(value).trim();
};

module.exports = {
  JWT_SECRET: getRequiredEnv('JWT_SECRET'),
  CLIENT_URL: process.env.CLIENT_URL || ''
};
