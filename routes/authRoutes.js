const express = require('express');
const { pool, ADMIN_EMAIL } = require('../db');

const router = express.Router();

// POST /login
router.post('/login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.redirect('/?error=1');
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const [adminUsers] = await pool.query(
      'SELECT id, email, company, role, is_active FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (adminUsers.length) {
      const adminUser = adminUsers[0];
      if (!Number(adminUser.is_active)) {
        return res.redirect('/?error=1');
      }
      req.session.userId = adminUser.id;
      req.session.userEmail = adminUser.email;
      req.session.userCompany = adminUser.company || 'SAAB';
      req.session.userRole = adminUser.role || 'admin';
      req.session.accountType = 'user';
      return res.redirect('/admin');
    }

    const [collaborators] = await pool.query(
      'SELECT id, email, company, is_active FROM collaborators WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    if (collaborators.length) {
      const collab = collaborators[0];
      if (!Number(collab.is_active)) {
        return res.redirect('/?error=1');
      }
      req.session.userId = collab.id;
      req.session.userEmail = collab.email;
      req.session.userCompany = collab.company || 'Sem Empresa';
      req.session.userRole = 'collaborator';
      req.session.accountType = 'collaborator';
      return res.redirect('/dashboard');
    }

    if (normalizedEmail === ADMIN_EMAIL) {
      return res.redirect('/?error=2');
    }

    return res.redirect('/?error=1');
  } catch (error) {
    console.error('Erro no login:', error);
    return res.redirect('/?error=1');
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;

