function validateEnv() {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error('Missing required environment variables: ' + missing.join(', '));
  }

  if (!process.env.MONGO_URI) {
    console.warn('Warning: MONGO_URI is not set. Tests may set this at runtime (mongodb-memory-server).');
  }
}

module.exports = validateEnv;
