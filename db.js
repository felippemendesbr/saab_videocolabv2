const mysql = require('mysql2/promise');

const ADMIN_EMAIL = 'comunicacao.saab@owly.com.br';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '147.79.91.110',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'u829391742_saabcolabuser',
  password: process.env.DB_PASSWORD || 'eUC|8wC4Q:',
  database: process.env.DB_NAME || 'u829391742_saabcolab',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      company VARCHAR(255) NOT NULL,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Compatibilidade com versões antigas do schema
  await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS password_hash');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaborators (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      company VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1'
  );
  await pool.query(
    'ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1'
  );
  await pool.query(
    'ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT ""'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      company VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company (company),
      INDEX idx_user (user_id)
    )
  `);

  await pool.query('ALTER TABLE downloads ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metric_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(255) NULL,
      company VARCHAR(255) NULL,
      event_type ENUM('generate_click','download_click') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_type (event_type),
      INDEX idx_event_user (user_id),
      INDEX idx_event_company (company)
    )
  `);

  const [existingAdmin] = await pool.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [ADMIN_EMAIL]
  );

  if (!existingAdmin.length) {
    await pool.query(
      'INSERT INTO users (email, company, role, is_active) VALUES (?, ?, ?, 1)',
      [ADMIN_EMAIL, 'SAAB Comunicação', 'admin']
    );
    console.log(`Admin inicial criado (${ADMIN_EMAIL})`);
  }
}

module.exports = {
  pool,
  initDatabase,
  ADMIN_EMAIL
};

