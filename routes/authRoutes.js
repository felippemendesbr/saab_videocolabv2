const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { sendMagicLinkEmail, smtpConfigured } = require('../lib/mailer');

const router = express.Router();

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
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

function publicBaseUrl(req) {
  const env = process.env.PUBLIC_BASE_URL;
  if (env && String(env).trim()) {
    return String(env).trim().replace(/\/$/, '');
  }
  const host = req.get('host') || 'localhost:3001';
  const proto = req.protocol === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

// POST /login — domínio permitido → envia link mágico (não exige cadastro prévio)
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

    let accountType = 'collaborator';
    const [adminUsers] = await pool.query(
      'SELECT id, is_active FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    if (adminUsers.length && Number(adminUsers[0].is_active)) {
      accountType = 'user';
    }

    if (!smtpConfigured()) {
      console.error('login: SMTP não configurado (SMTP_HOST / SMTP_USER / SMTP_PASSWORD).');
      return res.redirect('/?error=4');
    }

    const rawToken = randomToken();
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO magic_login_tokens (token_hash, email, account_type, expires_at) VALUES (?, ?, ?, ?)',
      [tokenHash, normalizedEmail, accountType, expires]
    );

    const base = publicBaseUrl(req);
    const magicLinkUrl = `${base}/auth/magic?token=${encodeURIComponent(rawToken)}`;

    try {
      await sendMagicLinkEmail({ to: normalizedEmail, magicLinkUrl });
    } catch (mailErr) {
      console.error('Erro ao enviar e-mail de login:', mailErr);
      return res.redirect('/?error=4');
    }

    return res.redirect('/?sent=1');
  } catch (error) {
    console.error('Erro no login:', error);
    return res.redirect('/?error=1');
  }
});

// GET /auth/magic — prioriza utilizador admin; senão colaborador (cria registo se necessário)
router.get('/auth/magic', async (req, res) => {
  const rawToken = String(req.query.token || '').trim();
  if (!rawToken) {
    return res.redirect('/?error=1');
  }
  const tokenHash = hashToken(rawToken);
  try {
    const [rows] = await pool.query(
      'SELECT id, email, expires_at, used_at FROM magic_login_tokens WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    );
    if (!rows.length) {
      return res.redirect('/?error=1');
    }
    const tok = rows[0];
    if (tok.used_at) {
      return res.redirect('/?error=1');
    }
    const exp = new Date(tok.expires_at);
    if (exp.getTime() < Date.now()) {
      return res.redirect('/?error=6');
    }

    const email = String(tok.email || '')
      .trim()
      .toLowerCase();

    await pool.query('UPDATE magic_login_tokens SET used_at = NOW() WHERE id = ?', [tok.id]);

    const [users] = await pool.query(
      'SELECT id, email, company, role, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (users.length) {
      const u = users[0];
      if (!Number(u.is_active)) {
        return res.redirect('/?error=1');
      }
      req.session.userId = u.id;
      req.session.userEmail = u.email;
      req.session.userCompany = u.company || 'SAAB';
      req.session.userRole = u.role || 'admin';
      req.session.accountType = 'user';
      return res.redirect('/admin');
    }

    let [collabs] = await pool.query(
      'SELECT id, email, company, is_active FROM collaborators WHERE email = ? LIMIT 1',
      [email]
    );

    if (!collabs.length) {
      const dom = emailDomain(email);
      const name = displayNameFromEmail(email);
      const company = dom || 'Corporativo';
      try {
        await pool.query(
          'INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)',
          [name, email, company]
        );
      } catch (insErr) {
        if (insErr && insErr.code === 'ER_DUP_ENTRY') {
          /* outro pedido em paralelo */
        } else {
          throw insErr;
        }
      }
      [collabs] = await pool.query(
        'SELECT id, email, company, is_active FROM collaborators WHERE email = ? LIMIT 1',
        [email]
      );
    }

    if (!collabs.length || !Number(collabs[0].is_active)) {
      return res.redirect('/?error=1');
    }

    const c = collabs[0];
    req.session.userId = c.id;
    req.session.userEmail = c.email;
    req.session.userCompany = c.company || 'Sem Empresa';
    req.session.userRole = 'collaborator';
    req.session.accountType = 'collaborator';
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro no magic link:', error);
    return res.redirect('/?error=1');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
