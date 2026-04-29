require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const XLSX = require('xlsx');

const authRoutes = require('./routes/authRoutes');
const { pool, initDatabase } = require('./db');
const { convertWebmToMp4Buffer } = require('./lib/convertio');
const { sendOperationalAlertEmail, smtpConfigured } = require('./lib/mailer');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

function getDomainsAdminEmails() {
  const csv = String(process.env.DOMAINS_ADMIN_EMAILS || '')
    .split(',')
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  const legacy = String(process.env.DOMAINS_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  if (legacy) csv.push(legacy);
  if (!csv.length) {
    csv.push('comunicacao.saab@owly.com.br');
  }
  return new Set(csv);
}
const DOMAINS_ADMIN_EMAILS = getDomainsAdminEmails();

const uploadsDir = path.join(os.tmpdir(), 'saab-videocolab-uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 120 * 1024 * 1024 }
});

const sessionSecret =
  process.env.SESSION_SECRET || 'dev-only-session-secret-altere-em-producao';

// Configuração de sessão
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 // 1 hora
    }
  })
);

// Body parsers
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

let dbInitPromise = null;
function initDatabaseOnce() {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((error) => {
      dbInitPromise = null;
      throw error;
    });
  }
  return dbInitPromise;
}

// Em serverless, inicializamos o DB de forma lazy por requisição.
app.use(async (req, res, next) => {
  const needsDb =
    req.path.startsWith('/api') ||
    req.path === '/login' ||
    req.path.startsWith('/auth/');
  if (!needsDb) {
    return next();
  }
  try {
    await initDatabaseOnce();
    return next();
  } catch (error) {
    console.error('Falha ao inicializar banco (request):', error);
    return res.status(500).json({ error: 'Falha ao inicializar banco.' });
  }
});

// Static
app.use(express.static(path.join(__dirname, 'public')));

// Rotas de autenticação (login/logout)
app.use('/', authRoutes);

// Middleware para proteger /dashboard
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userEmail) {
    return next();
  }
  return res.redirect('/');
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.accountType === 'user') {
    return next();
  }
  return res.redirect('/dashboard');
}

function ensureCollaborator(req, res, next) {
  if (req.session && req.session.accountType === 'collaborator') {
    return next();
  }
  return res.redirect('/admin');
}

function ensureDomainsAdmin(req, res, next) {
  const em = String(req.session.userEmail || '')
    .trim()
    .toLowerCase();
  if (DOMAINS_ADMIN_EMAILS.has(em)) {
    return next();
  }
  return res.status(403).json({ error: 'Acesso restrito a esta área.' });
}

function normalizeDomainValue(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (s.startsWith('@')) {
    s = s.slice(1);
  }
  return s;
}

function getDownloadOwnerUserId(req) {
  if (req.session && req.session.accountType === 'user') {
    return req.session.userId || null;
  }
  return null;
}

function normalizeLogString(value, maxLen) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeLogInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function getVideoErrorAlertRecipient() {
  return String(process.env.VIDEO_ERROR_ALERT_EMAIL || 'suporte@noahsolutions.com.br')
    .trim()
    .toLowerCase();
}

function formatAlertLine(label, value) {
  const v =
    value == null || value === '' || Number.isNaN(value)
      ? '-'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return `${label}: ${v}`;
}

async function notifyVideoErrorByEmail(payload) {
  const recipient = getVideoErrorAlertRecipient();
  if (!recipient || !smtpConfigured()) return;
  const nowIso = new Date().toISOString();
  const subject = `🚨 [ALERTA CRÍTICO] ${payload.eventType} no Video Collab (${payload.email || 'sem-email'})`;
  const lines = [
    'ALERTA AUTOMÁTICO DE ERRO DE GERAÇÃO/CONVERSÃO',
    '',
    formatAlertLine('Horário (UTC)', nowIso),
    formatAlertLine('Evento', payload.eventType),
    formatAlertLine('Status', payload.status),
    formatAlertLine('Mensagem', payload.message),
    '',
    formatAlertLine('E-mail usuário', payload.email),
    formatAlertLine('Empresa', payload.company),
    formatAlertLine('User ID', payload.userId),
    formatAlertLine('Sessão accountType', payload.accountType),
    formatAlertLine('Sessão userRole', payload.userRole),
    '',
    formatAlertLine('Browser', payload.browser),
    formatAlertLine('OS', payload.os),
    formatAlertLine('Device type', payload.deviceType),
    formatAlertLine('Preset', payload.preset),
    formatAlertLine('Format', payload.format),
    formatAlertLine('Duração (ms)', payload.durationMs),
    formatAlertLine('WEBM size (bytes)', payload.webmSizeBytes),
    formatAlertLine('MP4 size (bytes)', payload.mp4SizeBytes),
    formatAlertLine('Viewport', `${payload.viewportWidth || '-'}x${payload.viewportHeight || '-'}`),
    formatAlertLine('Screen', `${payload.screenWidth || '-'}x${payload.screenHeight || '-'}`),
    formatAlertLine('Idioma', payload.language),
    formatAlertLine('Timezone', payload.timezone),
    '',
    formatAlertLine('IP', payload.ipAddress),
    formatAlertLine('Forwarded For', payload.forwardedFor),
    formatAlertLine('User-Agent', payload.userAgent),
    '',
    'Payload bruto do evento:',
    payload.rawBody ? JSON.stringify(payload.rawBody, null, 2) : '-'
  ];
  await sendOperationalAlertEmail({
    to: recipient,
    subject,
    text: lines.join('\n')
  });
}

async function emailTakenByUser(email, excludeUserId) {
  const params = excludeUserId != null ? [email, excludeUserId] : [email];
  const sql =
    excludeUserId != null
      ? 'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1'
      : 'SELECT id FROM users WHERE email = ? LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows.length > 0;
}

async function emailTakenByCollaborator(email) {
  const [rows] = await pool.query(
    'SELECT id FROM collaborators WHERE email = ? LIMIT 1',
    [email]
  );
  return rows.length > 0;
}

// Rota da dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  if (req.session.accountType === 'user') {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/admin', ensureAuthenticated, ensureAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Endpoint para obter dados do usuário logado (usado pelo frontend)
app.get('/api/me', ensureAuthenticated, (req, res) => {
  const email = String(req.session.userEmail || '')
    .trim()
    .toLowerCase();
  res.json({
    id: req.session.userId || null,
    email: req.session.userEmail || null,
    company: req.session.userCompany || null,
    role: req.session.userRole || 'user',
    accountType: req.session.accountType || 'collaborator',
    canManageDomains: DOMAINS_ADMIN_EMAILS.has(email)
  });
});

// Conversão WebM → MP4 via Convert.io
app.post(
  '/api/convert-to-mp4',
  ensureAuthenticated,
  ensureCollaborator,
  upload.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo de vídeo não enviado.' });
    }
    const inputPath = req.file.path;
    try {
      const webmBuffer = await fs.promises.readFile(inputPath);
      await fs.promises.unlink(inputPath).catch(() => {});

      const apiKey = process.env.CONVERTIO_API_KEY || '';
      const mp4Buffer = await convertWebmToMp4Buffer(webmBuffer, apiKey);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="video-somospartedogripen.mp4"'
      );

      pool
        .query('INSERT INTO downloads (user_id, company, email) VALUES (?, ?, ?)', [
          getDownloadOwnerUserId(req),
          req.session.userCompany || 'Sem Empresa',
          req.session.userEmail || null
        ])
        .catch((dbErr) => {
          console.error('Erro ao registrar download:', dbErr);
        });

      res.send(mp4Buffer);
    } catch (error) {
      await fs.promises.unlink(inputPath).catch(() => {});
      console.error('Erro na conversão Convert.io:', error);
      const msg =
        error && error.message
          ? error.message
          : 'Erro ao converter vídeo para MP4.';
      res.status(500).json({ error: msg });
    }
  }
);

app.get(
  '/api/admin/domains',
  ensureAuthenticated,
  ensureAdmin,
  ensureDomainsAdmin,
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, domain, created_at FROM allowed_email_domains ORDER BY domain ASC'
      );
      res.json({ domains: rows });
    } catch (error) {
      console.error('Erro ao listar domínios:', error);
      res.status(500).json({ error: 'Falha ao listar domínios.' });
    }
  }
);

app.post(
  '/api/admin/domains',
  ensureAuthenticated,
  ensureAdmin,
  ensureDomainsAdmin,
  async (req, res) => {
    const domain = normalizeDomainValue(req.body && req.body.domain);
    if (!domain || domain.length < 3 || !domain.includes('.')) {
      return res.status(400).json({ error: 'Domínio inválido (ex.: empresa.com.br).' });
    }
    try {
      await pool.query('INSERT INTO allowed_email_domains (domain) VALUES (?)', [domain]);
      res.json({ ok: true });
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este domínio já está cadastrado.' });
      }
      console.error('Erro ao criar domínio:', error);
      res.status(500).json({ error: 'Falha ao salvar domínio.' });
    }
  }
);

app.put(
  '/api/admin/domains/:id',
  ensureAuthenticated,
  ensureAdmin,
  ensureDomainsAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    const domain = normalizeDomainValue(req.body && req.body.domain);
    if (!id || !domain || domain.length < 3 || !domain.includes('.')) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    try {
      await pool.query('UPDATE allowed_email_domains SET domain = ? WHERE id = ?', [
        domain,
        id
      ]);
      res.json({ ok: true });
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este domínio já está cadastrado.' });
      }
      console.error('Erro ao atualizar domínio:', error);
      res.status(500).json({ error: 'Falha ao atualizar domínio.' });
    }
  }
);

app.delete(
  '/api/admin/domains/:id',
  ensureAuthenticated,
  ensureAdmin,
  ensureDomainsAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    try {
      await pool.query('DELETE FROM allowed_email_domains WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (error) {
      console.error('Erro ao remover domínio:', error);
      res.status(500).json({ error: 'Falha ao remover domínio.' });
    }
  }
);

function insertMetricEvent(req, eventType) {
  return pool.query(
    'INSERT INTO metric_events (user_id, email, company, event_type) VALUES (?, ?, ?, ?)',
    [
      req.session.userId || null,
      req.session.userEmail || null,
      req.session.userCompany || 'Sem Empresa',
      eventType
    ]
  );
}

app.post('/api/metrics/generate-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await insertMetricEvent(req, 'generate_click');
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar evento generate_click:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique em gerar vídeo:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/metrics/generate-complete', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await insertMetricEvent(req, 'generate_complete');
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar evento generate_complete:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar conclusão da geração:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/metrics/linkedin-share-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await insertMetricEvent(req, 'linkedin_share_click');
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar linkedin_share_click:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique LinkedIn:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/metrics/facebook-share-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await insertMetricEvent(req, 'facebook_share_click');
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar facebook_share_click:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique Facebook:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/metrics/instagram-share-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await insertMetricEvent(req, 'instagram_share_click');
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar instagram_share_click:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique Instagram:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/logs/video-generation', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const eventType = normalizeLogString(body.eventType || body.event_type || 'unknown', 64);
    const status = normalizeLogString(body.status || 'info', 24) || 'info';
    const message = normalizeLogString(body.message, 4000);
    const browser = normalizeLogString(body.browser, 120);
    const osName = normalizeLogString(body.os, 120);
    const deviceType = normalizeLogString(body.deviceType || body.device_type, 40);
    const userAgent = normalizeLogString(body.userAgent || req.headers['user-agent'] || '', 4000);
    const appVersion = normalizeLogString(body.appVersion, 40);
    const preset = normalizeLogString(body.preset, 40);
    const format = normalizeLogString(body.format, 40);
    const webmSizeBytes = normalizeLogInt(body.webmSizeBytes);
    const mp4SizeBytes = normalizeLogInt(body.mp4SizeBytes);
    const durationMs = normalizeLogInt(body.durationMs);
    const viewportWidth = normalizeLogInt(body.viewportWidth);
    const viewportHeight = normalizeLogInt(body.viewportHeight);
    const screenWidth = normalizeLogInt(body.screenWidth);
    const screenHeight = normalizeLogInt(body.screenHeight);
    const language = normalizeLogString(body.language, 20);
    const timezone = normalizeLogString(body.timezone, 80);
    const ipAddress = normalizeLogString(req.ip || '', 80);
    const forwardedFor = normalizeLogString(req.headers['x-forwarded-for'] || '', 512);

    await pool.query(
      `INSERT INTO video_generation_logs (
        user_id, email, company, event_type, status, message, browser, os, device_type,
        user_agent, app_version, preset, format, webm_size_bytes, mp4_size_bytes, duration_ms,
        viewport_width, viewport_height, screen_width, screen_height, language, timezone, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId || null,
        req.session.userEmail || null,
        req.session.userCompany || 'Sem Empresa',
        eventType || 'unknown',
        status,
        message,
        browser,
        osName,
        deviceType,
        userAgent,
        appVersion,
        preset,
        format,
        webmSizeBytes,
        mp4SizeBytes,
        durationMs,
        viewportWidth,
        viewportHeight,
        screenWidth,
        screenHeight,
        language,
        timezone,
        ipAddress
      ]
    );

    if (eventType === 'generate_error' || eventType === 'convert_error') {
      try {
        await notifyVideoErrorByEmail({
          eventType,
          status,
          message,
          userId: req.session.userId || null,
          email: req.session.userEmail || null,
          company: req.session.userCompany || 'Sem Empresa',
          accountType: req.session.accountType || null,
          userRole: req.session.userRole || null,
          browser,
          os: osName,
          deviceType,
          preset,
          format,
          durationMs,
          webmSizeBytes,
          mp4SizeBytes,
          viewportWidth,
          viewportHeight,
          screenWidth,
          screenHeight,
          language,
          timezone,
          ipAddress,
          forwardedFor,
          userAgent,
          rawBody: body
        });
      } catch (mailErr) {
        console.error('Aviso: falha ao enviar alerta de erro de vídeo por e-mail:', mailErr);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar log de geração de vídeo:', error);
    res.status(500).json({ error: 'Falha ao registrar log de geração.' });
  }
});

app.get('/api/admin/video-generation-logs', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const eventType = String(req.query.eventType || '').trim().toLowerCase();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const limitRaw = Number(req.query.limit || 200);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

    const where = [];
    const params = [];

    if (email) {
      where.push('email = ?');
      params.push(email);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (eventType) {
      where.push('event_type = ?');
      params.push(eventType);
    }
    if (from) {
      where.push('created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('created_at <= ?');
      params.push(`${to} 23:59:59`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT
        id, user_id, email, company, event_type, status, message, browser, os, device_type,
        app_version, preset, format, webm_size_bytes, mp4_size_bytes, duration_ms, viewport_width,
        viewport_height, screen_width, screen_height, language, timezone, ip_address, created_at
       FROM video_generation_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json({ logs: rows });
  } catch (error) {
    console.error('Erro ao listar logs de geração de vídeo:', error);
    res.status(500).json({ error: 'Falha ao listar logs de geração.' });
  }
});

/**
 * Regista intenção de download (sempre em metric_events).
 * Linha em `downloads`: só para WEBM (ficheiro servido só no cliente). Em MP4 o registo
 * fica em /api/convert-to-mp4 quando a conversão conclui — evita contagem duplicada.
 * `deliveryOnly`: só insere em `downloads` (ex.: fallback WEBM após falha do MP4, sem novo download_click).
 */
app.post('/api/metrics/download-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    const userId = req.session.userId || null;
    const downloadOwnerUserId = getDownloadOwnerUserId(req);
    const email = req.session.userEmail || null;
    const company = req.session.userCompany || 'Sem Empresa';
    if (req.body && req.body.deliveryOnly === true) {
      await pool.query('INSERT INTO downloads (user_id, company, email) VALUES (?, ?, ?)', [
        downloadOwnerUserId,
        company,
        email
      ]);
      return res.json({ ok: true });
    }
    const format = req.body && req.body.format === 'mp4' ? 'mp4' : 'webm';
    try {
      await pool.query(
        'INSERT INTO metric_events (user_id, email, company, event_type) VALUES (?, ?, ?, ?)',
        [userId, email, company, 'download_click']
      );
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar evento download_click:', metricErr);
    }
    if (format !== 'mp4') {
      await pool.query('INSERT INTO downloads (user_id, company, email) VALUES (?, ?, ?)', [
        downloadOwnerUserId,
        company,
        email
      ]);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique em baixar vídeo:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.get('/api/admin/metrics', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const [[collaboratorsCount]] = await pool.query('SELECT COUNT(*) AS total FROM collaborators');
    const [[downloadsCount]] = await pool.query('SELECT COUNT(*) AS total FROM downloads');
    const [[usersCount]] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const [[collaboratorsWithDownloads]] = await pool.query(
      `SELECT COUNT(DISTINCT c.id) AS total
       FROM collaborators c
       INNER JOIN downloads d ON d.email = c.email`
    );
    const [[videoReadyCollaborators]] = await pool.query(
      `SELECT COUNT(DISTINCT email) AS total
       FROM metric_events
       WHERE event_type = 'generate_complete'
         AND email IS NOT NULL
         AND email <> ''`
    );
    const [[generatedWithoutDownloadByCollaborator]] = await pool.query(
      `SELECT COUNT(DISTINCT g.email) AS total
       FROM metric_events g
       WHERE g.event_type = 'generate_complete'
         AND g.email IS NOT NULL
         AND g.email <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM metric_events d
           WHERE d.event_type = 'download_click'
             AND d.email = g.email
         )
         AND NOT EXISTS (
           SELECT 1
           FROM downloads dw
           WHERE dw.email = g.email
         )`
    );
    const [[linkedinShareTotal]] = await pool.query(
      `SELECT COUNT(*) AS total FROM metric_events WHERE event_type = 'linkedin_share_click'`
    );
    const [[linkedinShareDistinct]] = await pool.query(
      `SELECT COUNT(DISTINCT email) AS total
       FROM metric_events
       WHERE event_type = 'linkedin_share_click'
         AND email IS NOT NULL
         AND email <> ''`
    );
    const [[facebookShareTotal]] = await pool.query(
      `SELECT COUNT(*) AS total FROM metric_events WHERE event_type = 'facebook_share_click'`
    );
    const [[facebookShareDistinct]] = await pool.query(
      `SELECT COUNT(DISTINCT email) AS total
       FROM metric_events
       WHERE event_type = 'facebook_share_click'
         AND email IS NOT NULL
         AND email <> ''`
    );
    const [[instagramShareTotal]] = await pool.query(
      `SELECT COUNT(*) AS total FROM metric_events WHERE event_type = 'instagram_share_click'`
    );
    const [[instagramShareDistinct]] = await pool.query(
      `SELECT COUNT(DISTINCT email) AS total
       FROM metric_events
       WHERE event_type = 'instagram_share_click'
         AND email IS NOT NULL
         AND email <> ''`
    );
    const [byCompany] = await pool.query(
      'SELECT company, COUNT(*) AS total FROM downloads GROUP BY company ORDER BY total DESC'
    );
    const [collaboratorsByCompany] = await pool.query(
      'SELECT company, COUNT(*) AS total FROM collaborators GROUP BY company ORDER BY total DESC'
    );
    const [downloadsByDayRaw] = await pool.query(
      `SELECT DATE_FORMAT(downloaded_at, '%Y-%m-%d') AS day, COUNT(*) AS total
       FROM downloads
       WHERE downloaded_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
       GROUP BY DATE_FORMAT(downloaded_at, '%Y-%m-%d')
       ORDER BY day ASC`
    );
    const [recentDownloadsRaw] = await pool.query(
      `SELECT
         d.company,
         d.email,
         d.downloaded_at,
         COALESCE(c.name, d.email, 'Sem nome') AS collaborator_name
       FROM downloads d
       LEFT JOIN collaborators c ON c.email = d.email
       ORDER BY d.downloaded_at DESC
       LIMIT 10`
    );
    const [users] = await pool.query(
      'SELECT id, email, company, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 500'
    );
    const [collaborators] = await pool.query(
      'SELECT id, name, email, company, is_active, created_at FROM collaborators ORDER BY created_at DESC LIMIT 500'
    );
    const totalUsers = Number(usersCount.total || 0);
    const totalCollaborators = Number(collaboratorsCount.total || 0);
    const collaboratorsWithDownloadCount = Number(collaboratorsWithDownloads.total || 0);
    const collaboratorsWithoutDownloadCount = Math.max(
      0,
      totalCollaborators - collaboratorsWithDownloadCount
    );

    const byDownloadStatus = [
      { label: 'Com download', total: collaboratorsWithDownloadCount },
      { label: 'Sem download', total: collaboratorsWithoutDownloadCount }
    ];
    const videoReadyCollaboratorsCount = Number(videoReadyCollaborators.total || 0);
    const generatedNoDownloadCount = Number(
      generatedWithoutDownloadByCollaborator.total || 0
    );
    const generatedNoDownloadPercent =
      videoReadyCollaboratorsCount > 0
        ? Number(
            ((generatedNoDownloadCount / videoReadyCollaboratorsCount) * 100).toFixed(1)
          )
        : 0;

    const dayMap = new Map(
      downloadsByDayRaw.map((row) => [String(row.day || ''), Number(row.total || 0)])
    );
    const downloadsByDay = [];
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      downloadsByDay.push({
        date: key,
        total: dayMap.get(key) || 0
      });
    }

    const recentDownloadsByCompany = recentDownloadsRaw.map((row) => ({
      company: String(row.company || 'Sem Empresa'),
      collaboratorName: row.collaborator_name || 'Sem nome',
      email: row.email || '-',
      downloadedAt: row.downloaded_at
    }));

    res.json({
      usersCount: totalUsers,
      collaboratorsCount: totalCollaborators,
      downloadsCount: downloadsCount.total || 0,
      byCompany,
      collaboratorsByCompany,
      byDownloadStatus,
      downloadsByDay,
      recentDownloadsByCompany,
      generatedNoDownloadCount,
      generatedNoDownloadPercent,
      videoReadyCollaboratorsCount,
      linkedinShareClicksTotal: Number(linkedinShareTotal.total || 0),
      linkedinShareCollaboratorsDistinct: Number(linkedinShareDistinct.total || 0),
      facebookShareClicksTotal: Number(facebookShareTotal.total || 0),
      facebookShareCollaboratorsDistinct: Number(facebookShareDistinct.total || 0),
      instagramShareClicksTotal: Number(instagramShareTotal.total || 0),
      instagramShareCollaboratorsDistinct: Number(instagramShareDistinct.total || 0),
      shareClicksByNetwork: [
        {
          key: 'linkedin',
          label: 'LinkedIn',
          clicks: Number(linkedinShareTotal.total || 0),
          collaboratorsDistinct: Number(linkedinShareDistinct.total || 0),
          color: '#0a66c2'
        },
        {
          key: 'facebook',
          label: 'Facebook',
          clicks: Number(facebookShareTotal.total || 0),
          collaboratorsDistinct: Number(facebookShareDistinct.total || 0),
          color: '#1877f2'
        },
        {
          key: 'instagram',
          label: 'Instagram',
          clicks: Number(instagramShareTotal.total || 0),
          collaboratorsDistinct: Number(instagramShareDistinct.total || 0),
          color: '#bc1888'
        }
      ],
      users,
      collaborators
    });
  } catch (error) {
    console.error('Erro ao carregar métricas:', error);
    res.status(500).json({ error: 'Falha ao carregar métricas.' });
  }
});

app.post('/api/admin/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { email, company, role } = req.body;

  if (!email || !company) {
    return res
      .status(400)
      .json({ error: 'Email e empresa são obrigatórios.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedCompany = String(company).trim();
  const normalizedRole = role === 'admin' ? 'admin' : 'user';

  try {
    if (await emailTakenByUser(normalizedEmail)) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    await pool.query(
      'INSERT INTO users (email, company, role, is_active) VALUES (?, ?, ?, 1)',
      [normalizedEmail, normalizedCompany, normalizedRole]
    );
    res.json({ ok: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    console.error('Erro ao cadastrar usuário:', error);
    res.status(500).json({ error: 'Falha ao cadastrar usuário.' });
  }
});

app.put('/api/admin/users/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { email, company, role } = req.body;
  if (!userId || !email || !company) {
    return res.status(400).json({ error: 'Dados inválidos para atualização.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    if (await emailTakenByUser(normalizedEmail, userId)) {
      return res.status(409).json({ error: 'E-mail já cadastrado para outro usuário.' });
    }
    await pool.query('UPDATE users SET email = ?, company = ?, role = ? WHERE id = ?', [
      normalizedEmail,
      String(company).trim(),
      role === 'admin' ? 'admin' : 'user',
      userId
    ]);
    res.json({ ok: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'E-mail já cadastrado para outro usuário.' });
    }
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Falha ao atualizar usuário.' });
  }
});

app.patch('/api/admin/users/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { isActive } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'ID inválido.' });
  }
  try {
    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [
      Number(isActive) ? 1 : 0,
      userId
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao atualizar status do usuário:', error);
    res.status(500).json({ error: 'Falha ao atualizar status do usuário.' });
  }
});

app.post(
  '/api/admin/collaborators/import',
  ensureAuthenticated,
  ensureAdmin,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado.' });
    }

    let inserted = 0;
    let skipped = 0;
    const filePath = req.file.path;

    try {
      const wb = XLSX.readFile(filePath);
      const firstSheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], {
        defval: ''
      });

      const [userEmailsRows] = await pool.query('SELECT email FROM users');
      const userEmailSet = new Set(
        userEmailsRows.map((r) => String(r.email || '').trim().toLowerCase())
      );
      const [collabEmailsRows] = await pool.query('SELECT email FROM collaborators');
      const collabEmailSet = new Set(
        collabEmailsRows.map((r) => String(r.email || '').trim().toLowerCase())
      );
      const seenInSpreadsheet = new Set();

      for (const rawRow of rows) {
        const name = String(rawRow.name || rawRow.Name || rawRow.nome || rawRow.Nome || '').trim();
        const email = String(rawRow.email || rawRow.Email || '').trim().toLowerCase();
        const company = String(rawRow.company || rawRow.Company || '').trim();

        if (!name || !email || !company) {
          skipped += 1;
          continue;
        }

        if (seenInSpreadsheet.has(email)) {
          skipped += 1;
          continue;
        }
        if (userEmailSet.has(email) || collabEmailSet.has(email)) {
          skipped += 1;
          continue;
        }

        try {
          await pool.query(
            'INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)',
            [name, email, company]
          );
          inserted += 1;
          seenInSpreadsheet.add(email);
          collabEmailSet.add(email);
        } catch (error) {
          skipped += 1;
        }
      }

      res.json({ ok: true, inserted, skipped });
    } catch (error) {
      console.error('Erro na importação:', error);
      res.status(500).json({ error: 'Falha ao importar planilha.' });
    } finally {
      fs.unlink(filePath, () => {});
    }
  }
);

app.post('/api/admin/collaborators', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { name, email, company } = req.body;
  if (!name || !email || !company) {
    return res.status(400).json({ error: 'Nome, email e empresa são obrigatórios.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    if (await emailTakenByUser(normalizedEmail)) {
      return res.status(409).json({
        error:
          'Este e-mail já está cadastrado como usuário. Utilize outro e-mail ou altere o cadastro de usuários.'
      });
    }
    if (await emailTakenByCollaborator(normalizedEmail)) {
      return res.status(409).json({ error: 'E-mail já cadastrado como colaborador.' });
    }
    await pool.query('INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)', [
      String(name).trim(),
      normalizedEmail,
      String(company).trim()
    ]);
    res.json({ ok: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'E-mail já cadastrado como colaborador.' });
    }
    console.error('Erro ao cadastrar colaborador:', error);
    res.status(500).json({ error: 'Falha ao cadastrar colaborador.' });
  }
});

app.patch(
  '/api/admin/collaborators/:id/status',
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    const collaboratorId = Number(req.params.id);
    const { isActive } = req.body;
    if (!collaboratorId) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    try {
      await pool.query('UPDATE collaborators SET is_active = ? WHERE id = ?', [
        Number(isActive) ? 1 : 0,
        collaboratorId
      ]);
      res.json({ ok: true });
    } catch (error) {
      console.error('Erro ao atualizar status do colaborador:', error);
      res.status(500).json({ error: 'Falha ao atualizar status do colaborador.' });
    }
  }
);

app.post(
  '/api/admin/collaborators/import-preview',
  ensureAuthenticated,
  ensureAdmin,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado.' });
    }
    const filePath = req.file.path;
    try {
      const wb = XLSX.readFile(filePath);
      const firstSheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], {
        defval: ''
      });
      const previewRows = rows.slice(0, 30).map((rawRow) => ({
        name: String(rawRow.name || rawRow.Name || rawRow.nome || rawRow.Nome || '').trim(),
        email: String(rawRow.email || rawRow.Email || '').trim().toLowerCase(),
        company: String(rawRow.company || rawRow.Company || '').trim()
      }));

      const [userEmailsRows] = await pool.query('SELECT email FROM users');
      const userEmailSet = new Set(
        userEmailsRows.map((r) => String(r.email || '').trim().toLowerCase())
      );
      const [collabEmailsRows] = await pool.query('SELECT email FROM collaborators');
      const collabEmailSet = new Set(
        collabEmailsRows.map((r) => String(r.email || '').trim().toLowerCase())
      );
      const seenInSpreadsheet = new Set();
      const simulatedCollabSet = new Set(collabEmailSet);

      let validCount = 0;
      let importableRows = 0;
      let skippedDuplicateRows = 0;

      for (const rawRow of rows) {
        const name = String(rawRow.name || rawRow.Name || rawRow.nome || rawRow.Nome || '').trim();
        const em = String(rawRow.email || rawRow.Email || '').trim().toLowerCase();
        const company = String(rawRow.company || rawRow.Company || '').trim();
        if (!name || !em || !company) continue;
        validCount += 1;
        if (seenInSpreadsheet.has(em)) {
          skippedDuplicateRows += 1;
          continue;
        }
        if (userEmailSet.has(em) || simulatedCollabSet.has(em)) {
          skippedDuplicateRows += 1;
          continue;
        }
        seenInSpreadsheet.add(em);
        simulatedCollabSet.add(em);
        importableRows += 1;
      }

      res.json({
        totalRows: rows.length,
        validRows: validCount,
        importableRows,
        skippedDuplicateRows,
        previewRows
      });
    } catch (error) {
      console.error('Erro no preview da planilha:', error);
      res.status(500).json({ error: 'Falha ao gerar preview da planilha.' });
    } finally {
      fs.unlink(filePath, () => {});
    }
  }
);

// Rota padrão para tela de login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

if (!process.env.VERCEL) {
  (async () => {
    try {
      await initDatabaseOnce();
      app.listen(PORT, () => {
        console.log(`SAAB VideoColab rodando em http://localhost:${PORT}`);
      });
    } catch (error) {
      console.error('Falha ao inicializar banco:', error);
      process.exit(1);
    }
  })();
}

module.exports = app;

