const nodemailer = require('nodemailer');

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      String(process.env.SMTP_HOST).trim() &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
  );
}

function asBool(v, defaultValue) {
  if (v == null || String(v).trim() === '') return defaultValue;
  return String(v).trim().toLowerCase() === 'true';
}

function getSmtpRuntimeConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = asBool(process.env.SMTP_SECURE, port === 465);
  const requireTLS = asBool(process.env.SMTP_REQUIRE_TLS, !secure && port === 587);
  const rejectUnauthorized = asBool(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true);
  const authMethod = String(process.env.SMTP_AUTH_METHOD || '')
    .trim()
    .toUpperCase();
  const debug = asBool(process.env.SMTP_DEBUG, false);
  const verifyBeforeSend = asBool(process.env.SMTP_VERIFY_BEFORE_SEND, true);
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port,
    secure,
    requireTLS,
    rejectUnauthorized,
    authMethod,
    debug,
    verifyBeforeSend
  };
}

function sanitizeError(err) {
  if (!err) return null;
  return {
    message: err.message || '',
    code: err.code || '',
    responseCode: err.responseCode || '',
    command: err.command || '',
    response: err.response || '',
    reason: err.reason || ''
  };
}

function buildDiagnosticMessage(cfg, err) {
  const e = sanitizeError(err) || {};
  const parts = [
    'Falha no envio SMTP.',
    `host=${cfg.host}`,
    `port=${cfg.port}`,
    `secure=${cfg.secure}`,
    `requireTLS=${cfg.requireTLS}`,
    `authMethod=${cfg.authMethod || 'auto'}`,
    `code=${e.code || 'n/a'}`,
    `responseCode=${e.responseCode || 'n/a'}`,
    `command=${e.command || 'n/a'}`
  ];
  if (e.response) parts.push(`response=${e.response}`);
  return parts.join(' | ');
}

function createTransport() {
  if (!smtpConfigured()) {
    return null;
  }
  const cfg = getSmtpRuntimeConfig();

  const transportConfig = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    logger: cfg.debug,
    debug: cfg.debug,
    auth: {
      user: String(process.env.SMTP_USER).trim(),
      pass: String(process.env.SMTP_PASSWORD).trim()
    },
    tls: {
      rejectUnauthorized: cfg.rejectUnauthorized
    }
  };
  if (cfg.authMethod) {
    transportConfig.authMethod = cfg.authMethod;
  }

  return {
    transporter: nodemailer.createTransport(transportConfig),
    cfg
  };
}

/**
 * @param {{ to: string, magicLinkUrl: string }} opts
 */
async function sendMagicLinkEmail(opts) {
  const { to, magicLinkUrl } = opts;
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  if (!from) {
    throw new Error('Defina SMTP_FROM ou SMTP_USER no .env.');
  }
  const transportData = createTransport();
  if (!transportData) {
    throw new Error('SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).');
  }
  const { transporter, cfg } = transportData;

  const subject = 'Seu link de acesso — Video Collab SAAB';
  const text = [
    'Olá,',
    '',
    'Use o link abaixo para entrar na experiência de personalização do vídeo (válido por 15 minutos):',
    '',
    magicLinkUrl,
    '',
    'Se você não solicitou este acesso, ignore este e-mail.',
    '',
    'SAAB Video Collab'
  ].join('\n');

  const html = `
    <p>Olá,</p>
    <p>Use o botão abaixo para entrar na experiência de personalização do vídeo. O link expira em <strong>15 minutos</strong>.</p>
    <p><a href="${magicLinkUrl}" style="display:inline-block;padding:12px 20px;background:#262957;color:#fff;text-decoration:none;border-radius:8px;">Entrar</a></p>
    <p style="word-break:break-all;font-size:12px;color:#666;">${magicLinkUrl}</p>
    <p>Se você não solicitou este acesso, ignore este e-mail.</p>
    <p>SAAB Video Collab</p>
  `;

  try {
    if (cfg.verifyBeforeSend) {
      await transporter.verify();
    }
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    throw new Error(buildDiagnosticMessage(cfg, err));
  }
}

module.exports = {
  smtpConfigured,
  sendMagicLinkEmail
};
