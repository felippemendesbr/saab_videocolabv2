(() => {
  const photoInput = document.getElementById('photo-input');
  const photoPreview = document.getElementById('photo-preview');
  const generateButton = document.getElementById('generate-button');
  const downloadButton = document.getElementById('download-button');
  const linkedinShare = document.getElementById('linkedin-share');
  const linkedinShareLink = document.getElementById('linkedin-share-link');
  const facebookShareLink = document.getElementById('facebook-share-link');
  const instagramShareLink = document.getElementById('instagram-share-link');
  const shareCopyButton = document.getElementById('share-copy-button');
  const sharePostText = document.getElementById('share-post-text');
  const resultActions = document.getElementById('result-actions');
  const progressContainer = document.getElementById('progress-container');
  const progressBarInner = document.getElementById('progress-bar-inner');
  const resultPreview = document.getElementById('result-preview');
  const formGrid = document.querySelector('.vc-form-grid');
  const generatorWorkspace = document.getElementById('generator-workspace');
  const mediaReadyStatus = document.getElementById('media-ready-status');
  const generationNotice = document.getElementById('generation-notice');
  const photoPreviewPlaceholder = document.getElementById('photo-preview-placeholder');
  const resultVideo = document.getElementById('result-video');
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const videoPart1 = document.getElementById('video-part1');
  const audioTrack = document.getElementById('audio-track');
  const videoPart2 = document.getElementById('video-part2');

  const MAX_FILE_SIZE_MB = 1;
  /** Largura deve ser pelo menos esta fração maior que a altura (paisagem com tolerância). */
  const LANDSCAPE_MIN_ASPECT_RATIO = 1.02;
  const CANVAS_BG_COLOR = '#373737';
  const DOWNLOAD_OUTPUT_FORMAT = 'mp4';
  const MIN_VALID_MP4_BYTES = 15 * 1024 * 1024;
  const GENERATION_CHECKPOINT_KEY = 'vc_generation_checkpoint_v1';

  let currentImage = null;
  let collaboratorEmail = null;
  let collaboratorName = 'Colaborador';
  let downloadUrl = null;
  let lastRecordedBlob = null;
  let isPhotoReady = false;
  let mediaReadiness = {
    videoPart1: false,
    audioTrack: false,
    videoPart2: false
  };
  let mediaLoadState = {
    videoPart1: { status: 'pending', reason: '' },
    audioTrack: { status: 'pending', reason: '' },
    videoPart2: { status: 'pending', reason: '' }
  };
  let mediaLoadLogFinalized = false;
  let isGeneratingNow = false;
  let visibilityPauseActive = false;
  let generationStartedAt = 0;
  let checkpointLastSavedAt = 0;
  let generationSessionId = null;
  const LINKEDIN_SHARE_TEXT =
    `Fazer parte da história do primeiro Gripen produzido no Brasil é motivo de orgulho para todos que ajudam a construir esse marco todos os dias.\n\n` +
    `É também uma forma de registrar a contribuição individual de cada um que, com talento, dedicação e compromisso, faz parte dessa trajetória.\n\n` +
    `Se você também faz parte dessa história, acesse www.somospartedogripen.com.br, faça seu vídeo e compartilhe esse orgulho.\n\n` +
    `#EuSouParteDoGripen\n` +
    `#Gripen\n` +
    `#SaabBrasil\n` +
    `@SaabdoBrasil`;

  function trackMetric(eventType, body) {
    if (!eventType) return Promise.resolve();
    const payload =
      body && typeof body === 'object' && Object.keys(body).length ? body : {};
    return fetch(`/api/metrics/${eventType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(() => {})
      .catch(() => {});
  }

  function detectClientContext() {
    const nav = window.navigator || {};
    const ua = String(nav.userAgent || '');
    const lower = ua.toLowerCase();
    let browser = 'Desconhecido';
    if (lower.includes('edg/')) browser = 'Edge';
    else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Chrome';
    else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Safari';
    else if (lower.includes('firefox/')) browser = 'Firefox';

    let os = 'Desconhecido';
    if (lower.includes('windows nt')) os = 'Windows';
    else if (lower.includes('android')) os = 'Android';
    else if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) os = 'iOS';
    else if (lower.includes('mac os')) os = 'macOS';
    else if (lower.includes('linux')) os = 'Linux';

    let deviceType = 'desktop';
    if (/android|iphone|ipad|ipod|mobile/i.test(ua)) deviceType = 'mobile';
    if (/ipad|tablet/i.test(ua)) deviceType = 'tablet';

    const viewportWidth = window.innerWidth || null;
    const viewportHeight = window.innerHeight || null;
    const screenWidth = window.screen && window.screen.width ? window.screen.width : null;
    const screenHeight = window.screen && window.screen.height ? window.screen.height : null;
    const timezone =
      (window.Intl &&
        window.Intl.DateTimeFormat &&
        window.Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      '';

    return {
      browser,
      os,
      deviceType,
      userAgent: ua,
      language: nav.language || '',
      viewportWidth,
      viewportHeight,
      screenWidth,
      screenHeight,
      timezone
    };
  }

  function logVideoGenerationEvent(eventType, extras) {
    const payload = Object.assign(
      {
        eventType,
        status: 'info',
        format: 'linkedin',
        preset: window.__VIDEO_RENDERER_PRESET || 'stable',
        appVersion: 'web-1',
        sessionId: generationSessionId
      },
      detectClientContext(),
      extras || {}
    );
    return fetch('/api/logs/video-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(() => {})
      .catch(() => {});
  }

  function formatCollaboratorNameFromEmail(email) {
    if (!email || typeof email !== 'string') {
      return 'Colaborador';
    }
    const localPart = email.split('@')[0] || '';
    if (!localPart) {
      return 'Colaborador';
    }

    const separatorsRegex = /[._-]+/;
    const pieces = localPart.split(separatorsRegex).filter(Boolean);
    if (!pieces.length) return 'Colaborador';

    const capitalized = pieces.map((p) => {
      const lower = p.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });

    return capitalized.join(' ');
  }

  function showProgress(show) {
    if (!progressContainer) return;
    progressContainer.hidden = !show;
  }

  function setProgressValue(value) {
    if (!progressBarInner) return;
    const v = Math.max(0, Math.min(1, value || 0));
    progressBarInner.style.width = `${(v * 100).toFixed(1)}%`;
  }

  function setGenerateEnabled(enabled) {
    if (generateButton) {
      generateButton.disabled = !enabled;
    }
  }

  function allMediaReady() {
    return mediaReadiness.videoPart1 && mediaReadiness.audioTrack && mediaReadiness.videoPart2;
  }

  function refreshGenerateAvailability() {
    setGenerateEnabled(Boolean(isPhotoReady && allMediaReady()));
  }

  function setMediaStatus(kind, text) {
    if (!mediaReadyStatus) return;
    mediaReadyStatus.textContent = text;
    mediaReadyStatus.classList.remove('is-ready', 'is-error');
    if (kind === 'ready') mediaReadyStatus.classList.add('is-ready');
    if (kind === 'error') mediaReadyStatus.classList.add('is-error');
  }

  function setGenerationNotice(kind, text) {
    if (!generationNotice) return;
    generationNotice.textContent = text || '';
    generationNotice.hidden = !text;
    generationNotice.classList.remove('is-warning', 'is-info');
    if (kind === 'warning') generationNotice.classList.add('is-warning');
    if (kind === 'info') generationNotice.classList.add('is-info');
  }

  function readCheckpoint() {
    try {
      const raw = sessionStorage.getItem(GENERATION_CHECKPOINT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function clearGenerationCheckpoint() {
    try {
      sessionStorage.removeItem(GENERATION_CHECKPOINT_KEY);
    } catch (e) {}
  }

  function saveGenerationCheckpoint(progress) {
    if (!isGeneratingNow) return;
    const now = Date.now();
    if (now - checkpointLastSavedAt < 1200) return;
    checkpointLastSavedAt = now;
    const payload = {
      progress: Number(progress || 0),
      startedAt: generationStartedAt,
      savedAt: now,
      email: collaboratorEmail || null
    };
    try {
      sessionStorage.setItem(GENERATION_CHECKPOINT_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function applyDynamicPreset() {
    // Redes sociais: padroniza geração em 720p para reduzir peso e tempo de processamento.
    window.__VIDEO_RENDERER_PRESET = 'stable';
    return window.__VIDEO_RENDERER_PRESET;
  }

  function updateMediaReadyStatusText() {
    const loaded = [mediaReadiness.videoPart1, mediaReadiness.audioTrack, mediaReadiness.videoPart2].filter(Boolean).length;
    if (loaded >= 3) {
      setMediaStatus('ready', 'Recursos prontos. Você já pode gerar o vídeo.');
      return;
    }
    setMediaStatus(
      'info',
      `Carregando recursos de vídeo e áudio... (${loaded}/3)`
    );
  }

  function mediaErrorCodeToText(code) {
    const n = Number(code || 0);
    if (n === 1) return 'MEDIA_ERR_ABORTED';
    if (n === 2) return 'MEDIA_ERR_NETWORK';
    if (n === 3) return 'MEDIA_ERR_DECODE';
    if (n === 4) return 'MEDIA_ERR_SRC_NOT_SUPPORTED';
    return 'MEDIA_ERR_UNKNOWN';
  }

  function collectMediaFailureReason(key, mediaEl) {
    if (!mediaEl) return `${key}: elemento de mídia ausente`;
    const errorCode = mediaErrorCodeToText(mediaEl.error && mediaEl.error.code);
    const networkState = Number(mediaEl.networkState || 0);
    const readyState = Number(mediaEl.readyState || 0);
    const src = mediaEl.currentSrc || mediaEl.src || key;
    return `${key}: ${errorCode} (networkState=${networkState}, readyState=${readyState}, src=${src})`;
  }

  function maybeFinalizeMediaLoadLog() {
    if (mediaLoadLogFinalized) return;
    const entries = Object.entries(mediaLoadState);
    const hasPending = entries.some(([, state]) => state.status === 'pending');
    if (hasPending) return;
    mediaLoadLogFinalized = true;
    const failedEntries = entries.filter(([, state]) => state.status === 'error');
    if (!failedEntries.length) {
      logVideoGenerationEvent('media_resources_loaded', {
        status: 'success',
        message: 'Todos os recursos de mídia foram carregados com sucesso.'
      });
      return;
    }
    const reasonText = failedEntries
      .map(([key, state]) => state.reason || `${key}: falha sem detalhe`)
      .join(' | ');
    logVideoGenerationEvent('media_resources_loaded', {
      status: 'error',
      message: `Falha no carregamento de recursos: ${reasonText}`
    });
  }

  function watchMediaReadiness() {
    const entries = [
      ['videoPart1', videoPart1],
      ['audioTrack', audioTrack],
      ['videoPart2', videoPart2]
    ];
    entries.forEach(([key, mediaEl]) => {
      if (!mediaEl) return;
      const markReady = () => {
        mediaReadiness[key] = true;
        mediaLoadState[key] = { status: 'ready', reason: '' };
        updateMediaReadyStatusText();
        refreshGenerateAvailability();
        maybeFinalizeMediaLoadLog();
      };
      const markError = () => {
        mediaReadiness[key] = false;
        mediaLoadState[key] = {
          status: 'error',
          reason: collectMediaFailureReason(key, mediaEl)
        };
        setMediaStatus('error', `Falha ao carregar recurso: ${key}. Atualize a página e tente novamente.`);
        refreshGenerateAvailability();
        maybeFinalizeMediaLoadLog();
      };
      const hasEnoughData = Number(mediaEl.readyState || 0) >= 4;
      if (hasEnoughData) {
        markReady();
      } else {
        mediaEl.addEventListener('canplaythrough', markReady, { once: true });
      }
      mediaEl.addEventListener('error', markError);
    });
    updateMediaReadyStatusText();
  }

  function drawDefaultPreview(text) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = CANVAS_BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d9d9d6';
    ctx.textAlign = 'center';
    ctx.font = '42px Arial';
    ctx.fillText(text || 'Seu vídeo institucional aparecerá aqui', canvas.width / 2, canvas.height / 2);
  }

  function clearPreviousResult() {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
    }

    lastRecordedBlob = null;

    if (resultVideo) {
      resultVideo.removeAttribute('src');
      resultVideo.load();
    }

    if (resultPreview) {
      resultPreview.hidden = true;
    }
    if (formGrid) {
      formGrid.hidden = false;
    }
    if (generatorWorkspace) {
      generatorWorkspace.hidden = false;
    }
    if (generateButton) {
      generateButton.hidden = false;
    }

    if (downloadButton) {
      downloadButton.hidden = true;
      downloadButton.disabled = true;
    }
    if (linkedinShare) {
      linkedinShare.hidden = true;
    }
    if (resultActions) {
      resultActions.hidden = true;
    }
    [videoPart1, audioTrack, videoPart2].forEach((mediaEl) => {
      if (!mediaEl) return;
      try {
        mediaEl.pause();
        mediaEl.currentTime = 0;
      } catch (e) {}
    });
    drawDefaultPreview('Preview da intro será exibido aqui');
    setGenerationNotice('', '');
    refreshGenerateAvailability();
  }

  function handleDownloadClick() {
    if (!lastRecordedBlob) {
      alert('Vídeo ainda não está disponível para download.');
      return;
    }

    if (!downloadButton) {
      return;
    }

    const originalLabel = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Preparando download...';

    trackMetric('download-click', { format: DOWNLOAD_OUTPUT_FORMAT }).finally(async () => {
      try {
        downloadButton.textContent = 'Seu vídeo está sendo baixado';
        logVideoGenerationEvent('convert_start', {
          status: 'info',
          webmSizeBytes: Number(lastRecordedBlob && lastRecordedBlob.size ? lastRecordedBlob.size : 0)
        });
        const convertedBlob = await convertWebmToMp4(lastRecordedBlob);
        if (Number(convertedBlob.size || 0) < MIN_VALID_MP4_BYTES) {
          const actualSize = formatBytesToMb(convertedBlob.size);
          const minSize = formatBytesToMb(MIN_VALID_MP4_BYTES);
          throw new Error(
            `Arquivo MP4 inválido para download: ${actualSize} MB. O tamanho mínimo esperado é ${minSize} MB.`
          );
        }
        logVideoGenerationEvent('convert_success', {
          status: 'success',
          mp4SizeBytes: Number(convertedBlob && convertedBlob.size ? convertedBlob.size : 0)
        });
        triggerBlobDownload(convertedBlob, 'video-somospartedogripen.mp4');
      } catch (error) {
        console.error('Falha na conversão para MP4:', error);
        logVideoGenerationEvent('convert_error', {
          status: 'error',
          message: error && error.message ? error.message : 'Falha na conversão para MP4'
        });
        alert(
          error && error.message
            ? error.message
            : 'Não foi possível converter o vídeo para MP4. Tente novamente.'
        );
      }
    }).finally(() => {
      downloadButton.disabled = false;
      downloadButton.textContent = originalLabel;
    });
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatBytesToMb(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0,00';
    return (n / (1024 * 1024)).toFixed(2).replace('.', ',');
  }

  async function convertWebmToMp4(blob) {
    const formData = new FormData();
    formData.append('video', blob, 'video-colaborador.webm');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    let response;
    try {
      response = await fetch('/api/convert-to-mp4', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('A conversão para MP4 demorou mais do que cinco minutos.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      let message = 'Erro ao converter para MP4.';
      try {
        const payload = await response.json();
        if (payload && payload.error) message = payload.error;
      } catch (e) {}
      throw new Error(message);
    }
    return response.blob();
  }

  function getSharePostPlainText() {
    if (sharePostText && typeof sharePostText.textContent === 'string') {
      return sharePostText.textContent.trim();
    }
    return LINKEDIN_SHARE_TEXT;
  }

  function copyLinkedinShareText() {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return Promise.reject(new Error('Clipboard API não disponível.'));
    }
    return navigator.clipboard.writeText(getSharePostPlainText());
  }

  function handleSocialShareClick(networkName) {
    const shareMetricByNetwork = {
      LinkedIn: 'linkedin-share-click',
      Facebook: 'facebook-share-click',
      Instagram: 'instagram-share-click'
    };
    const metric = shareMetricByNetwork[networkName];
    if (metric) {
      trackMetric(metric);
    }
    copyLinkedinShareText()
      .then(() => {
        alert(`Texto copiado! No ${networkName}, cole com Ctrl+V e anexe o vídeo.`);
      })
      .catch(() => {
        alert('Não foi possível copiar automaticamente. Copie manualmente o texto sugerido.');
      });
  }

  function validateAndLoadImage(file) {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      alert('Formato inválido. Use JPG, JPEG ou PNG.');
      photoInput.value = '';
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      alert('Arquivo muito grande. Tamanho máximo: 1MB.');
      photoInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          alert('Não foi possível ler as dimensões da imagem. Tente outro arquivo.');
          photoInput.value = '';
          return;
        }
        if (w / h < LANDSCAPE_MIN_ASPECT_RATIO) {
          alert(
            'Envie uma foto em formato paisagem (horizontal). Retratos e imagens muito quadradas não são aceitas.'
          );
          photoInput.value = '';
          return;
        }
        currentImage = img;
        isPhotoReady = true;
        if (photoPreview) {
          photoPreview.src = img.src;
        }
        if (photoPreviewPlaceholder) {
          photoPreviewPlaceholder.hidden = true;
        }

        ctx.fillStyle = CANVAS_BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#d9d9d6';
        ctx.textAlign = 'center';
        ctx.font = '42px Arial';
        ctx.fillText('Preview da intro será exibido aqui', canvas.width / 2, canvas.height / 2);

        refreshGenerateAvailability();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function fetchCurrentUser() {
    fetch('/api/me', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Não autenticado');
        }
        return res.json();
      })
      .then((data) => {
        collaboratorEmail = data.email || null;
        collaboratorName = formatCollaboratorNameFromEmail(collaboratorEmail);
      })
      .catch(() => {
        collaboratorName = 'Colaborador';
      });
  }

  async function unlockMediaPlayback(mediaElements) {
    for (const mediaEl of mediaElements) {
      if (!mediaEl) continue;
      const originalVolume = mediaEl.volume;
      const originalTime = mediaEl.currentTime || 0;
      try {
        mediaEl.volume = 0;
        await mediaEl.play();
        mediaEl.pause();
        mediaEl.currentTime = originalTime;
      } catch (e) {
        // Alguns navegadores podem bloquear; seguimos mesmo assim.
      } finally {
        mediaEl.volume = originalVolume;
      }
    }
  }

  function init() {
    clearPreviousResult();
    drawDefaultPreview('Seu vídeo institucional aparecerá aqui');

    watchMediaReadiness();
    const checkpoint = readCheckpoint();
    if (checkpoint && typeof checkpoint.progress === 'number') {
      const pct = Math.max(0, Math.min(99, Math.round(checkpoint.progress * 100)));
      setGenerationNotice(
        'info',
        `Uma geração anterior foi interrompida (${pct}%). Se possível, mantenha esta aba ativa durante a nova geração.`
      );
    }

    fetchCurrentUser();

    [videoPart1, audioTrack, videoPart2].forEach((mediaEl) => {
      if (!mediaEl) return;
      mediaEl.muted = false;
      mediaEl.volume = 1;
    });

    if (photoInput) {
      photoInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        isPhotoReady = false;
        refreshGenerateAvailability();
        validateAndLoadImage(file);
      });
    }

    if (generateButton) {
      generateButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (!currentImage) {
          alert('Envie uma foto antes de gerar o vídeo.');
          return;
        }

        if (!window.VideoRenderer) {
          alert('Módulo de renderização de vídeo não encontrado.');
          return;
        }

        clearPreviousResult();
        showProgress(true);
        setProgressValue(0);
        setGenerateEnabled(false);
        trackMetric('generate-click');

        const format = 'linkedin';
        const activePreset = applyDynamicPreset();
        generationSessionId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        generationStartedAt = Date.now();
        checkpointLastSavedAt = 0;
        isGeneratingNow = true;
        visibilityPauseActive = false;
        clearGenerationCheckpoint();
        setGenerationNotice(
          'warning',
          `Para melhor performance, mantenha esta aba ativa durante a geração. Preset automático: ${activePreset}.`
        );
        logVideoGenerationEvent('generate_start', { status: 'info', preset: activePreset });

        unlockMediaPlayback([videoPart1, audioTrack, videoPart2])
          .then(() =>
            window.VideoRenderer.startRecording({
              canvas,
              videoPart1,
              audioTrack,
              videoPart2,
              image: currentImage,
              collaboratorName,
              format,
              onProgress: (value) => {
                setProgressValue(value);
                saveGenerationCheckpoint(value);
              }
            })
          )
          .then(({ blob }) => {
            const durationMs = Math.max(0, Date.now() - generationStartedAt);
            logVideoGenerationEvent('generate_success', {
              status: 'success',
              webmSizeBytes: Number(blob && blob.size ? blob.size : 0),
              durationMs
            });
            lastRecordedBlob = blob;
            downloadUrl = URL.createObjectURL(blob);

            if (resultVideo) {
              resultVideo.src = downloadUrl;
              resultVideo.load();
            }

            if (resultPreview) {
              resultPreview.hidden = false;
            }

            if (downloadButton) {
              downloadButton.hidden = false;
              downloadButton.disabled = false;
            }
            if (linkedinShare) {
              linkedinShare.hidden = false;
            }
            if (resultActions) {
              resultActions.hidden = false;
            }
            if (formGrid) {
              formGrid.hidden = true;
            }
            if (generatorWorkspace) {
              generatorWorkspace.hidden = true;
            }
            if (generateButton) {
              generateButton.hidden = true;
            }
            clearGenerationCheckpoint();
            setGenerationNotice('', '');
          })
          .catch((err) => {
            console.error('Erro ao gerar vídeo:', err);
            const durationMs = Math.max(0, Date.now() - generationStartedAt);
            logVideoGenerationEvent('generate_error', {
              status: 'error',
              message: err && err.message ? err.message : 'erro desconhecido',
              durationMs
            });
            alert(
              `Não foi possível gerar o vídeo: ${err && err.message ? err.message : 'erro desconhecido'}`
            );
          })
          .finally(() => {
            isGeneratingNow = false;
            visibilityPauseActive = false;
            showProgress(false);
            setGenerateEnabled(true);
          });
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!isGeneratingNow || !window.VideoRenderer) return;
      if (document.hidden) {
        if (window.VideoRenderer.isRecordingActive && window.VideoRenderer.isRecordingActive()) {
          window.VideoRenderer.pauseRecording();
          visibilityPauseActive = true;
          logVideoGenerationEvent('generate_paused_hidden', {
            status: 'warning',
            message: 'Geração pausada por troca de aba'
          });
          setGenerationNotice(
            'warning',
            'Geração pausada porque a aba ficou em segundo plano. Volte para esta aba para continuar.'
          );
        }
        return;
      }
      if (visibilityPauseActive && window.VideoRenderer.isPaused && window.VideoRenderer.isPaused()) {
        window.VideoRenderer.resumeRecording();
        visibilityPauseActive = false;
        logVideoGenerationEvent('generate_resumed_visible', {
          status: 'info',
          message: 'Geração retomada ao voltar para aba'
        });
        setGenerationNotice(
          'info',
          'Geração retomada. Para evitar travamentos, mantenha esta aba visível até o final.'
        );
      }
    });

    if (downloadButton) {
      downloadButton.addEventListener('click', (event) => {
        event.preventDefault();
        handleDownloadClick();
      });
    }
    if (linkedinShareLink) {
      linkedinShareLink.addEventListener('click', () => {
        handleSocialShareClick('LinkedIn');
      });
    }
    if (facebookShareLink) {
      facebookShareLink.addEventListener('click', () => {
        handleSocialShareClick('Facebook');
      });
    }
    if (instagramShareLink) {
      instagramShareLink.addEventListener('click', () => {
        handleSocialShareClick('Instagram');
      });
    }

    if (shareCopyButton) {
      shareCopyButton.addEventListener('click', () => {
        copyLinkedinShareText()
          .then(() => {
            alert('Texto copiado! Cole na rede social (Ctrl+V) e anexe o vídeo.');
          })
          .catch(() => {
            alert('Não foi possível copiar automaticamente. Selecione o texto na caixa acima e copie manualmente (Ctrl+C).');
          });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

