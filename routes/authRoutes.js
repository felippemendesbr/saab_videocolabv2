const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { sendAccessCodeEmail, smtpConfigured } = require('../lib/mailer');

const router = express.Router();

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function randomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function emailDomain(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0 || at === e.length - 1) return '';
  return e.slice(at + 1);
}

function displayNameFromEmail(email) {
  const localPart = String(email).split('@')[0] || '';
  const pieces = localPart.split(/[._-]+/).filter(Boolean);
  if (!pieces.length) return 'Colaborador';
  return pieces
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

async function establishSessionByEmail(req, normalizedEmail) {
  const [users] = await pool.query(
    'SELECT id, email, company, role, is_active FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );
  if (users.length) {
    const u = users[0];
    if (!Number(u.is_active)) {
      return { ok: false };
    }
    req.session.userId = u.id;
    req.session.userEmail = u.email;
    req.session.userCompany = u.company || 'SAAB';
    req.session.userRole = u.role || 'admin';
    req.session.accountType = 'user';
    return { ok: true, redirectTo: '/admin' };
  }

  let [collabs] = await pool.query(
    'SELECT id, email, company, is_active FROM collaborators WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (!collabs.length) {
    const dom = emailDomain(normalizedEmail);
    const name = displayNameFromEmail(normalizedEmail);
    const company = dom || 'Corporativo';
    try {
      await pool.query(
        'INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)',
        [name, normalizedEmail, company]
      );
    } catch (insErr) {
      if (!(insErr && insErr.code === 'ER_DUP_ENTRY')) {
        throw insErr;
      }
    }
    [collabs] = await pool.query(
      'SELECT id, email, company, is_active FROM collaborators WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
  }

  if (!collabs.length || !Number(collabs[0].is_active)) {
    return { ok: false };
  }

  const c = collabs[0];
  req.session.userId = c.id;
  req.session.userEmail = c.email;
  req.session.userCompany = c.company || 'Sem Empresa';
  req.session.userRole = 'collaborator';
  req.session.accountType = 'collaborator';
  return { ok: true, redirectTo: '/dashboard' };
}

// POST /login — domínio permitido → envia código de acesso
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.redirect('/?error=1');
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const domain = emailDomain(normalizedEmail);
  if (!domain) {
    return res.redirect('/?error=1');
  }

  try {
    const [drows] = await pool.query(
      'SELECT id FROM allowed_email_domains WHERE domain = ? LIMIT 1',
      [domain]
    );
    if (!drows.length) {
      return res.redirect('/?error=3');
    }

    if (!smtpConfigured()) {
      console.error('login: SMTP não configurado (SMTP_HOST / SMTP_USER / SMTP_PASSWORD).');
      return res.redirect('/?error=4');
    }

    const rawCode = randomCode();
    const tokenHash = hashToken(rawCode);
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE magic_login_tokens SET used_at = NOW() WHERE email = ? AND used_at IS NULL',
      [normalizedEmail]
    );

    await pool.query(
      'INSERT INTO magic_login_tokens (token_hash, email, account_type, expires_at) VALUES (?, ?, ?, ?)',
      [tokenHash, normalizedEmail, 'collaborator', expires]
    );

    try {
      await sendAccessCodeEmail({ to: normalizedEmail, accessCode: rawCode });
    } catch (mailErr) {
      console.error('Erro ao enviar e-mail de login:', mailErr);
      return res.redirect('/?error=4');
    }

    return res.redirect(`/?sent=1&email=${encodeURIComponent(normalizedEmail)}`);
  } catch (error) {
    console.error('Erro no login:', error);
    return res.redirect('/?error=1');
  }
});

// POST /login/verify-code — valida token por e-mail (15 minutos)
router.post('/login/verify-code', async (req, res) => {
  const email = String((req.body && req.body.email) || '')
    .trim()
    .toLowerCase();
  const accessCode = String((req.body && req.body.accessCode) || '').trim();
  if (!email || !accessCode) {
    return res.redirect('/?error=1');
  }
  const tokenHash = hashToken(accessCode);

  try {
    const [rows] = await pool.query(
      `SELECT id, email, expires_at, used_at
       FROM magic_login_tokens
       WHERE email = ? AND token_hash = ?
       ORDER BY id DESC
       LIMIT 1`,
      [email, tokenHash]
    );

    if (!rows.length) {
      return res.redirect(`/?sent=1&email=${encodeURIComponent(email)}&error=7`);
    }
    const tok = rows[0];
    if (tok.used_at) {
      return res.redirect(`/?sent=1&email=${encodeURIComponent(email)}&error=7`);
    }
    const exp = new Date(tok.expires_at);
    if (exp.getTime() < Date.now()) {
      return res.redirect(`/?sent=1&email=${encodeURIComponent(email)}&error=7`);
    }

    await pool.query('UPDATE magic_login_tokens SET used_at = NOW() WHERE id = ?', [tok.id]);
    const sessionResult = await establishSessionByEmail(req, email);
    if (!sessionResult.ok) {
      return res.redirect('/?error=1');
    }
    return res.redirect(sessionResult.redirectTo);
  } catch (error) {
    console.error('Erro na validação do código:', error);
    return res.redirect('/?error=1');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
