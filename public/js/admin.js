(() => {
  const ICONS = {
    edit:
      '<svg class="vc-icon vc-icon-action" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause:
      '<svg class="vc-icon vc-icon-action" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    play:
      '<svg class="vc-icon vc-icon-action" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const tabButtons = Array.from(document.querySelectorAll('.vc-sidebar-item'));
  const panels = Array.from(document.querySelectorAll('.vc-tab-panel'));
  const dashboardRefreshButton = document.getElementById('dashboard-refresh-button');

  const userForm = document.getElementById('admin-user-form');
  const emailInput = document.getElementById('admin-email');
  const companyInput = document.getElementById('admin-company');
  const roleInput = document.getElementById('admin-role');
  const formFeedback = document.getElementById('admin-form-feedback');
  const collabForm = document.getElementById('admin-collab-form');
  const collabNameInput = document.getElementById('collab-name');
  const collabEmailInput = document.getElementById('collab-email');
  const collabCompanyInput = document.getElementById('collab-company');
  const collabFeedback = document.getElementById('admin-collab-feedback');
  const usersFilterInput = document.getElementById('users-filter');
  const collaboratorsFilterInput = document.getElementById('collaborators-filter');
  const usersCountText = document.getElementById('users-count-text');
  const collaboratorsCountText = document.getElementById('collaborators-count-text');
  const usersExportCsvBtn = document.getElementById('users-export-csv');
  const usersExportPdfBtn = document.getElementById('users-export-pdf');
  const collaboratorsExportCsvBtn = document.getElementById('collaborators-export-csv');
  const collaboratorsExportPdfBtn = document.getElementById('collaborators-export-pdf');
  const usersNewButton = document.getElementById('users-new-button');
  const collaboratorsNewButton = document.getElementById('collaborators-new-button');
  const goImportScreenButton = document.getElementById('go-import-screen');
  const backCollaboratorsButton = document.getElementById('back-collaborators-screen');
  const previewImportButton = document.getElementById('preview-import-button');
  const importPreviewSummary = document.getElementById('import-preview-summary');
  const importPreviewList = document.getElementById('import-preview-list');

  const importFileInput = document.getElementById('admin-import-file');
  const importButton = document.getElementById('admin-import-button');
  const importFeedback = document.getElementById('admin-import-feedback');

  const sidebarDomainsBtn = document.getElementById('sidebar-domains');
  const domainsForm = document.getElementById('domains-form');
  const domainInput = document.getElementById('domain-input');
  const domainsList = document.getElementById('domains-list');
  const domainsFeedback = document.getElementById('domains-feedback');

  const usersListEl = document.getElementById('admin-users-list');
  const collaboratorsListEl = document.getElementById('admin-collaborators-list');
  const kpiUsers = document.getElementById('kpi-users');
  const kpiCollaborators = document.getElementById('kpi-collaborators');
  const kpiDownloads = document.getElementById('kpi-downloads');
  const kpiGenerateNoDownload = document.getElementById('kpi-generate-no-download');
  const kpiGenerateNoDownloadHint = document.getElementById('kpi-generate-no-download-hint');
  const kpiLinkedinShare = document.getElementById('kpi-linkedin-share');
  const kpiLinkedinShareHint = document.getElementById('kpi-linkedin-share-hint');
  const kpiFacebookShare = document.getElementById('kpi-facebook-share');
  const kpiFacebookShareHint = document.getElementById('kpi-facebook-share-hint');
  const kpiInstagramShare = document.getElementById('kpi-instagram-share');
  const kpiInstagramShareHint = document.getElementById('kpi-instagram-share-hint');
  const statusPieCanvas = document.getElementById('downloads-status-pie-chart');
  const statusPieCtx = statusPieCanvas?.getContext('2d');
  const dailyBarCanvas = document.getElementById('downloads-daily-bar-chart');
  const dailyBarCtx = dailyBarCanvas?.getContext('2d');
  const collaboratorsByCompanyCanvas = document.getElementById('collaborators-by-company-chart');
  const collaboratorsByCompanyCtx = collaboratorsByCompanyCanvas?.getContext('2d');
  const socialShareBarCanvas = document.getElementById('social-share-bar-chart');
  const socialShareBarCtx = socialShareBarCanvas?.getContext('2d');
  const recentDownloadsByCompanyList = document.getElementById('recent-downloads-by-company-list');
  const videoGenerationLogsList = document.getElementById('video-generation-logs-list');
  const videoGenerationLogsListMenu = document.getElementById('video-generation-logs-list-menu');
  const videoLogFilterEmail = document.getElementById('video-log-filter-email');
  const videoLogFilterEmailMenu = document.getElementById('video-log-filter-email-menu');
  const videoLogFilterStatus = document.getElementById('video-log-filter-status');
  const videoLogFilterStatusMenu = document.getElementById('video-log-filter-status-menu');
  const videoLogFilterEvent = document.getElementById('video-log-filter-event');
  const videoLogFilterEventMenu = document.getElementById('video-log-filter-event-menu');
  const videoLogFilterFrom = document.getElementById('video-log-filter-from');
  const videoLogFilterFromMenu = document.getElementById('video-log-filter-from-menu');
  const videoLogFilterTo = document.getElementById('video-log-filter-to');
  const videoLogFilterToMenu = document.getElementById('video-log-filter-to-menu');
  const videoLogFilterApply = document.getElementById('video-log-filter-apply');
  const videoLogFilterApplyMenu = document.getElementById('video-log-filter-apply-menu');
  const collabFormCancelBtn = document.getElementById('collaborators-cancel-new');
  const usersListControls = document.getElementById('users-list-controls');
  const collaboratorsListControls = document.getElementById('collaborators-list-controls');
  const usersPageSizeSelect = document.getElementById('users-page-size');
  const usersFirstBtn = document.getElementById('users-page-first');
  const usersPrevBtn = document.getElementById('users-page-prev');
  const usersNextBtn = document.getElementById('users-page-next');
  const usersLastBtn = document.getElementById('users-page-last');
  const usersPageInfo = document.getElementById('users-page-info');
  const collaboratorsPageSizeSelect = document.getElementById('collaborators-page-size');
  const collaboratorsFirstBtn = document.getElementById('collaborators-page-first');
  const collaboratorsPrevBtn = document.getElementById('collaborators-page-prev');
  const collaboratorsNextBtn = document.getElementById('collaborators-page-next');
  const collaboratorsLastBtn = document.getElementById('collaborators-page-last');
  const collaboratorsPageInfo = document.getElementById('collaborators-page-info');
  const usersSortableHeaders = Array.from(document.querySelectorAll('[data-panel="users"] th[data-sort-key]'));
  const collaboratorsSortableHeaders = Array.from(
    document.querySelectorAll('[data-panel="collaborators"] th[data-sort-key]')
  );
  let allUsers = [];
  let allCollaborators = [];
  let currentUsers = [];
  let currentCollaborators = [];
  let usersViewMode = 'list';
  let collaboratorsViewMode = 'list';
  let usersPage = 1;
  let collaboratorsPage = 1;
  let usersPageSize = 10;
  let collaboratorsPageSize = 10;
  let usersSort = { key: 'email', dir: 'asc' };
  let collaboratorsSort = { key: 'name', dir: 'asc' };

  function showText(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#b00020' : '#373737';
  }

  function randomColor(index) {
    const palette = ['#262957', '#b9b19a', '#3a3e74', '#cec6b2', '#1f2147', '#a79f89'];
    return palette[index % palette.length];
  }

  function drawPie(ctx, canvas, data, emptyText) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!data.length) {
      ctx.fillStyle = '#373737';
      ctx.font = '18px Arial';
      ctx.fillText(emptyText || 'Sem dados', 30, 120);
      return;
    }

    const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0);
    let start = -Math.PI / 2;
    const cx = 170;
    const cy = 165;
    const r = 118;

    data.forEach((item, index) => {
      const value = Number(item.total || 0);
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = randomColor(index);
      ctx.fill();
      start += angle;
    });

    let y = 312;
    data.forEach((item, index) => {
      const label = item.label || item.company;
      ctx.fillStyle = randomColor(index);
      ctx.fillRect(18, y - 14, 18, 18);
      ctx.fillStyle = '#262957';
      ctx.font = '16px Arial';
      ctx.fillText(`${label}: ${item.total}`, 40, y);
      y += 28;
    });
  }

  function drawDailyBars(data) {
    if (!dailyBarCtx || !dailyBarCanvas) return;
    dailyBarCtx.clearRect(0, 0, dailyBarCanvas.width, dailyBarCanvas.height);
    if (!data || !data.length) {
      dailyBarCtx.fillStyle = '#373737';
      dailyBarCtx.font = '18px Arial';
      dailyBarCtx.fillText('Sem downloads no período', 20, 120);
      return;
    }
    const w = dailyBarCanvas.width;
    const h = dailyBarCanvas.height;
    const pad = { top: 24, right: 18, bottom: 50, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const max = Math.max(1, ...data.map((x) => Number(x.total || 0)));
    const barW = chartW / data.length;

    dailyBarCtx.strokeStyle = '#d9d4c8';
    dailyBarCtx.beginPath();
    dailyBarCtx.moveTo(pad.left, pad.top);
    dailyBarCtx.lineTo(pad.left, pad.top + chartH);
    dailyBarCtx.lineTo(pad.left + chartW, pad.top + chartH);
    dailyBarCtx.stroke();

    data.forEach((item, idx) => {
      const val = Number(item.total || 0);
      const bh = (val / max) * (chartH - 8);
      const x = pad.left + idx * barW + 1;
      const y = pad.top + chartH - bh;
      dailyBarCtx.fillStyle = '#b9b19a';
      dailyBarCtx.fillRect(x, y, Math.max(1, barW - 2), bh);
    });

    const ticks = [0, Math.floor(max / 2), max];
    dailyBarCtx.fillStyle = '#6a6a6a';
    dailyBarCtx.font = '12px Arial';
    ticks.forEach((t) => {
      const y = pad.top + chartH - (t / max) * (chartH - 8);
      dailyBarCtx.fillText(String(t), 8, y + 4);
      dailyBarCtx.strokeStyle = '#ece7db';
      dailyBarCtx.beginPath();
      dailyBarCtx.moveTo(pad.left, y);
      dailyBarCtx.lineTo(pad.left + chartW, y);
      dailyBarCtx.stroke();
    });

    const step = Math.max(1, Math.ceil(data.length / 7));
    for (let i = 0; i < data.length; i += step) {
      const d = String(data[i].date || '');
      const label = d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d;
      const x = pad.left + i * barW + 2;
      dailyBarCtx.fillStyle = '#666';
      dailyBarCtx.fillText(label, x, h - 18);
    }
  }

  function drawSocialShareBars(ctx, canvas, rows) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const data = rows && rows.length ? rows : [];
    if (!data.length) {
      ctx.fillStyle = '#373737';
      ctx.font = '18px Arial';
      ctx.fillText('Sem cliques em compartilhar ainda', 20, 140);
      return;
    }
    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 32, right: 28, bottom: 78, left: 44 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const max = Math.max(1, ...data.map((r) => Number(r.clicks || 0)));
    const n = data.length;
    const gap = 28;
    const barW = n > 0 ? (chartW - gap * (n - 1)) / n : 0;

    ctx.strokeStyle = '#d9d4c8';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    const ticks = [0, Math.floor(max / 2), max];
    ctx.fillStyle = '#6a6a6a';
    ctx.font = '11px Arial';
    ticks.forEach((t) => {
      const ty = pad.top + chartH - (t / max) * (chartH - 10);
      ctx.fillText(String(t), 6, ty + 4);
    });

    data.forEach((row, idx) => {
      const clicks = Number(row.clicks || 0);
      const bh = (clicks / max) * (chartH - 10);
      const x = pad.left + idx * (barW + gap);
      const y = pad.top + chartH - bh;
      ctx.fillStyle = row.color || '#262957';
      ctx.fillRect(x, y, barW, Math.max(0, bh));
      ctx.fillStyle = '#2d2d2d';
      ctx.font = 'bold 15px Arial';
      ctx.textAlign = 'center';
      if (clicks > 0) {
        ctx.fillText(String(clicks), x + barW / 2, Math.max(pad.top + 14, y - 6));
      }
      ctx.font = '13px Arial';
      ctx.fillText(row.label || row.key, x + barW / 2, pad.top + chartH + 20);
      ctx.fillStyle = '#6a6a6a';
      ctx.font = '11px Arial';
      const dist = Number(row.collaboratorsDistinct || 0);
      ctx.fillText(`${dist} colab. distintos`, x + barW / 2, pad.top + chartH + 36);
    });
    ctx.textAlign = 'left';
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const adjusted = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return adjusted.toLocaleString('pt-BR');
  }

  function formatBytes(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '-';
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function escapeHtmlAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatClientMetricsSummary(raw) {
    if (!raw) return { short: '-', full: '' };
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || typeof o !== 'object') return { short: '-', full: String(raw) };
      const parts = [];
      if (o.logicalProcessors != null) parts.push(`${o.logicalProcessors} núcleos`);
      if (o.deviceRamEstimateGb != null) parts.push(`~${o.deviceRamEstimateGb}GB RAM`);
      if (o.jsHeapUsedMb != null) parts.push(`heap JS ${o.jsHeapUsedMb}MB`);
      if (o.networkEffectiveType) parts.push(String(o.networkEffectiveType));
      if (o.networkDownlinkMbps != null) parts.push(`${o.networkDownlinkMbps}Mbps↓`);
      if (o.documentVisibility) parts.push(o.documentVisibility);
      if (o.longTaskCount > 0) {
        parts.push(
          `${o.longTaskCount} long task(s)`,
          o.longTaskMaxMs != null ? `máx ${o.longTaskMaxMs}ms` : ''
        );
      } else if (o.longTasksSupported === true && o.longTaskCount === 0) {
        parts.push('0 long tasks');
      }
      const short = parts.length ? parts.filter(Boolean).join(' · ') : '(sem métricas)';
      let full = '';
      try {
        full = JSON.stringify(o);
      } catch (e) {
        full = String(raw);
      }
      return { short, full };
    } catch (e) {
      return { short: String(raw).slice(0, 96), full: String(raw) };
    }
  }

  function renderRecentDownloadsByCompany(rows) {
    if (!recentDownloadsByCompanyList) return;
    if (!rows || !rows.length) {
      recentDownloadsByCompanyList.innerHTML =
        '<tr><td colspan="4">Nenhum download registrado.</td></tr>';
      return;
    }
    recentDownloadsByCompanyList.innerHTML = rows
      .map(
        (r) => `
          <tr>
            <td>${r.company || '-'}</td>
            <td>${r.collaboratorName || '-'}</td>
            <td>${r.email || '-'}</td>
            <td>${formatDateTime(r.downloadedAt)}</td>
          </tr>
        `
      )
      .join('');
  }

  function renderVideoGenerationLogs(rows, targetListEl) {
    const outputEl = targetListEl || videoGenerationLogsList || videoGenerationLogsListMenu;
    if (!outputEl) return;
    if (!rows || !rows.length) {
      outputEl.innerHTML = '<tr><td colspan="8">Nenhum log encontrado.</td></tr>';
      return;
    }
    outputEl.innerHTML = rows
      .map((r) => {
        const env = [r.browser || '-', r.os || '-'].join(' / ');
        const size = r.mp4_size_bytes
          ? `MP4: ${formatBytes(r.mp4_size_bytes)}`
          : r.webm_size_bytes
            ? `WEBM: ${formatBytes(r.webm_size_bytes)}`
            : '-';
        const m = formatClientMetricsSummary(r.client_metrics_json);
        const tip =
          m.full.length > 1800 ? `${m.full.slice(0, 1800)}…` : m.full;
        return `
          <tr>
            <td>${formatDateTime(r.created_at)}</td>
            <td>${r.email || '-'}</td>
            <td>${r.event_type || '-'}</td>
            <td>${r.status || '-'}</td>
            <td>${env}</td>
            <td>${size}</td>
            <td title="${escapeHtmlAttr(tip)}">${escapeHtmlAttr(m.short)}</td>
            <td>${r.message || '-'}</td>
          </tr>
        `;
      })
      .join('');
  }

  async function loadVideoGenerationLogs(fromMenuTab) {
    const usingMenu = Boolean(fromMenuTab);
    const outputEl = usingMenu
      ? videoGenerationLogsListMenu || videoGenerationLogsList
      : videoGenerationLogsList || videoGenerationLogsListMenu;
    if (!outputEl) return;
    try {
      const params = new URLSearchParams();
      const emailInput = usingMenu
        ? videoLogFilterEmailMenu || videoLogFilterEmail
        : videoLogFilterEmail || videoLogFilterEmailMenu;
      const statusInput = usingMenu
        ? videoLogFilterStatusMenu || videoLogFilterStatus
        : videoLogFilterStatus || videoLogFilterStatusMenu;
      const eventInput = usingMenu
        ? videoLogFilterEventMenu || videoLogFilterEvent
        : videoLogFilterEvent || videoLogFilterEventMenu;
      const fromInput = usingMenu
        ? videoLogFilterFromMenu || videoLogFilterFrom
        : videoLogFilterFrom || videoLogFilterFromMenu;
      const toInput = usingMenu
        ? videoLogFilterToMenu || videoLogFilterTo
        : videoLogFilterTo || videoLogFilterToMenu;
      const email = (emailInput && emailInput.value.trim().toLowerCase()) || '';
      const status = (statusInput && statusInput.value.trim().toLowerCase()) || '';
      const eventType = (eventInput && eventInput.value.trim().toLowerCase()) || '';
      const from = (fromInput && fromInput.value) || '';
      const to = (toInput && toInput.value) || '';
      if (email) params.set('email', email);
      if (status) params.set('status', status);
      if (eventType) params.set('eventType', eventType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('limit', '200');
      const res = await fetch(`/api/admin/video-generation-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar logs de geração');
      renderVideoGenerationLogs(data.logs || [], outputEl);
    } catch (error) {
      console.error('Erro ao carregar logs de geração:', error);
      renderVideoGenerationLogs([], outputEl);
    }
  }

  function compareValues(a, b, key) {
    const av = a?.[key];
    const bv = b?.[key];
    if (key === 'is_active') return Number(av || 0) - Number(bv || 0);
    return String(av || '').localeCompare(String(bv || ''), 'pt-BR', {
      sensitivity: 'base'
    });
  }

  function sortRows(rows, sortState) {
    const sorted = [...rows].sort((a, b) => compareValues(a, b, sortState.key));
    return sortState.dir === 'asc' ? sorted : sorted.reverse();
  }

  function paginateRows(rows, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(totalPages, Math.max(1, page));
    const start = (currentPage - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      page: currentPage,
      totalPages
    };
  }

  function renderUsers(users) {
    if (!usersListEl) return;
    if (!users.length) {
      usersListEl.innerHTML = '<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>';
      return;
    }
    usersListEl.innerHTML = users
      .map(
        (u) => `
        <tr>
          <td><strong>${u.email}</strong></td>
          <td>${u.company}</td>
          <td>${u.role}</td>
          <td>${Number(u.is_active) ? 'Ativo' : 'Inativo'}</td>
          <td>
            <button class="vc-button vc-button-secondary vc-small-btn" title="Editar" data-edit-user="${u.id}">${ICONS.edit}</button>
            <button class="vc-button vc-button-primary vc-small-btn" title="${Number(u.is_active) ? 'Inativar' : 'Ativar'}" data-toggle-user="${u.id}" data-next-active="${Number(u.is_active) ? 0 : 1}">
              ${Number(u.is_active) ? ICONS.pause : ICONS.play}
            </button>
          </td>
        </tr>`
      )
      .join('');
  }

  function renderCollaborators(collaborators) {
    if (!collaboratorsListEl) return;
    if (!collaborators.length) {
      collaboratorsListEl.innerHTML =
        '<tr><td colspan="5">Nenhum colaborador cadastrado.</td></tr>';
      return;
    }
    collaboratorsListEl.innerHTML = collaborators
      .map(
        (c) =>
          `<tr>
            <td><strong>${c.name || '-'}</strong></td>
            <td><strong>${c.email}</strong></td>
            <td>${c.company}</td>
            <td>${Number(c.is_active) ? 'Ativo' : 'Inativo'}</td>
            <td>
              <button class="vc-button vc-button-primary vc-small-btn" title="${Number(c.is_active) ? 'Inativar' : 'Ativar'}" data-toggle-collaborator="${c.id}" data-next-active="${Number(c.is_active) ? 0 : 1}">
                ${Number(c.is_active) ? ICONS.pause : ICONS.play}
              </button>
            </td>
          </tr>`
      )
      .join('');
  }

  function updateSortHeaders(headers, sortState) {
    headers.forEach((th) => {
      const key = th.getAttribute('data-sort-key');
      if (key === sortState.key) {
        th.setAttribute('data-sort-dir', sortState.dir);
      } else {
        th.removeAttribute('data-sort-dir');
      }
    });
  }

  function renderUsersTable(rows) {
    const sorted = sortRows(rows, usersSort);
    const pageData = paginateRows(sorted, usersPage, usersPageSize);
    const totalPages = pageData.totalPages;
    usersPage = pageData.page;
    currentUsers = sorted;
    renderUsers(pageData.rows);
    if (usersCountText) {
      usersCountText.textContent = `Exibindo ${pageData.rows.length} de ${sorted.length} registros`;
    }
    if (usersPageInfo) {
      usersPageInfo.textContent = `Página ${usersPage} de ${totalPages}`;
    }
    if (usersFirstBtn) usersFirstBtn.disabled = usersPage <= 1;
    if (usersPrevBtn) usersPrevBtn.disabled = usersPage <= 1;
    if (usersNextBtn) usersNextBtn.disabled = usersPage >= totalPages;
    if (usersLastBtn) usersLastBtn.disabled = usersPage >= totalPages;
    updateSortHeaders(usersSortableHeaders, usersSort);
  }

  function renderCollaboratorsTable(rows) {
    const sorted = sortRows(rows, collaboratorsSort);
    const pageData = paginateRows(sorted, collaboratorsPage, collaboratorsPageSize);
    const totalPages = pageData.totalPages;
    collaboratorsPage = pageData.page;
    currentCollaborators = sorted;
    renderCollaborators(pageData.rows);
    if (collaboratorsCountText) {
      collaboratorsCountText.textContent = `Exibindo ${pageData.rows.length} de ${sorted.length} registros`;
    }
    if (collaboratorsPageInfo) {
      collaboratorsPageInfo.textContent = `Página ${collaboratorsPage} de ${totalPages}`;
    }
    if (collaboratorsFirstBtn) collaboratorsFirstBtn.disabled = collaboratorsPage <= 1;
    if (collaboratorsPrevBtn) collaboratorsPrevBtn.disabled = collaboratorsPage <= 1;
    if (collaboratorsNextBtn) collaboratorsNextBtn.disabled = collaboratorsPage >= totalPages;
    if (collaboratorsLastBtn) collaboratorsLastBtn.disabled = collaboratorsPage >= totalPages;
    updateSortHeaders(collaboratorsSortableHeaders, collaboratorsSort);
  }

  function applyFilters() {
    const usersTerm = (usersFilterInput?.value || '').trim().toLowerCase();
    const collabTerm = (collaboratorsFilterInput?.value || '').trim().toLowerCase();

    const filteredUsers = allUsers.filter(
      (u) =>
        !usersTerm ||
        String(u.email || '').toLowerCase().includes(usersTerm) ||
        String(u.company || '').toLowerCase().includes(usersTerm)
    );
    const filteredCollaborators = allCollaborators.filter(
      (c) =>
        !collabTerm ||
        String(c.name || '').toLowerCase().includes(collabTerm) ||
        String(c.email || '').toLowerCase().includes(collabTerm) ||
        String(c.company || '').toLowerCase().includes(collabTerm)
    );

    renderUsersTable(filteredUsers);
    renderCollaboratorsTable(filteredCollaborators);
  }

  function exportToCsv(rows, columns, fileName) {
    const header = columns.map((c) => c.label).join(';');
    const body = rows
      .map((row) =>
        columns
          .map((c) =>
            `"${String(row[c.key] ?? '')
              .replace(/"/g, '""')
              .trim()}"`
          )
          .join(';')
      )
      .join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportToXls(rows, columns, fileName) {
    const header = columns.map((c) => c.label).join('\t');
    const body = rows
      .map((row) =>
        columns
          .map((c) =>
            String(row[c.key] ?? '')
              .replace(/\t/g, ' ')
              .replace(/\r?\n/g, ' ')
          )
          .join('\t')
      )
      .join('\n');
    const xls = `${header}\n${body}`;
    const blob = new Blob([xls], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function switchToTab(tab) {
    tabButtons.forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('vc-hidden', panel.getAttribute('data-panel') !== tab);
    });
    if (tab === 'users') {
      setUsersView('list');
    }
    if (tab === 'collaborators') {
      setCollaboratorsView('list');
    }
    if (tab === 'domains') {
      loadDomains();
    }
    if (tab === 'video-logs') {
      loadVideoGenerationLogs(true);
    }
  }

  async function initDomainsAccess() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const data = await res.json();
      if (data.canManageDomains && sidebarDomainsBtn) {
        sidebarDomainsBtn.classList.remove('vc-hidden');
      }
    } catch (e) {
      /* ignore */
    }
  }

  async function loadDomains() {
    if (!domainsList) return;
    try {
      const res = await fetch('/api/admin/domains');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar domínios');
      const rows = data.domains || [];
      if (!rows.length) {
        domainsList.innerHTML =
          '<tr><td colspan="3">Nenhum domínio cadastrado. Adicione pelo menos um para permitir logins.</td></tr>';
        return;
      }
      domainsList.innerHTML = rows
        .map(
          (r) => `
        <tr>
          <td>${escapeHtml(r.domain)}</td>
          <td>${formatDateTime(r.created_at)}</td>
          <td>
            <button type="button" class="vc-button vc-crud-ghost" data-edit-domain="${r.id}" data-domain="${encodeURIComponent(r.domain)}">Editar</button>
            <button type="button" class="vc-button vc-crud-ghost" data-delete-domain="${r.id}">Excluir</button>
          </td>
        </tr>`
        )
        .join('');
    } catch (error) {
      if (domainsFeedback) showText(domainsFeedback, error.message, true);
    }
  }

  function escapeHtml(s) {
    const t = String(s);
    return t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function setUsersView(mode) {
    usersViewMode = mode;
    userForm.classList.toggle('vc-hidden', mode !== 'form');
    usersListControls?.classList.toggle('vc-hidden', mode !== 'list');
    usersFilterInput?.closest('.vc-crud-filters')?.classList.toggle('vc-hidden', mode !== 'list');
  }

  function setCollaboratorsView(mode) {
    collaboratorsViewMode = mode;
    collabForm.classList.toggle('vc-hidden', mode !== 'form');
    collaboratorsListControls?.classList.toggle('vc-hidden', mode !== 'list');
    collaboratorsFilterInput?.closest('.vc-crud-filters')?.classList.toggle('vc-hidden', mode !== 'list');
  }

  function setupTabs() {
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchToTab(tab);
      });
    });
  }

  async function loadMetrics() {
    try {
      const res = await fetch('/api/admin/metrics');
      if (!res.ok) throw new Error('Falha ao carregar métricas');
      const data = await res.json();
      if (kpiUsers) kpiUsers.textContent = String(data.usersCount || 0);
      if (kpiCollaborators) kpiCollaborators.textContent = String(data.collaboratorsCount || 0);
      if (kpiDownloads) kpiDownloads.textContent = String(data.downloadsCount || 0);
      if (kpiGenerateNoDownload) {
        const count = Number(data.generatedNoDownloadCount || 0);
        const percent = Number(data.generatedNoDownloadPercent || 0);
        kpiGenerateNoDownload.textContent = `${count} (${percent}%)`;
      }
      if (kpiGenerateNoDownloadHint) {
        const ready = Number(data.videoReadyCollaboratorsCount || 0);
        kpiGenerateNoDownloadHint.textContent =
          ready > 0
            ? `De ${ready} colaborador(es) que concluíram a geração do vídeo`
            : 'Contagem após vídeo gerado com sucesso (nova versão)';
      }
      if (kpiLinkedinShare) {
        kpiLinkedinShare.textContent = String(data.linkedinShareClicksTotal || 0);
      }
      if (kpiLinkedinShareHint) {
        const distinct = Number(data.linkedinShareCollaboratorsDistinct || 0);
        kpiLinkedinShareHint.textContent =
          distinct > 0 ? `${distinct} colaborador(es) distintos` : 'Ícone de compartilhar no LinkedIn';
      }
      if (kpiFacebookShare) {
        kpiFacebookShare.textContent = String(data.facebookShareClicksTotal || 0);
      }
      if (kpiFacebookShareHint) {
        const distinct = Number(data.facebookShareCollaboratorsDistinct || 0);
        kpiFacebookShareHint.textContent =
          distinct > 0 ? `${distinct} colaborador(es) distintos` : 'Ícone de compartilhar no Facebook';
      }
      if (kpiInstagramShare) {
        kpiInstagramShare.textContent = String(data.instagramShareClicksTotal || 0);
      }
      if (kpiInstagramShareHint) {
        const distinct = Number(data.instagramShareCollaboratorsDistinct || 0);
        kpiInstagramShareHint.textContent =
          distinct > 0 ? `${distinct} colaborador(es) distintos` : 'Ícone de compartilhar no Instagram';
      }
      drawPie(statusPieCtx, statusPieCanvas, data.byDownloadStatus || [], 'Sem dados de usuários');
      drawDailyBars(data.downloadsByDay || []);
      drawPie(
        collaboratorsByCompanyCtx,
        collaboratorsByCompanyCanvas,
        data.collaboratorsByCompany || [],
        'Sem colaboradores cadastrados'
      );
      drawSocialShareBars(socialShareBarCtx, socialShareBarCanvas, data.shareClicksByNetwork || []);
      renderRecentDownloadsByCompany(data.recentDownloadsByCompany || []);
      await loadVideoGenerationLogs();
      allUsers = data.users || [];
      allCollaborators = data.collaborators || [];
      applyFilters();
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  }

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showText(formFeedback, 'Cadastrando...', false);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          company: companyInput.value.trim(),
          role: roleInput.value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no cadastro');

      showText(formFeedback, 'Usuário cadastrado com sucesso.', false);
      userForm.reset();
      setUsersView('list');
      loadMetrics();
    } catch (error) {
      showText(formFeedback, error.message, true);
    }
  });

  usersListEl.addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('[data-toggle-user]');
    const editBtn = event.target.closest('[data-edit-user]');
    const toggleId = toggleBtn && toggleBtn.getAttribute('data-toggle-user');
    const nextActive = toggleBtn && toggleBtn.getAttribute('data-next-active');
    if (toggleId) {
      try {
        const res = await fetch(`/api/admin/users/${toggleId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: Number(nextActive) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao atualizar status');
        loadMetrics();
      } catch (error) {
        showText(formFeedback, error.message, true);
      }
    }

    const editId = editBtn && editBtn.getAttribute('data-edit-user');
    if (editId) {
      const newEmail = window.prompt('Novo e-mail:');
      const newCompany = window.prompt('Nova empresa:');
      const newRole = window.prompt('Novo role (admin/user):', 'user');
      if (!newEmail || !newCompany) return;
      try {
        const res = await fetch(`/api/admin/users/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newEmail, company: newCompany, role: newRole })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao atualizar usuário');
        loadMetrics();
      } catch (error) {
        showText(formFeedback, error.message, true);
      }
    }
  });

  collaboratorsListEl.addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('[data-toggle-collaborator]');
    const collabId = toggleBtn && toggleBtn.getAttribute('data-toggle-collaborator');
    const nextActive = toggleBtn && toggleBtn.getAttribute('data-next-active');
    if (!collabId) return;
    try {
      const res = await fetch(`/api/admin/collaborators/${collabId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: Number(nextActive) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar status');
      loadMetrics();
    } catch (error) {
      showText(collabFeedback, error.message, true);
    }
  });

  if (importButton) {
    importButton.addEventListener('click', async () => {
      const file = importFileInput.files && importFileInput.files[0];
      if (!file) {
        showText(importFeedback, 'Selecione um arquivo primeiro.', true);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      showText(importFeedback, 'Importando...', false);

      try {
        const res = await fetch('/api/admin/collaborators/import', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha na importação');
        showText(importFeedback, `Importação concluída. Inseridos: ${data.inserted}, ignorados: ${data.skipped}.`, false);
        loadMetrics();
      } catch (error) {
        showText(importFeedback, error.message, true);
      }
    });
  }

  if (previewImportButton) {
    previewImportButton.addEventListener('click', async () => {
      const file = importFileInput.files && importFileInput.files[0];
      if (!file) {
        showText(importFeedback, 'Selecione um arquivo primeiro.', true);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/admin/collaborators/import-preview', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha no preview');
        if (importPreviewSummary) {
          const parts = [
            `Total linhas: ${data.totalRows}`,
            `Linhas válidas: ${data.validRows}`,
            typeof data.importableRows === 'number' ? `Inseríveis: ${data.importableRows}` : null,
            typeof data.skippedDuplicateRows === 'number'
              ? `Duplicados (ignorados): ${data.skippedDuplicateRows}`
              : null
          ].filter(Boolean);
          importPreviewSummary.textContent = parts.join(' | ');
        }
        if (importPreviewList) {
          importPreviewList.innerHTML = (data.previewRows || [])
            .map((r) => `<tr><td>${r.name || '-'}</td><td>${r.email || '-'}</td><td>${r.company || '-'}</td></tr>`)
            .join('');
          if (!data.previewRows || !data.previewRows.length) {
            importPreviewList.innerHTML = '<tr><td colspan="3">Sem dados para pré-visualização.</td></tr>';
          }
        }
      } catch (error) {
        showText(importFeedback, error.message, true);
      }
    });
  }

  collabForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showText(collabFeedback, 'Cadastrando colaborador...', false);
    try {
      const res = await fetch('/api/admin/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: collabNameInput.value.trim(),
          email: collabEmailInput.value.trim(),
          company: collabCompanyInput.value.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao cadastrar colaborador');
      collabForm.reset();
      showText(collabFeedback, 'Colaborador cadastrado com sucesso.', false);
      loadMetrics();
    } catch (error) {
      showText(collabFeedback, error.message, true);
    }
  });

  if (usersFilterInput) {
    usersFilterInput.addEventListener('input', applyFilters);
  }
  if (collaboratorsFilterInput) {
    collaboratorsFilterInput.addEventListener('input', applyFilters);
  }

  if (usersNewButton) {
    usersNewButton.addEventListener('click', () => {
      setUsersView('form');
      emailInput?.focus();
    });
  }
  if (collaboratorsNewButton) {
    collaboratorsNewButton.addEventListener('click', () => {
      setCollaboratorsView('form');
      collabNameInput?.focus();
    });
  }
  if (goImportScreenButton) {
    goImportScreenButton.addEventListener('click', () => switchToTab('collaborators-import'));
  }
  if (backCollaboratorsButton) {
    backCollaboratorsButton.addEventListener('click', () => switchToTab('collaborators'));
  }

  if (usersExportCsvBtn) {
    usersExportCsvBtn.addEventListener('click', () => {
      exportToXls(currentUsers, [
        { key: 'email', label: 'Email' },
        { key: 'company', label: 'Empresa' },
        { key: 'role', label: 'Tipo' }
      ], 'usuarios.xls');
    });
  }
  if (collaboratorsExportCsvBtn) {
    collaboratorsExportCsvBtn.addEventListener('click', () => {
      exportToXls(currentCollaborators, [
        { key: 'name', label: 'Nome' },
        { key: 'email', label: 'Email' },
        { key: 'company', label: 'Empresa' }
      ], 'colaboradores.xls');
    });
  }
  if (usersExportPdfBtn) {
    usersExportPdfBtn.addEventListener('click', () => {
      window.print();
    });
  }
  if (collaboratorsExportPdfBtn) {
    collaboratorsExportPdfBtn.addEventListener('click', () => {
      window.print();
    });
  }
  if (dashboardRefreshButton) {
    dashboardRefreshButton.addEventListener('click', () => loadMetrics());
  }
  if (videoLogFilterApply) {
    videoLogFilterApply.addEventListener('click', () => loadVideoGenerationLogs(false));
  }
  if (videoLogFilterApplyMenu) {
    videoLogFilterApplyMenu.addEventListener('click', () => loadVideoGenerationLogs(true));
  }

  if (collabFormCancelBtn) {
    collabFormCancelBtn.addEventListener('click', () => setCollaboratorsView('list'));
  }

  if (usersPageSizeSelect) {
    usersPageSizeSelect.addEventListener('change', () => {
      usersPageSize = Number(usersPageSizeSelect.value) || 10;
      usersPage = 1;
      applyFilters();
    });
  }
  if (collaboratorsPageSizeSelect) {
    collaboratorsPageSizeSelect.addEventListener('change', () => {
      collaboratorsPageSize = Number(collaboratorsPageSizeSelect.value) || 10;
      collaboratorsPage = 1;
      applyFilters();
    });
  }
  if (usersFirstBtn) {
    usersFirstBtn.addEventListener('click', () => {
      usersPage = 1;
      applyFilters();
    });
  }
  if (usersPrevBtn) {
    usersPrevBtn.addEventListener('click', () => {
      usersPage = Math.max(1, usersPage - 1);
      applyFilters();
    });
  }
  if (usersNextBtn) {
    usersNextBtn.addEventListener('click', () => {
      usersPage += 1;
      applyFilters();
    });
  }
  if (usersLastBtn) {
    usersLastBtn.addEventListener('click', () => {
      usersPage = Number.MAX_SAFE_INTEGER;
      applyFilters();
    });
  }
  if (collaboratorsFirstBtn) {
    collaboratorsFirstBtn.addEventListener('click', () => {
      collaboratorsPage = 1;
      applyFilters();
    });
  }
  if (collaboratorsPrevBtn) {
    collaboratorsPrevBtn.addEventListener('click', () => {
      collaboratorsPage = Math.max(1, collaboratorsPage - 1);
      applyFilters();
    });
  }
  if (collaboratorsNextBtn) {
    collaboratorsNextBtn.addEventListener('click', () => {
      collaboratorsPage += 1;
      applyFilters();
    });
  }
  if (collaboratorsLastBtn) {
    collaboratorsLastBtn.addEventListener('click', () => {
      collaboratorsPage = Number.MAX_SAFE_INTEGER;
      applyFilters();
    });
  }

  usersSortableHeaders.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      if (!key) return;
      if (usersSort.key === key) {
        usersSort.dir = usersSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        usersSort = { key, dir: 'asc' };
      }
      usersPage = 1;
      applyFilters();
    });
  });
  collaboratorsSortableHeaders.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      if (!key) return;
      if (collaboratorsSort.key === key) {
        collaboratorsSort.dir = collaboratorsSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        collaboratorsSort = { key, dir: 'asc' };
      }
      collaboratorsPage = 1;
      applyFilters();
    });
  });

  if (domainsForm && domainInput) {
    domainsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = domainInput.value.trim();
      if (!raw) return;
      showText(domainsFeedback, 'Salvando...', false);
      try {
        const res = await fetch('/api/admin/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: raw })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
        domainInput.value = '';
        showText(domainsFeedback, 'Domínio adicionado.', false);
        await loadDomains();
      } catch (err) {
        showText(domainsFeedback, err.message, true);
      }
    });
  }

  if (domainsList) {
    domainsList.addEventListener('click', async (ev) => {
      const delBtn = ev.target.closest('[data-delete-domain]');
      const editBtn = ev.target.closest('[data-edit-domain]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-delete-domain');
        if (!id || !window.confirm('Excluir este domínio?')) return;
        try {
          const res = await fetch(`/api/admin/domains/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao excluir');
          showText(domainsFeedback, 'Domínio removido.', false);
          await loadDomains();
        } catch (err) {
          showText(domainsFeedback, err.message, true);
        }
        return;
      }
      if (editBtn) {
        const id = editBtn.getAttribute('data-edit-domain');
        const prev = decodeURIComponent(editBtn.getAttribute('data-domain') || '');
        const next = window.prompt('Novo domínio:', prev);
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed || trimmed === prev) return;
        try {
          const res = await fetch(`/api/admin/domains/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: trimmed })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
          showText(domainsFeedback, 'Domínio atualizado.', false);
          await loadDomains();
        } catch (err) {
          showText(domainsFeedback, err.message, true);
        }
      }
    });
  }

  setupTabs();
  switchToTab('dashboard');
  setUsersView('list');
  setCollaboratorsView('list');
  initDomainsAccess();
  loadMetrics();
})();

