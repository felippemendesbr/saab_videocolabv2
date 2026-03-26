(() => {
  /**
   * Fallback quando não há trilha: duração fixa da fase foto (nome, zoom, etc.).
   * Com trilha: a fase foto dura o áudio restante do arquivo (de TRILHA_START_OFFSET_S até o fim).
   */
  const INTRO_TOTAL_SECONDS = 2.35;
  const INTRO_FADE_IN_SECONDS = 0.5;
  /** Trecho da foto após o fade-in (sem efeito extra no fim — corte direto para o PT2). */
  const INTRO_DISPLAY_SECONDS =
    INTRO_TOTAL_SECONDS - INTRO_FADE_IN_SECONDS;

  /** Atraso curto para trilha entrar sem "buraco" perceptível. */
  const PHOTO_TRILHA_DELAY_S = 0.01;

  /**
   * Dissolução PT1 → foto e foto → PT2 (mesma duração / mesmo tipo de blend).
   */
  const PT1_PHOTO_CROSSFADE_S = 0.65;
  /**
   * Duração total do handoff PT1 → trilha (fase “bleed” + cruzamento).
   * Mais longo = junção mais suave, menos sensação de mute.
   */
  const PT1_TRILHA_AUDIO_BRIDGE_S = 0.38;
  /**
   * Com a foto já na tela, mantém o áudio do PT1 em volume total por este tempo
   * antes de iniciar o crossfade com a trilha — evita cortar o final da fala.
   */
  const PT1_AUDIO_HOLD_BEFORE_TRILHA_S = 0.42;
  /**
   * Volume da trilha logo na foto (fundo até o handoff com o PT1). `setGainValue` limita a 1.
   */
  const TRILHA_AMBIENT_HOLD_GAIN = 0.82;
  const TRILHA_AMBIENT_RAMP_S = 0.14;
  /**
   * Seek no início da trilha (s). Manter 0: a fala “e construir juntas” vem ~1s depois no arquivo.
   */
  const TRILHA_START_OFFSET_S = 0;
  const AUDIO_FADE_INTO_PHOTO_S = 0.16;
  /** Margem mínima para imprecisão de metadados da trilha (evita cortar áudio antes do fim). */
  const PHOTO_TRILHA_BUFFER_S = 0.03;
  /** Fade curto do PT2 ao entrar para transição natural trilha → vídeo (evita corte seco ou mudo). */
  const PHOTO_PT2_AUDIO_FADE_S = 0.1;
  /** Crossfade foto → PT2: duração do fade out da foto e fade in do vídeo. */
  const PHOTO_PT2_CROSSFADE_S = 0.6;
  /** Mínimo de segundos da fase foto antes de iniciar o PT2. */
  const PHOTO_MIN_DISPLAY_S = 2;
  /** Limite da fase foto para evitar vídeos longos em excesso. */
  const PHOTO_MAX_DISPLAY_S = 6;
  /** Fade final da trilha nos últimos instantes (permite "e construir juntas" tocar completo). */
  const TRILHA_FINALE_FADE_S = 0.08;
  /** Segundos após início da gravação para pré-decode do PT2 (quanto mais cedo, mais tempo para carregar). */
  const PART2_PREROLL_ELAPSED_S = 1.5;
  /** Sem trilha: sobe o áudio do PT2 com fade curto */
  const PART2_SOLO_AUDIO_FADE_S = 0.28;

  const NAME_TYPING_SECONDS = 1.5;
  const NAME_TYPING_START_SECONDS = 0.5;

  const ZOOM_TOTAL_SECONDS = 2;
  const ZOOM_START_SCALE = 1.0;
  const ZOOM_END_SCALE = 1.08;

  const BG_COLOR = '#373737';

  let mediaRecorder = null;
  let canvasStream = null;
  let audioContext = null;
  let audioDestination = null;
  let audioSources = [];
  let part1GainNode = null;
  let trilhaGainNode = null;
  let part2GainNode = null;
  let recordedChunks = [];
  let animationFrameId = null;
  let renderIntervalId = null;
  let isRecording = false;
  let startTimestamp = null;
  let startedVideoPlayback = false;
  let expectedVideoDuration = null;
  let part1Duration = 0;
  let part2Duration = 0;
  let photoSegmentStarted = false;
  let part1PausedAfterIntro = false;
  let trilhaStarted = false;
  let trilhaPreRoll = false;
  /** Duração da fase foto (trilha até o fim, ou INTRO_TOTAL_SECONDS sem trilha). */
  let photoPhaseSeconds = INTRO_TOTAL_SECONDS;
  let trilhaFadeOutScheduled = false;
  let part2CrossfadeFreezeDone = false;
  let part2Primed = false;
  let part2Started = false;

  let currentResolve = null;
  let currentReject = null;

  let state = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Hermite 0..1 — transição mais natural que linear */
  function smoothstep01(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function configureCanvasForFormat(canvas, format) {
    if (format === 'instagram') {
      canvas.width = 1080;
      canvas.height = 1080;
    } else {
      canvas.width = 1920;
      canvas.height = 1080;
    }
  }

  function ensureMediaMetadata(media) {
    return new Promise((resolve, reject) => {
      if (!media) {
        reject(new Error('Mídia não encontrada.'));
        return;
      }

      if (isFinite(media.duration) && media.duration > 0) {
        resolve(media.duration);
        return;
      }

      let timeoutId = null;

      const cleanupListeners = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        media.removeEventListener('loadedmetadata', onLoaded);
        media.removeEventListener('error', onError);
      };

      const onLoaded = () => {
        cleanupListeners();
        resolve(media.duration || 0);
      };

      const onError = () => {
        cleanupListeners();
        reject(new Error('Falha ao carregar mídia.'));
      };

      media.addEventListener('loadedmetadata', onLoaded);
      media.addEventListener('error', onError);
      timeoutId = setTimeout(() => {
        cleanupListeners();
        reject(new Error('Timeout ao carregar metadados da mídia.'));
      }, 12000);

      try {
        media.load();
      } catch (e) {}
    });
  }

  async function getDurationSafe(media) {
    try {
      return (await ensureMediaMetadata(media)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function cleanupAudio() {
    audioSources.forEach((source) => {
      try {
        source.disconnect();
      } catch (e) {}
    });
    audioSources = [];
    part1GainNode = null;
    trilhaGainNode = null;
    part2GainNode = null;
    if (audioDestination) {
      try {
        audioDestination.disconnect();
      } catch (e) {}
      audioDestination = null;
    }
    if (audioContext) {
      try {
        audioContext.close();
      } catch (e) {}
      audioContext = null;
    }
  }

  function setGainValue(gainNode, value, rampSeconds) {
    if (!audioContext || !gainNode || !gainNode.gain) return;
    const now = audioContext.currentTime;
    const safeValue = clamp(value, 0, 1);
    const safeRamp = Math.max(0, rampSeconds || 0);
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      if (safeRamp > 0) {
        gainNode.gain.linearRampToValueAtTime(safeValue, now + safeRamp);
      } else {
        gainNode.gain.setValueAtTime(safeValue, now);
      }
    } catch (e) {}
  }

  /**
   * Handoff em 2 fases: a trilha sobe “por baixo” com o PT1 ainda em 100%,
   * depois cruzamento linear. Em sinais diferentes, potência igual (cos/sin)
   * costuma soar como um mute no meio — esta curva mantém energia mais estável.
   */
  function scheduleSmoothPt1TrilhaHandoff(bridgeSeconds) {
    if (!audioContext || !part1GainNode || !trilhaGainNode) return;
    const bridgeTotal = clamp(bridgeSeconds, 0.22, 0.6);
    const now = audioContext.currentTime;
    const bleed = clamp(bridgeTotal * 0.48, 0.14, 0.26);
    const tBleedEnd = now + bleed;
    const tEnd = now + bridgeTotal;
    const trilhaBleedLevel = 0.92;
    const trilhaFinalGain = 1.22;

    try {
      part1GainNode.gain.cancelScheduledValues(now);
      trilhaGainNode.gain.cancelScheduledValues(now);

      const trNow = clamp(trilhaGainNode.gain.value, 0, 2);
      trilhaGainNode.gain.setValueAtTime(trNow, now);
      trilhaGainNode.gain.linearRampToValueAtTime(trilhaBleedLevel, tBleedEnd);
      trilhaGainNode.gain.linearRampToValueAtTime(trilhaFinalGain, tEnd);

      part1GainNode.gain.setValueAtTime(1, now);
      part1GainNode.gain.setValueAtTime(1, tBleedEnd);
      part1GainNode.gain.linearRampToValueAtTime(0, tEnd);
    } catch (e) {
      setGainValue(part1GainNode, 0, bridgeTotal);
      setGainValue(trilhaGainNode, 1, bridgeTotal);
    }
  }

  function setupMixedAudioTrack(targetStream, mediaElements, refs) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    audioContext = new Ctx();
    audioDestination = audioContext.createMediaStreamDestination();

    mediaElements.forEach((mediaEl) => {
      if (!mediaEl) return;
      try {
        mediaEl.crossOrigin = 'anonymous';
        const source = audioContext.createMediaElementSource(mediaEl);
        const gainNode = audioContext.createGain();
        const isPart1 = refs && mediaEl === refs.videoPart1;
        const isTrilha = refs && mediaEl === refs.audioTrack;
        const isPart2 = refs && mediaEl === refs.videoPart2;
        gainNode.gain.value = isTrilha || isPart2 ? 0 : 1;
        source.connect(gainNode);
        gainNode.connect(audioDestination);
        gainNode.connect(audioContext.destination);
        audioSources.push(source);
        audioSources.push(gainNode);
        if (isPart1) part1GainNode = gainNode;
        if (isTrilha) trilhaGainNode = gainNode;
        if (isPart2) part2GainNode = gainNode;
      } catch (e) {
        // Pode falhar se a source já foi criada antes para o mesmo element.
      }
    });

    const mixedTracks = audioDestination.stream.getAudioTracks();
    if (mixedTracks && mixedTracks.length > 0) {
      targetStream.addTrack(mixedTracks[0]);
    }
  }

  function addAudioTrackIfAvailable(targetStream, mediaEl) {
    if (!mediaEl || !mediaEl.captureStream) return;
    try {
      const stream = mediaEl.captureStream();
      const tracks = stream.getAudioTracks();
      if (tracks && tracks.length > 0) {
        targetStream.addTrack(tracks[0]);
      }
    } catch (e) {}
  }

  function playMediaElement(mediaEl) {
    if (!mediaEl) return;
    const attemptPlay = () => {
      mediaEl.play().catch(() => {});
    };
    if (mediaEl.readyState >= 2) {
      attemptPlay();
      return;
    }
    mediaEl.addEventListener('canplay', attemptPlay, { once: true });
    try {
      mediaEl.load();
    } catch (e) {}
  }

  function setupMediaRecorder(canvas, videoPart1, audioTrack, videoPart2) {
    canvasStream = canvas.captureStream(30);
    setupMixedAudioTrack(canvasStream, [videoPart1, audioTrack, videoPart2], {
      videoPart1,
      audioTrack,
      videoPart2
    });
    if (canvasStream.getAudioTracks().length === 0) {
      addAudioTrackIfAvailable(canvasStream, videoPart1);
      addAudioTrackIfAvailable(canvasStream, audioTrack);
      addAudioTrackIfAvailable(canvasStream, videoPart2);
    }

    const options = {
      videoBitsPerSecond: 5000000
    };

    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options.mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      }
    }

    mediaRecorder = new MediaRecorder(canvasStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const resolve = currentResolve;

        cleanup();

        if (resolve) {
          resolve({ blob });
        }
      } catch (e) {
        const reject = currentReject;
        cleanup();
        if (reject) {
          reject(e);
        }
      }
    };

    mediaRecorder.onerror = (e) => {
      const reject = currentReject;
      cleanup();
      if (reject) {
        reject(e.error || e);
      }
    };
  }

  function stopRecordingInternal() {
    if (!isRecording) return;
    isRecording = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (renderIntervalId) {
      clearInterval(renderIntervalId);
      renderIntervalId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {}
    }
  }

  function cleanup() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (renderIntervalId) {
      clearInterval(renderIntervalId);
      renderIntervalId = null;
    }

    if (canvasStream) {
      const tracks = canvasStream.getTracks();
      tracks.forEach((t) => t.stop());
      canvasStream = null;
    }
    cleanupAudio();

    if (state && state.videoPart1) {
      state.videoPart1.pause();
      state.videoPart1.currentTime = 0;
      state.videoPart1.onended = null;
    }
    if (state && state.audioTrack) {
      state.audioTrack.pause();
      state.audioTrack.currentTime = 0;
    }
    if (state && state.videoPart2) {
      state.videoPart2.pause();
      state.videoPart2.currentTime = 0;
      state.videoPart2.onended = null;
    }

    mediaRecorder = null;
    recordedChunks = [];
    isRecording = false;
    startTimestamp = null;
    startedVideoPlayback = false;
    expectedVideoDuration = null;
    part1Duration = 0;
    part2Duration = 0;
    photoSegmentStarted = false;
    part1PausedAfterIntro = false;
    trilhaStarted = false;
    trilhaPreRoll = false;
    photoPhaseSeconds = INTRO_TOTAL_SECONDS;
    trilhaFadeOutScheduled = false;
    part2CrossfadeFreezeDone = false;
    part2Primed = false;
    part2Started = false;
    currentResolve = null;
    currentReject = null;
    state = null;
  }

  function drawPhotoWithEffects(ctx, canvas, image, zoomScale, blurAmount) {
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = image.width;
    const ih = image.height;

    // Cobre o canvas inteiro (object-fit: cover), com zoom opcional a partir do centro
    const baseScale = Math.max(cw / iw, ch / ih);
    const scale = baseScale * (zoomScale || 1);
    const dw = iw * scale;
    const dh = ih * scale;
    const x = (cw - dw) / 2;
    const y = (ch - dh) / 2;

    ctx.save();

    if (typeof ctx.filter !== 'undefined' && blurAmount > 0) {
      ctx.filter = `blur(${blurAmount}px)`;
    }

    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();
    ctx.drawImage(image, 0, 0, iw, ih, x, y, dw, dh);

    ctx.restore();
    ctx.filter = 'none';
  }

  function renderTypingName(ctx, canvas, collaboratorName, elapsedSeconds) {
    const w = canvas.width;
    const h = canvas.height;

    let visibleText = '';
    const name = collaboratorName || 'Colaborador';

    if (
      elapsedSeconds >= NAME_TYPING_START_SECONDS &&
      elapsedSeconds <= NAME_TYPING_START_SECONDS + NAME_TYPING_SECONDS
    ) {
      const t =
        (elapsedSeconds - NAME_TYPING_START_SECONDS) / NAME_TYPING_SECONDS;
      const chars = Math.floor(clamp(t, 0, 1) * name.length);
      visibleText = name.slice(0, chars);
    } else if (elapsedSeconds > NAME_TYPING_START_SECONDS + NAME_TYPING_SECONDS) {
      visibleText = name;
    }

    const baseY = h * 0.78;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d9d9d6';
    ctx.font = '56px Arial';
    ctx.fillText('Bem-vindo', w / 2, baseY);

    ctx.fillStyle = '#b4aa98';
    ctx.font = '48px Arial';
    ctx.fillText(visibleText, w / 2, baseY + 70);
  }

  /**
   * Dissolve PT1 → foto: sempre uma camada em 100% evita washout/branco no meio.
   */
  function renderPt1PhotoCrossfade(
    ctx,
    canvas,
    videoPart1,
    image,
    photoBlend
  ) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    if (photoBlend <= 0.5) {
      if (videoPart1) {
        try {
          ctx.drawImage(videoPart1, 0, 0, w, h);
        } catch (e) {}
      }
      if (image && photoBlend > 0.002) {
        ctx.save();
        ctx.globalAlpha = photoBlend * 2;
        drawPhotoWithEffects(ctx, canvas, image, ZOOM_START_SCALE, 0);
        ctx.restore();
      }
    } else {
      if (image) {
        drawPhotoWithEffects(ctx, canvas, image, ZOOM_START_SCALE, 0);
      }
      if (videoPart1) {
        ctx.save();
        ctx.globalAlpha = (1 - photoBlend) * 2;
        try {
          ctx.drawImage(videoPart1, 0, 0, w, h);
        } catch (e) {}
        ctx.restore();
      }
    }
  }

  /**
   * Crossfade foto → vídeo 2: mesmo padrão que PT1 → foto (camada dominante, evita washout).
   */
  function renderPhotoVideo2Crossfade(
    ctx,
    canvas,
    image,
    videoPart2,
    introElapsed,
    videoBlend,
    options
  ) {
    const w = canvas.width;
    const h = canvas.height;
    const opts = options || {};
    const skipInitialFade = !!opts.skipInitialFade;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const fadeInT = skipInitialFade
      ? 1
      : clamp(introElapsed / INTRO_FADE_IN_SECONDS, 0, 1);
    const zoomT = clamp(introElapsed / ZOOM_TOTAL_SECONDS, 0, 1);
    const zoomScale = lerp(ZOOM_START_SCALE, ZOOM_END_SCALE, zoomT);

    if (videoBlend <= 0.5) {
      if (image) {
        ctx.save();
        ctx.globalAlpha = fadeInT;
        drawPhotoWithEffects(ctx, canvas, image, zoomScale, 0);
        ctx.restore();
      }
      if (videoPart2 && videoBlend > 0.002) {
        ctx.save();
        ctx.globalAlpha = videoBlend * 2;
        try {
          ctx.drawImage(videoPart2, 0, 0, w, h);
        } catch (e) {}
        ctx.restore();
      }
    } else {
      if (videoPart2) {
        try {
          ctx.drawImage(videoPart2, 0, 0, w, h);
        } catch (e) {}
      }
      if (image && (1 - videoBlend) > 0.002) {
        ctx.save();
        ctx.globalAlpha = (1 - videoBlend) * 2 * fadeInT;
        drawPhotoWithEffects(ctx, canvas, image, zoomScale, 0);
        ctx.restore();
      }
    }
  }

  function renderIntro(
    ctx,
    canvas,
    image,
    collaboratorName,
    elapsedSeconds,
    options
  ) {
    const opts = options || {};
    const skipInitialFade = !!opts.skipInitialFade;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const fadeInT = skipInitialFade
      ? 1
      : clamp(elapsedSeconds / INTRO_FADE_IN_SECONDS, 0, 1);

    let zoomT = clamp(elapsedSeconds / ZOOM_TOTAL_SECONDS, 0, 1);
    const zoomScale = lerp(ZOOM_START_SCALE, ZOOM_END_SCALE, zoomT);

    let globalAlpha = fadeInT;

    if (image) {
      ctx.save();
      ctx.globalAlpha = globalAlpha;
      drawPhotoWithEffects(ctx, canvas, image, zoomScale, 0);
      ctx.restore();
    }
  }

  function renderInstitutionalVideo(ctx, canvas, institutionalVideo) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    if (!institutionalVideo) return;

    try {
      ctx.drawImage(institutionalVideo, 0, 0, w, h);
    } catch (e) {}
  }

  function renderFrame(timestamp) {
    if (!isRecording || !state) return;

    const {
      canvas,
      ctx,
      image,
      collaboratorName,
      videoPart1,
      audioTrack,
      videoPart2,
      onProgress
    } = state;

    if (!startTimestamp) {
      startTimestamp = timestamp;
    }

    const elapsedSeconds = (timestamp - startTimestamp) / 1000;

    const totalExpected = part1Duration + photoPhaseSeconds + part2Duration;

    let progress = clamp(elapsedSeconds / totalExpected, 0, 0.99);

    const crossfadeDur = Math.min(
      PT1_PHOTO_CROSSFADE_S,
      Math.max(0, part1Duration - 0.1)
    );
    const crossfadeStart =
      crossfadeDur > 0.04 ? part1Duration - crossfadeDur : part1Duration;

    if (elapsedSeconds < part1Duration) {
      if (!startedVideoPlayback) {
        startedVideoPlayback = true;
        if (videoPart1.readyState >= 2) {
          videoPart1.play().catch(() => {});
        } else {
          videoPart1.addEventListener('canplay', () => videoPart1.play().catch(() => {}), {
            once: true
          });
        }
      }
      if (!part2Primed && videoPart2 && elapsedSeconds >= PART2_PREROLL_ELAPSED_S) {
        part2Primed = true;
        const oldMuted = videoPart2.muted;
        videoPart2.muted = true;
        videoPart2.currentTime = 0;
        videoPart2
          .play()
          .then(() => {
            try {
              videoPart2.pause();
              videoPart2.currentTime = 0;
            } catch (e) {}
            videoPart2.muted = oldMuted;
          })
          .catch(() => {
            videoPart2.muted = oldMuted;
          });
      }
      if (elapsedSeconds < crossfadeStart) {
        setGainValue(part1GainNode, 1, 0);
        setGainValue(trilhaGainNode, 0, 0);
        setGainValue(part2GainNode, 0, 0);
        renderInstitutionalVideo(ctx, canvas, videoPart1);
      } else {
        const rawT =
          crossfadeDur > 0.001
            ? (elapsedSeconds - crossfadeStart) / crossfadeDur
            : 1;
        const photoBlend = smoothstep01(rawT);
        setGainValue(part1GainNode, 1, 0);
        setGainValue(trilhaGainNode, 0, 0);
        setGainValue(part2GainNode, 0, 0);
        renderPt1PhotoCrossfade(ctx, canvas, videoPart1, image, photoBlend);
      }
    } else if (elapsedSeconds < part1Duration + photoPhaseSeconds) {
      const introElapsed = elapsedSeconds - part1Duration;
      if (!photoSegmentStarted) {
        photoSegmentStarted = true;
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
        if (audioTrack) {
          trilhaPreRoll = true;
          audioTrack.loop = false;
          audioTrack.currentTime = TRILHA_START_OFFSET_S;
          playMediaElement(audioTrack);
          setGainValue(
            trilhaGainNode,
            TRILHA_AMBIENT_HOLD_GAIN,
            TRILHA_AMBIENT_RAMP_S
          );
        }
      }
      const trilhaStartAt =
        PHOTO_TRILHA_DELAY_S + PT1_AUDIO_HOLD_BEFORE_TRILHA_S;
      const part1PauseAfter =
        trilhaStartAt + PT1_TRILHA_AUDIO_BRIDGE_S + 0.06;
      if (!part1PausedAfterIntro && introElapsed >= part1PauseAfter) {
        part1PausedAfterIntro = true;
        if (videoPart1) {
          try {
            videoPart1.pause();
          } catch (e) {}
        }
      }
      if (!trilhaStarted && introElapsed >= trilhaStartAt) {
        trilhaStarted = true;
        if (audioTrack) {
          if (!trilhaPreRoll) {
            audioTrack.loop = false;
            audioTrack.currentTime = TRILHA_START_OFFSET_S;
            playMediaElement(audioTrack);
          }
          scheduleSmoothPt1TrilhaHandoff(PT1_TRILHA_AUDIO_BRIDGE_S);
        } else {
          setGainValue(part1GainNode, 0, AUDIO_FADE_INTO_PHOTO_S);
        }
      }
      if (
        audioTrack &&
        trilhaGainNode &&
        !trilhaFadeOutScheduled &&
        introElapsed >= photoPhaseSeconds - TRILHA_FINALE_FADE_S
      ) {
        trilhaFadeOutScheduled = true;
        setGainValue(trilhaGainNode, 0, TRILHA_FINALE_FADE_S);
      }
      const crossfadeStartIntro = photoPhaseSeconds - PHOTO_PT2_CROSSFADE_S;
      if (
        introElapsed >= crossfadeStartIntro &&
        videoPart2 &&
        videoPart2.readyState >= 2
      ) {
        if (!part2CrossfadeFreezeDone) {
          part2CrossfadeFreezeDone = true;
          try {
            videoPart2.pause();
            videoPart2.currentTime = 0;
          } catch (e) {}
        }
        const rawT =
          PHOTO_PT2_CROSSFADE_S > 0.001
            ? (introElapsed - crossfadeStartIntro) / PHOTO_PT2_CROSSFADE_S
            : 1;
        const videoBlend = smoothstep01(rawT);
        renderPhotoVideo2Crossfade(
          ctx,
          canvas,
          image,
          videoPart2,
          introElapsed,
          videoBlend,
          { skipInitialFade: crossfadeDur > 0.04 }
        );
      } else if (!part2Primed && videoPart2 && introElapsed >= 0.2) {
        part2Primed = true;
        const oldMuted = videoPart2.muted;
        videoPart2.muted = true;
        videoPart2.currentTime = 0;
        videoPart2
          .play()
          .then(() => {
            try {
              videoPart2.pause();
              videoPart2.currentTime = 0;
            } catch (e) {}
            videoPart2.muted = oldMuted;
          })
          .catch(() => {
            videoPart2.muted = oldMuted;
          });
      }
      if (
        introElapsed < crossfadeStartIntro ||
        (introElapsed >= crossfadeStartIntro && (!videoPart2 || videoPart2.readyState < 2))
      ) {
        const skipIntroFadeOpt = { skipInitialFade: crossfadeDur > 0.04 };
        renderIntro(
          ctx,
          canvas,
          image,
          collaboratorName,
          introElapsed,
          skipIntroFadeOpt
        );
      }
    } else {
      const sincePart2Start =
        elapsedSeconds - part1Duration - photoPhaseSeconds;

      if (!part2Started) {
        part2Started = true;
        const playVideo = () => {
          try {
            if (audioTrack) {
              audioTrack.pause();
              audioTrack.currentTime = 0;
            }
          } catch (e) {}
          setGainValue(trilhaGainNode, 0, 0);
          setGainValue(part2GainNode, 0, 0);
          try {
            videoPart2.pause();
            videoPart2.currentTime = 0;
          } catch (e) {}
          videoPart2.play().catch(() => {});
          if (audioTrack) {
            setGainValue(part2GainNode, 1, 0.05);
          } else {
            setGainValue(part2GainNode, 1, PART2_SOLO_AUDIO_FADE_S);
          }
        };
        if (videoPart2.readyState >= 2) {
          playVideo();
        } else {
          videoPart2.addEventListener('canplay', () => playVideo(), { once: true });
        }
        videoPart2.onended = () => {
          stopRecordingInternal();
        };
      }

      if (videoPart2 && videoPart2.readyState >= 2) {
        renderInstitutionalVideo(ctx, canvas, videoPart2);
      } else {
        const lastIntroElapsed = photoPhaseSeconds - 0.001;
        renderIntro(ctx, canvas, image, collaboratorName, lastIntroElapsed, {
          skipInitialFade: true
        });
      }

      if (part2Duration) {
        const clampedVideoTime = clamp(
          sincePart2Start,
          0,
          part2Duration
        );
        progress = clamp(
          (part1Duration + photoPhaseSeconds + clampedVideoTime) / totalExpected,
          0,
          0.999
        );
      }
    }

    if (typeof onProgress === 'function') {
      onProgress(progress);
    }

  }

  function startRenderLoop() {
    if (renderIntervalId) {
      clearInterval(renderIntervalId);
      renderIntervalId = null;
    }
    const intervalMs = 1000 / 30;
    renderIntervalId = setInterval(() => {
      if (!isRecording) return;
      renderFrame(performance.now());
    }, intervalMs);
  }

  async function startRecording(options) {
    const {
      canvas,
      videoPart1,
      audioTrack,
      videoPart2,
      image,
      collaboratorName,
      format,
      onProgress
    } = options;

    if (!canvas || !image) {
      throw new Error(
        'Canvas ou imagem do colaborador ausentes.'
      );
    }

    const d1 = await getDurationSafe(videoPart1);
    const d2 = await getDurationSafe(videoPart2);
    if (d1 <= 0 || d2 <= 0) {
      throw new Error(
        'Arquivos obrigatórios não encontrados ou inválidos: VIDEO PT1.mp4 e VIDEO PT2.mp4.'
      );
    }
    part1Duration = d1;
    part2Duration = d2;

    let trilhaPlayable = 0;
    if (audioTrack) {
      const td = await getDurationSafe(audioTrack);
      const off = TRILHA_START_OFFSET_S;
      trilhaPlayable = td > off ? td - off : Math.max(0, td);
    }
    const rawPhotoPhase =
      audioTrack && trilhaPlayable > 0.08
        ? trilhaPlayable + PHOTO_TRILHA_BUFFER_S
        : INTRO_TOTAL_SECONDS;
    photoPhaseSeconds = clamp(rawPhotoPhase, PHOTO_MIN_DISPLAY_S, PHOTO_MAX_DISPLAY_S);

    expectedVideoDuration = part1Duration + photoPhaseSeconds + part2Duration;

    configureCanvasForFormat(canvas, format || 'linkedin');

    const ctx = canvas.getContext('2d');

    state = {
      canvas,
      ctx,
      image,
      collaboratorName: collaboratorName || 'Colaborador',
      videoPart1,
      audioTrack,
      videoPart2,
      onProgress: typeof onProgress === 'function' ? onProgress : null
    };

    if (videoPart2) {
      try {
        videoPart2.preload = 'auto';
        videoPart2.load();
      } catch (e) {}
    }
    setupMediaRecorder(canvas, videoPart1, audioTrack, videoPart2);
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return new Promise((resolve, reject) => {
      currentResolve = resolve;
      currentReject = reject;

      try {
        isRecording = true;
        startTimestamp = null;
        startedVideoPlayback = false;
        photoSegmentStarted = false;
        part1PausedAfterIntro = false;
        trilhaStarted = false;
        trilhaPreRoll = false;
        trilhaFadeOutScheduled = false;
        part2CrossfadeFreezeDone = false;
        part2Primed = false;
        part2Started = false;

        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        mediaRecorder.start();
        renderFrame(performance.now());
        startRenderLoop();
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  }

  function stopRecording() {
    stopRecordingInternal();
  }

  window.VideoRenderer = {
    renderIntro,
    renderPt1PhotoCrossfade,
    renderTypingName,
    renderInstitutionalVideo,
    startRecording,
    stopRecording
  };
})();

