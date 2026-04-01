(() => {
  const photoInput = document.getElementById('photo-input');
  const photoPreview = document.getElementById('photo-preview');
  const generateButton = document.getElementById('generate-button');
  const downloadButton = document.getElementById('download-button');
  const newVideoButton = document.getElementById('new-video-button');
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
  const photoPreviewPlaceholder = document.getElementById('photo-preview-placeholder');
  const resultVideo = document.getElementById('result-video');
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const videoPart1 = document.getElementById('video-part1');
  const audioTrack = document.getElementById('audio-track');
  const videoPart2 = document.getElementById('video-part2');

  const MAX_FILE_SIZE_MB = 5;
  const CANVAS_BG_COLOR = '#373737';
  const DOWNLOAD_OUTPUT_FORMAT = 'mp4';

  let currentImage = null;
  let collaboratorEmail = null;
  let collaboratorName = 'Colaborador';
  let downloadUrl = null;
  let lastRecordedBlob = null;
  const LINKEDIN_SHARE_TEXT =
    `Fazer parte da história do primeiro Gripen produzido no Brasil é algo que vou levar comigo com muito orgulho.\n` +
    `Ver esse marco acontecer de perto torna tudo ainda mais especial. É a realização de um trabalho construído com dedicação, talento e o esforço de muitas pessoas.\n\n` +
    `Being part of the story of the first Gripen produced in Brazil is something I will carry with great pride.\n` +
    `Seeing this milestone happen up close makes it even more meaningful. It reflects the dedication, talent and hard work of many people.\n\n` +
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

    const originalLabel = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Preparando download...';

    trackMetric('download-click', { format: DOWNLOAD_OUTPUT_FORMAT }).finally(async () => {
      try {
        downloadButton.textContent = 'Seu vídeo está sendo baixado';
        const convertedBlob = await convertWebmToMp4(lastRecordedBlob);
        triggerBlobDownload(convertedBlob, 'video-somospartedogripen.mp4');
      } catch (error) {
        console.error('Falha na conversão para MP4:', error);
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

