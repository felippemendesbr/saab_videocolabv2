(() => {
  /**
   * Durações oficiais dos masters (timecode HH:MM:SS:FF → segundos).
   * Ajuste SOURCE_TIMECODE_FPS se seus arquivos forem 24, 30 ou 29.97.
   */
  const SOURCE_TIMECODE_FPS = 25;
  function tcToSeconds(ss, ff) {
    return ss + ff / SOURCE_TIMECODE_FPS;
  }
  /** Parte 1 — 00:00:18:01 */
  const PART1_DURATION_S = tcToSeconds(18, 1);
  /** Trilha (áudio da foto) — 00:00:01:20 */
  const TRILHA_FILE_DURATION_S = tcToSeconds(1, 20);
  /** Parte 2 — 00:00:49:14 */
  const PART2_DURATION_S = tcToSeconds(49, 14);

  /**
   * Fallback quando não há trilha: duração fixa da fase foto (nome, zoom, etc.).
   */
  const INTRO_TOTAL_SECONDS = 2.35;
  const INTRO_FADE_IN_SECONDS = 0.5;
  /** Trecho da foto após o fade-in (sem efeito extra no fim — corte direto para o PT2). */
  const INTRO_DISPLAY_SECONDS =
    INTRO_TOTAL_SECONDS - INTRO_FADE_IN_SECONDS;

  /** Atraso curto para trilha entrar sem "buraco" perceptível. */
  const PHOTO_TRILHA_DELAY_S = 0.01;
  /** Continuidade visual no corte timeline PT1→foto (evita 1 frame “quase foto” vs renderIntro). */
  const PT1_TO_PHOTO_VISUAL_SEAM_S = 0.12;

  /**
   * Dissolução PT1 → foto (visual). PT1 no master já inclui “aprender” completo — pode ser um pouco mais longa.
   */
  const PT1_PHOTO_CROSSFADE_S = 0.82;
  /**
   * Crossfade áudio PT1 → trilha (equal-power, ganho final 1 — volume alinhado com PT1/PT2).
   */
  const PT1_TRILHA_AUDIO_BRIDGE_S = 0.72;
  /**
   * Só PT1 audível na foto até iniciar o crossfade com a trilha (palavra completa no PT1 → hold mais curto).
   */
  const PT1_AUDIO_HOLD_BEFORE_TRILHA_S = 0.4;
  /**
   * Seek no início da trilha (s). Manter 0: a fala “e construir juntas” vem ~1s depois no arquivo.
   */
  const TRILHA_START_OFFSET_S = 0;
  const AUDIO_FADE_INTO_PHOTO_S = 0.16;
  /** Margem mínima para imprecisão de metadados da trilha (evita cortar áudio antes do fim). */
  const PHOTO_TRILHA_BUFFER_S = 0.03;
  /** Fade curto do PT2 ao entrar para transição natural trilha → vídeo (evita corte seco ou mudo). */
  const PHOTO_PT2_AUDIO_FADE_S = 0.1;
  /** Crossfade foto → PT2 (visual + áudio). Um pouco mais longo = menos corte seco. */
  const PHOTO_PT2_CROSSFADE_S = 0.88;
  /**
   * O blend visual chega a 100% vídeo antes do fim da janela (últimos % só PT2 na fase foto),
   * para coincidir com o primeiro frame da fase PT2 e não “pular” foto→vídeo.
   */
  const PHOTO_PT2_VISUAL_BLEND_COMPLETE = 0.86;
  /**
   * Áudio + play do PT2 começam antes da dissolução visual: a fala no 00:00 descodifica
   * com a foto ainda em ecrã (ganho em crossfade), reduzindo travada no primeiro frame visível.
   */
  const PHOTO_PT2_AUDIO_LEAD_S = 0.22;
  /** Segundos após início da gravação para pré-decode do PT2 (quanto mais cedo, mais tempo para carregar). */
  const PART2_PREROLL_ELAPSED_S = 1.5;
  /** Sem trilha: sobe o áudio do PT2 com fade curto */
  const PART2_SOLO_AUDIO_FADE_S = 0.28;

  /**
   * Duração em segundos da fase “foto” na linha do tempo (relógio da gravação).
   * Inclui tempo até a trilha estabilizar + duração do arquivo de trilha + margem + crossfade para o PT2.
   */
  function computePhotoPhaseSeconds(hasTrilha) {
    if (!hasTrilha) {
      return INTRO_TOTAL_SECONDS;
    }
    const trilhaStartAt = PHOTO_TRILHA_DELAY_S + PT1_AUDIO_HOLD_BEFORE_TRILHA_S;
    return (
      trilhaStartAt +
      TRILHA_FILE_DURATION_S +
      PHOTO_TRILHA_BUFFER_S +
      PHOTO_PT2_CROSSFADE_S
    );
  }

  const NAME_TYPING_SECONDS = 1.5;
  const NAME_TYPING_START_SECONDS = 0.5;

  const ZOOM_TOTAL_SECONDS = 2;
  const ZOOM_START_SCALE = 1.0;
  const ZOOM_END_SCALE = 1.08;

  const BG_COLOR = '#373737';

  /** Alinhar captura ao rAF (~60 Hz) reduz “engasgos” nas dissoluções vs setInterval 30 Hz. */
  const CANVAS_CAPTURE_FPS = 60;

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
  /** Duração da fase foto (trilha até o fim, ou INTRO_TOTAL_SECONDS sem trilha). */
  let photoPhaseSeconds = INTRO_TOTAL_SECONDS;
  /** Áudio trilha→PT2 já agendado no início do crossfade visual. */
  let part2CrossfadeAudioStarted = false;
  let part2Primed = false;
  let part2Started = false;
  /** Evita atualizar UI a cada frame (menos trabalho na main thread nas transições). */
  let lastProgressEmitT = 0;
  const PROGRESS_EMIT_INTERVAL_MS = 72;

  let eqPowerOutCurve = new Float32Array(128);
  let eqPowerInCurve = new Float32Array(128);

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

  /** Ken Perlin — caudas mais suaves que smoothstep (bom para dissolves longos). */
  function smootherstep01(t) {
    const x = clamp(t, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  /**
   * Crossfade em potência aproximadamente constante (evita “buraco” de volume no meio do cruzamento).
   * Ganhos finais em 1.0 para manter nível alinhado entre PT1, trilha e PT2.
   */
  function scheduleEqualPowerCrossfade(outGainNode, inGainNode, durationSeconds) {
    if (!audioContext || !outGainNode || !inGainNode) return;
    const dur = clamp(durationSeconds, 0.22, 1.35);
    const now = audioContext.currentTime;
    const n = 128;
    const o0 = clamp(outGainNode.gain.value, 0, 1);
    const i0 = clamp(inGainNode.gain.value, 0, 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const co = Math.cos((Math.PI / 2) * t);
      const si = Math.sin((Math.PI / 2) * t);
      eqPowerOutCurve[i] = clamp(o0 * co, 0, 1);
      eqPowerInCurve[i] = clamp(i0 + (1 - i0) * si, 0, 1);
    }
    try {
      outGainNode.gain.cancelScheduledValues(now);
      inGainNode.gain.cancelScheduledValues(now);
      outGainNode.gain.setValueCurveAtTime(eqPowerOutCurve, now, dur);
      inGainNode.gain.setValueCurveAtTime(eqPowerInCurve, now, dur);
    } catch (e) {
      setGainValue(outGainNode, 0, dur);
      setGainValue(inGainNode, 1, dur);
    }
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

  /** PT1 → trilha: equal-power, sem boost >1 na trilha (volume equilibrado). */
  function scheduleSmoothPt1TrilhaHandoff(bridgeSeconds) {
    if (!audioContext || !part1GainNode || !trilhaGainNode) return;
    const bridgeTotal = clamp(bridgeSeconds, 0.28, 0.95);
    scheduleEqualPowerCrossfade(part1GainNode, trilhaGainNode, bridgeTotal);
  }

  /**
   * Trilha → PT2: mesmo intervalo do blend visual; equal-power para volume estável no cruzamento.
   */
  function scheduleTrilhaPart2Handoff(crossfadeSeconds) {
    if (!audioContext || !trilhaGainNode || !part2GainNode) return;
    const dur = clamp(crossfadeSeconds, 0.22, 1.55);
    scheduleEqualPowerCrossfade(trilhaGainNode, part2GainNode, dur);
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
    photoPhaseSeconds = INTRO_TOTAL_SECONDS;
    part2CrossfadeAudioStarted = false;
    part2Primed = false;
    part2Started = false;
    lastProgressEmitT = 0;
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
   * PT1 → foto: vídeo opaco em baixo, foto por cima com alfa = photoBlend.
   * Resultado = foto·b + vídeo·(1−b), sem troca de camada dominante no meio (evita piscada).
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
    const b = clamp(photoBlend, 0, 1);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    if (videoPart1) {
      try {
        ctx.drawImage(videoPart1, 0, 0, w, h);
      } catch (e) {}
    }
    if (image && b > 0.001) {
      ctx.save();
      ctx.globalAlpha = b;
      drawPhotoWithEffects(ctx, canvas, image, ZOOM_START_SCALE, 0);
      ctx.restore();
    }
  }

  /**
   * Foto → PT2: vídeo opaco em baixo, foto por cima com alfa (1−vb)·fadeIn.
   * Mesma lógica que PT1→foto: mistura linear real, menos piscada na troca de fase.
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

    const vb = clamp(videoBlend, 0, 1);
    const photoTopAlpha = (1 - vb) * fadeInT;

    if (videoPart2) {
      try {
        ctx.drawImage(videoPart2, 0, 0, w, h);
      } catch (e) {}
    }
    if (image && photoTopAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = photoTopAlpha;
      drawPhotoWithEffects(ctx, canvas, image, zoomScale, 0);
      ctx.restore();
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

    /* Na foto: PT2 toca PHOTO_PT2_AUDIO_LEAD_S (pré-roll) + PHOTO_PT2_CROSSFADE_S — não repetir na cauda. */
    const part2OverlapInPhoto =
      PHOTO_PT2_CROSSFADE_S + PHOTO_PT2_AUDIO_LEAD_S;
    const part2TimelineTail =
      videoPart2 && part2Duration > part2OverlapInPhoto + 0.02
        ? part2Duration - part2OverlapInPhoto
        : part2Duration;
    const totalExpected =
      part1Duration + photoPhaseSeconds + Math.max(0.05, part2TimelineTail);

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
        const photoBlend = smootherstep01(rawT);
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
          audioTrack.loop = false;
          /* Não dar play() ainda: senão currentTime avança mudo e o “r” no início do arquivo
           * passa antes do handoff → micro-silêncio após “aprender”. */
          setGainValue(trilhaGainNode, 0, 0);
          try {
            audioTrack.pause();
            audioTrack.currentTime = TRILHA_START_OFFSET_S;
          } catch (e) {}
        }
      }
      const trilhaStartAt =
        PHOTO_TRILHA_DELAY_S + PT1_AUDIO_HOLD_BEFORE_TRILHA_S;
      const part1PauseAfter =
        trilhaStartAt + PT1_TRILHA_AUDIO_BRIDGE_S + 0.06;
      if (!part1PausedAfterIntro && introElapsed >= part1PauseAfter) {
        part1PausedAfterIntro = true;
        const v1 = videoPart1;
        /* pause() no mesmo tick do desenho pode travar o descodificador — adiar 1 frame. */
        requestAnimationFrame(() => {
          if (!isRecording || !v1) return;
          try {
            v1.pause();
          } catch (e) {}
        });
      }
      if (!trilhaStarted && introElapsed >= trilhaStartAt) {
        trilhaStarted = true;
        if (audioTrack) {
          audioTrack.currentTime = TRILHA_START_OFFSET_S;
          playMediaElement(audioTrack);
          scheduleSmoothPt1TrilhaHandoff(PT1_TRILHA_AUDIO_BRIDGE_S);
        } else {
          setGainValue(part1GainNode, 0, AUDIO_FADE_INTO_PHOTO_S);
        }
      }
      const crossfadeStartIntro = photoPhaseSeconds - PHOTO_PT2_CROSSFADE_S;
      const audioHandoffIntro = Math.max(
        0,
        crossfadeStartIntro - PHOTO_PT2_AUDIO_LEAD_S
      );
      const pt2AudioCrossfadeDur = Math.max(
        0.28,
        PHOTO_PT2_CROSSFADE_S + PHOTO_PT2_AUDIO_LEAD_S
      );

      if (
        introElapsed >= audioHandoffIntro &&
        videoPart2 &&
        videoPart2.readyState >= 2
      ) {
        if (!part2CrossfadeAudioStarted) {
          part2CrossfadeAudioStarted = true;
          part2Primed = true;
          try {
            videoPart2.currentTime = 0;
            videoPart2.play().catch(() => {});
          } catch (e) {}
          if (audioTrack && trilhaGainNode && part2GainNode) {
            scheduleTrilhaPart2Handoff(pt2AudioCrossfadeDur);
          } else {
            setGainValue(trilhaGainNode, 0, pt2AudioCrossfadeDur);
            setGainValue(part2GainNode, 1, pt2AudioCrossfadeDur);
          }
        }
      }

      if (
        introElapsed >= crossfadeStartIntro &&
        videoPart2 &&
        videoPart2.readyState >= 2
      ) {
        const visWin = Math.max(0.08, PHOTO_PT2_CROSSFADE_S * PHOTO_PT2_VISUAL_BLEND_COMPLETE);
        const rawT =
          visWin > 0.001
            ? clamp(
                (introElapsed - crossfadeStartIntro) / visWin,
                0,
                1
              )
            : 1;
        const videoBlend = smootherstep01(rawT);
        renderPhotoVideo2Crossfade(
          ctx,
          canvas,
          image,
          videoPart2,
          introElapsed,
          videoBlend,
          { skipInitialFade: crossfadeDur > 0.04 }
        );
      } else if (
        !part2Primed &&
        videoPart2 &&
        introElapsed >= 0.2 &&
        introElapsed < audioHandoffIntro
      ) {
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
      const needPhotoStillOrIntro =
        introElapsed < crossfadeStartIntro ||
        (introElapsed >= crossfadeStartIntro &&
          (!videoPart2 || videoPart2.readyState < 2));
      if (needPhotoStillOrIntro) {
        const skipIntroFadeOpt = { skipInitialFade: crossfadeDur > 0.04 };
        if (
          introElapsed < PT1_TO_PHOTO_VISUAL_SEAM_S &&
          videoPart1
        ) {
          renderPt1PhotoCrossfade(ctx, canvas, videoPart1, image, 1);
        } else {
          renderIntro(
            ctx,
            canvas,
            image,
            collaboratorName,
            introElapsed,
            skipIntroFadeOpt
          );
        }
      }
    } else {
      const sincePart2Start =
        elapsedSeconds - part1Duration - photoPhaseSeconds;

      if (!part2Started) {
        part2Started = true;
        const playVideo = () => {
          try {
            if (audioTrack) {
              if (part2CrossfadeAudioStarted) {
                /* pause() no elemento corta o MediaElementSource na hora — mata o fim do
                 * crossfade e pode gerar mudo. Só pausar a trilha um pouco depois. */
                window.setTimeout(() => {
                  try {
                    audioTrack.pause();
                    audioTrack.currentTime = 0;
                  } catch (e2) {}
                }, 380);
              } else {
                audioTrack.pause();
                audioTrack.currentTime = 0;
              }
            }
          } catch (e) {}
          if (part2CrossfadeAudioStarted) {
            /* Não chamar setGainValue aqui: cancelScheduledValues cortaria o fim da curva
             * equal-power e causa micro-mudo entre trilha e PT2. */
            if (videoPart2.paused) {
              videoPart2.play().catch(() => {});
            }
          } else {
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

      if (part2TimelineTail > 0) {
        const clampedWall = clamp(sincePart2Start, 0, part2TimelineTail);
        progress = clamp(
          (part1Duration + photoPhaseSeconds + clampedWall) / totalExpected,
          0,
          0.999
        );
      }
    }

    /* Fim da linha do tempo (masters fixos) — fallback se `onended` do PT2 não disparar. */
    if (elapsedSeconds >= totalExpected - 0.01) {
      stopRecordingInternal();
    }

    if (typeof onProgress === 'function') {
      if (timestamp - lastProgressEmitT >= PROGRESS_EMIT_INTERVAL_MS) {
        lastProgressEmitT = timestamp;
        onProgress(progress);
      }
    }

  }

  function startRenderLoop() {
    if (renderIntervalId) {
      clearInterval(renderIntervalId);
      renderIntervalId = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    const loop = (ts) => {
      if (!isRecording) {
        animationFrameId = null;
        return;
      }
      renderFrame(ts);
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
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

    part1Duration = PART1_DURATION_S;
    part2Duration = PART2_DURATION_S;

    let hasTrilha = false;
    let trilhaMeta = 0;
    if (audioTrack) {
      trilhaMeta = await getDurationSafe(audioTrack);
      const off = TRILHA_START_OFFSET_S;
      const playable = trilhaMeta > off ? trilhaMeta - off : Math.max(0, trilhaMeta);
      hasTrilha = playable > 0.08;
    }
    photoPhaseSeconds = computePhotoPhaseSeconds(hasTrilha && !!audioTrack);

    if (Math.abs(d1 - PART1_DURATION_S) > 0.75) {
      console.warn(
        '[VideoRenderer] Metadados PT1:',
        d1,
        's — master em',
        PART1_DURATION_S,
        's @',
        SOURCE_TIMECODE_FPS,
        'fps'
      );
    }
    if (Math.abs(d2 - PART2_DURATION_S) > 0.75) {
      console.warn(
        '[VideoRenderer] Metadados PT2:',
        d2,
        's — master em',
        PART2_DURATION_S,
        's @',
        SOURCE_TIMECODE_FPS,
        'fps'
      );
    }
    if (audioTrack && trilhaMeta > 0 && Math.abs(trilhaMeta - TRILHA_FILE_DURATION_S) > 0.75) {
      console.warn(
        '[VideoRenderer] Metadados trilha:',
        trilhaMeta,
        's — master em',
        TRILHA_FILE_DURATION_S,
        's @',
        SOURCE_TIMECODE_FPS,
        'fps'
      );
    }

    const part2OverlapPlan =
      PHOTO_PT2_CROSSFADE_S + PHOTO_PT2_AUDIO_LEAD_S;
    const part2PlannedTail =
      videoPart2 && part2Duration > part2OverlapPlan + 0.02
        ? part2Duration - part2OverlapPlan
        : part2Duration;
    expectedVideoDuration =
      part1Duration + photoPhaseSeconds + Math.max(0.05, part2PlannedTail);

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
        part2CrossfadeAudioStarted = false;
        part2Primed = false;
        part2Started = false;
        lastProgressEmitT = 0;

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

