const mysql = require('mysql2/promise');

function requiredEnv(name) {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Copie .env.example para .env e configure.`
    );
  }
  return String(v).trim();
}

/** E-mails opcionais para seed de admins. Aceita ADMIN_EMAILS (csv) e ADMIN_EMAIL (legado). */
function getInitialAdminEmails() {
  const csv = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  const legacy = String(process.env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  if (legacy) csv.push(legacy);
  return Array.from(new Set(csv));
}
const INITIAL_ADMIN_EMAILS = getInitialAdminEmails();

const pool = mysql.createPool({
  host: requiredEnv('DB_HOST'),
  port: Number(process.env.DB_PORT || 3306),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),
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
      user_id INT NULL,
      company VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company (company),
      INDEX idx_user (user_id)
    )
  `);

  await pool.query('ALTER TABLE downloads ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL');
  try {
    await pool.query('ALTER TABLE downloads MODIFY COLUMN user_id INT NULL');
  } catch (e) {
    console.warn('downloads.user_id nullable (pode ser ignorado se já atualizado):', e.message);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metric_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(255) NULL,
      company VARCHAR(255) NULL,
      event_type ENUM(
        'generate_click',
        'download_click',
        'generate_complete',
        'linkedin_share_click',
        'facebook_share_click',
        'instagram_share_click'
      ) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_type (event_type),
      INDEX idx_event_user (user_id),
      INDEX idx_event_company (company)
    )
  `);

  try {
    await pool.query(`
      ALTER TABLE metric_events
      MODIFY COLUMN event_type ENUM(
        'generate_click',
        'download_click',
        'generate_complete',
        'linkedin_share_click',
        'facebook_share_click',
        'instagram_share_click'
      ) NOT NULL
    `);
  } catch (e) {
    console.warn('metric_events ENUM (pode ser ignorado se já atualizado):', e.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS allowed_email_domains (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS magic_login_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash CHAR(64) NOT NULL,
      email VARCHAR(255) NOT NULL,
      account_type ENUM('user','collaborator') NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_magic_hash (token_hash),
      INDEX idx_magic_expires (expires_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_generation_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(255) NULL,
      company VARCHAR(255) NULL,
      event_type VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'info',
      message TEXT NULL,
      browser VARCHAR(120) NULL,
      os VARCHAR(120) NULL,
      device_type VARCHAR(40) NULL,
      user_agent TEXT NULL,
      app_version VARCHAR(40) NULL,
      preset VARCHAR(40) NULL,
      format VARCHAR(40) NULL,
      webm_size_bytes BIGINT NULL,
      mp4_size_bytes BIGINT NULL,
      duration_ms INT NULL,
      viewport_width INT NULL,
      viewport_height INT NULL,
      screen_width INT NULL,
      screen_height INT NULL,
      language VARCHAR(20) NULL,
      timezone VARCHAR(80) NULL,
      ip_address VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vgl_created_at (created_at),
      INDEX idx_vgl_email (email),
      INDEX idx_vgl_status (status),
      INDEX idx_vgl_event_type (event_type)
    )
  `);

  try {
    await pool.query(
      'ALTER TABLE video_generation_logs ADD COLUMN client_metrics_json TEXT NULL'
    );
  } catch (e) {
    console.warn(
      'video_generation_logs.client_metrics_json (ignorar se coluna já existe):',
      e.message
    );
  }

  const [[domainCount]] = await pool.query(
    'SELECT COUNT(*) AS c FROM allowed_email_domains'
  );
  if (Number(domainCount.c) === 0) {
    await pool.query(
      'INSERT INTO allowed_email_domains (domain) VALUES (?)',
      ['owly.com.br']
    );
    console.log('Domínio inicial owly.com.br adicionado (lista de domínios permitidos).');
  }

  for (const adminEmail of INITIAL_ADMIN_EMAILS) {
    const [existingAdmin] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [adminEmail]
    );

    if (!existingAdmin.length) {
      await pool.query(
        'INSERT INTO users (email, company, role, is_active) VALUES (?, ?, ?, 1)',
        [adminEmail, 'SAAB Comunicação', 'admin']
      );
      console.log(`Admin inicial criado (${adminEmail})`);
    }
  }
}

module.exports = {
  pool,
  initDatabase,
  INITIAL_ADMIN_EMAILS
};
