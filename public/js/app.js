(() => {
  const photoInput = document.getElementById('photo-input');
  const photoPreview = document.getElementById('photo-preview');
  const generateButton = document.getElementById('generate-button');
  const downloadButton = document.getElementById('download-button');
  const newVideoButton = document.getElementById('new-video-button');
  const linkedinShare = document.getElementById('linkedin-share');
  const resultActions = document.getElementById('result-actions');
  const progressContainer = document.getElementById('progress-container');
  const progressBarInner = document.getElementById('progress-bar-inner');
  const resultPreview = document.getElementById('result-preview');
  const formGrid = document.querySelector('.vc-form-grid');
  const generatorWorkspace = document.getElementById('generator-workspace');
  const photoPreviewPlaceholder = document.getElementById('photo-preview-placeholder');
  const resultVideo = document.getElementById('result-video');
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const videoPart1 = document.getElementById('video-part1');
  const audioTrack = document.getElementById('audio-track');
  const videoPart2 = document.getElementById('video-part2');

  const MAX_FILE_SIZE_MB = 5;
  const CANVAS_BG_COLOR = '#373737';

  let currentImage = null;
  let collaboratorEmail = null;
  let collaboratorName = 'Colaborador';
  let downloadUrl = null;
  let lastRecordedBlob = null;

  function trackMetric(eventType) {
    if (!eventType) return Promise.resolve();
    return fetch(`/api/metrics/${eventType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
    if (newVideoButton) {
      newVideoButton.hidden = true;
    }
    if (linkedinShare) {
      linkedinShare.hidden = true;
    }
    if (resultActions) {
      resultActions.hidden = true;
    }
  }

  function handleDownloadClick() {
    if (!lastRecordedBlob) {
      alert('Vídeo ainda não está disponível para download.');
      return;
    }

    if (!downloadButton) {
      return;
    }

    trackMetric('download-click').finally(() => {
      const url = URL.createObjectURL(lastRecordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'video-colaborador.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      alert('Arquivo muito grande. Tamanho máximo: 5MB.');
      photoInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        currentImage = img;
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

        setGenerateEnabled(true);
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
    ctx.fillStyle = CANVAS_BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#d9d9d6';
    ctx.textAlign = 'center';
    ctx.font = '42px Arial';
    ctx.fillText(
      'Seu vídeo institucional aparecerá aqui',
      canvas.width / 2,
      canvas.height / 2
    );

    fetchCurrentUser();

    [videoPart1, audioTrack, videoPart2].forEach((mediaEl) => {
      if (!mediaEl) return;
      mediaEl.muted = false;
      mediaEl.volume = 1;
    });

    if (photoInput) {
      photoInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
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
              }
            })
          )
          .then(({ blob }) => {
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
            if (newVideoButton) {
              newVideoButton.hidden = false;
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
          })
          .catch((err) => {
            console.error('Erro ao gerar vídeo:', err);
            alert(
              `Não foi possível gerar o vídeo: ${err && err.message ? err.message : 'erro desconhecido'}`
            );
          })
          .finally(() => {
            showProgress(false);
            setGenerateEnabled(true);
          });
      });
    }

    if (downloadButton) {
      downloadButton.addEventListener('click', (event) => {
        event.preventDefault();
        handleDownloadClick();
      });
    }
    if (newVideoButton) {
      newVideoButton.addEventListener('click', (event) => {
        event.preventDefault();
        clearPreviousResult();
        showProgress(false);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

