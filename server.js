const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const XLSX = require('xlsx');

const authRoutes = require('./routes/authRoutes');
const { pool, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
const FFMPEG_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS || 120000);

const uploadsDir = path.join(os.tmpdir(), 'saab-videocolab-uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

// Configuração de sessão
app.use(
  session({
    secret: 'saab-videocolab-secret',
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
  res.json({
    id: req.session.userId || null,
    email: req.session.userEmail || null,
    company: req.session.userCompany || null,
    role: req.session.userRole || 'user',
    accountType: req.session.accountType || 'collaborator'
  });
});

// Conversão de WebM para MP4 usando FFmpeg
app.post(
  '/api/convert-to-mp4',
  ensureAuthenticated,
  ensureCollaborator,
  upload.single('video'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo de vídeo não enviado.' });
    }

    const inputPath = req.file.path;
    const outputPath = `${inputPath}.mp4`;

    const ffmpegArgs = [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath
    ];

    const ffmpegProcess = execFile(FFMPEG_BIN, ffmpegArgs, (error, stdout, stderr) => {
      clearTimeout(timeoutId);
      fs.unlink(inputPath, () => {});

      if (error) {
        const isKilled = error.killed || /SIGKILL|signal/i.test(String(error.signal || ''));
        console.error('Erro ao executar FFmpeg:', error);
        console.error('Binário FFmpeg utilizado:', FFMPEG_BIN);
        console.error(stderr);
        fs.unlink(outputPath, () => {});

        const message = isKilled
          ? 'A conversão para MP4 demorou mais do que o permitido no servidor.'
          : 'Erro ao converter vídeo para MP4 no servidor.';

        return res.status(500).json({ error: message });
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="video-colaborador.mp4"'
      );

      const readStream = fs.createReadStream(outputPath);
      readStream.on('close', () => {
        fs.unlink(outputPath, () => {});
      });
      pool
        .query('INSERT INTO downloads (user_id, company, email) VALUES (?, ?, ?)', [
          req.session.userId,
          req.session.userCompany || 'Sem Empresa',
          req.session.userEmail || null
        ])
        .catch((dbErr) => {
          console.error('Erro ao registrar download:', dbErr);
        });
      readStream.pipe(res);
    });

    const timeoutId = setTimeout(() => {
      if (ffmpegProcess && ffmpegProcess.kill) {
        console.warn('FFmpeg excedeu tempo limite, encerrando processo.');
        ffmpegProcess.kill('SIGKILL');
      }
    }, FFMPEG_TIMEOUT_MS);
  }
);

app.post('/api/metrics/generate-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    try {
      await pool.query(
        'INSERT INTO metric_events (user_id, email, company, event_type) VALUES (?, ?, ?, ?)',
        [
          req.session.userId || null,
          req.session.userEmail || null,
          req.session.userCompany || 'Sem Empresa',
          'generate_click'
        ]
      );
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar evento generate_click:', metricErr);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao registrar clique em gerar vídeo:', error);
    res.status(500).json({ error: 'Falha ao registrar evento.' });
  }
});

app.post('/api/metrics/download-click', ensureAuthenticated, ensureCollaborator, async (req, res) => {
  try {
    const userId = req.session.userId || null;
    const email = req.session.userEmail || null;
    const company = req.session.userCompany || 'Sem Empresa';
    try {
      await pool.query(
        'INSERT INTO metric_events (user_id, email, company, event_type) VALUES (?, ?, ?, ?)',
        [userId, email, company, 'download_click']
      );
    } catch (metricErr) {
      console.error('Aviso: falha ao registrar evento download_click:', metricErr);
    }
    await pool.query('INSERT INTO downloads (user_id, company, email) VALUES (?, ?, ?)', [
      userId,
      company,
      email
    ]);
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
    const [[generatedClicksByCollaborator]] = await pool.query(
      `SELECT COUNT(DISTINCT email) AS total
       FROM metric_events
       WHERE event_type = 'generate_click'
         AND email IS NOT NULL
         AND email <> ''`
    );
    const [[generatedWithoutDownloadByCollaborator]] = await pool.query(
      `SELECT COUNT(DISTINCT g.email) AS total
       FROM metric_events g
       WHERE g.event_type = 'generate_click'
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
    const generatedCollaboratorsCount = Number(generatedClicksByCollaborator.total || 0);
    const generatedNoDownloadCount = Number(
      generatedWithoutDownloadByCollaborator.total || 0
    );
    const generatedNoDownloadPercent =
      generatedCollaboratorsCount > 0
        ? Number(
            ((generatedNoDownloadCount / generatedCollaboratorsCount) * 100).toFixed(1)
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
  try {
    await pool.query('UPDATE users SET email = ?, company = ?, role = ? WHERE id = ?', [
      String(email).trim().toLowerCase(),
      String(company).trim(),
      role === 'admin' ? 'admin' : 'user',
      userId
    ]);
    res.json({ ok: true });
  } catch (error) {
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

      for (const rawRow of rows) {
        const name = String(rawRow.name || rawRow.Name || rawRow.nome || rawRow.Nome || '').trim();
        const email = String(rawRow.email || rawRow.Email || '').trim().toLowerCase();
        const company = String(rawRow.company || rawRow.Company || '').trim();

        if (!name || !email || !company) {
          skipped += 1;
          continue;
        }

        try {
          await pool.query(
            'INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)',
            [name, email, company]
          );
          inserted += 1;
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
  try {
    await pool.query('INSERT INTO collaborators (name, email, company, is_active) VALUES (?, ?, ?, 1)', [
      String(name).trim(),
      String(email).trim().toLowerCase(),
      String(company).trim()
    ]);
    res.json({ ok: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
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
      const validCount = rows.filter((rawRow) => {
        const name = String(rawRow.name || rawRow.Name || rawRow.nome || rawRow.Nome || '').trim();
        const email = String(rawRow.email || rawRow.Email || '').trim();
        const company = String(rawRow.company || rawRow.Company || '').trim();
        return !!name && !!email && !!company;
      }).length;
      res.json({
        totalRows: rows.length,
        validRows: validCount,
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

// Start
(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`SAAB VideoColab rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Falha ao inicializar banco:', error);
    process.exit(1);
  }
})();

