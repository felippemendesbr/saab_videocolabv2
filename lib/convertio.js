const CONVERTIO_BASE = 'https://api.convertio.co';

/**
 * Converte buffer WebM para MP4 via API Convert.io (upload + polling).
 * @param {Buffer} webmBuffer
 * @param {string} apiKey
 * @returns {Promise<Buffer>}
 */
async function convertWebmToMp4Buffer(webmBuffer, apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('CONVERTIO_API_KEY não configurada.');
  }

  const filename = 'video-colaborador.webm';

  const startRes = await fetch(`${CONVERTIO_BASE}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: apiKey,
      input: 'upload',
      filename,
      outputformat: 'mp4'
    })
  });

  const startJson = await startRes.json();
  if (startJson.status !== 'ok' || !startJson.data?.id) {
    throw new Error(startJson.error || 'Convertio: falha ao iniciar a conversão.');
  }

  const conversionId = startJson.data.id;

  const putRes = await fetch(`${CONVERTIO_BASE}/convert/${conversionId}/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: webmBuffer,
    headers: { 'Content-Type': 'video/webm' }
  });
  let putJson;
  try {
    putJson = await putRes.json();
  } catch (e) {
    await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
    throw new Error('Convertio: resposta inválida ao enviar o vídeo.');
  }
  if (putJson.status !== 'ok') {
    await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
    throw new Error(putJson.error || 'Convertio: falha ao enviar o vídeo.');
  }

  const maxAttempts = 90;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((r) => setTimeout(r, delayMs));
    const stRes = await fetch(`${CONVERTIO_BASE}/convert/${conversionId}/status`);
    const stJson = await stRes.json();

    if (stJson.status === 'error') {
      await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
      throw new Error(stJson.error || 'Convertio: erro na conversão.');
    }

    if (stJson.status !== 'ok' || !stJson.data) {
      continue;
    }

    const step = stJson.data.step;
    if (step === 'error' || step === 'failed') {
      await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
      throw new Error(stJson.data?.error || stJson.error || 'Convertio: conversão falhou.');
    }
    const done = step === 'finish' || step === 'finished';
    if (done && stJson.data.output?.url) {
      const mp4Res = await fetch(stJson.data.output.url);
      if (!mp4Res.ok) {
        await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
        throw new Error('Falha ao obter o arquivo MP4 convertido.');
      }
      const arrBuf = await mp4Res.arrayBuffer();
      await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
      return Buffer.from(arrBuf);
    }
  }

  await fetch(`${CONVERTIO_BASE}/convert/${conversionId}`, { method: 'DELETE' }).catch(() => {});
  throw new Error('Convertio: tempo limite ao aguardar a conversão.');
}

module.exports = { convertWebmToMp4Buffer };
