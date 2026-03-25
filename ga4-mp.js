/**
 * GA4 Measurement Protocol (서버/일렉트론용 — gtag 미사용)
 * Admin → 데이터 스트림 → Measurement Protocol API secrets 에서 발급한 비밀값 필요.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GA4_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';
const DEFAULT_MEASUREMENT_ID = 'G-M16NPNDWPG';

function loadLocalApiSecret() {
  try {
    const p = path.join(__dirname, 'ga4-secret.local.json');
    if (!fs.existsSync(p)) return '';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.api_secret || j.apiSecret || '';
  } catch {
    return '';
  }
}

const measurementId = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
const apiSecret = process.env.GA4_API_SECRET || loadLocalApiSecret();

let warnedMissingSecret = false;

function sanitizeParamKey(k) {
  return String(k)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^[0-9]+/, '')
    .slice(0, 40) || 'param';
}

/** GA4 커스텀 파라미터: 문자열·숫자 위주 (길이 제한) */
function sanitizeParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(params)) {
    if (rawVal === undefined || rawVal === null) continue;
    const key = sanitizeParamKey(rawKey);
    if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
      out[key] = rawVal;
    } else if (typeof rawVal === 'boolean') {
      out[key] = rawVal ? 1 : 0;
    } else {
      out[key] = String(rawVal).slice(0, 100);
    }
  }
  return out;
}

/**
 * @param {string} clientId
 * @param {string} eventName
 * @param {Record<string, unknown>} [params]
 */
async function sendGA4Event(clientId, eventName, params = {}) {
  if (!apiSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        '[ga4] GA4_API_SECRET 이 설정되지 않았습니다. Measurement Protocol 전송을 건너뜁니다. ' +
          '(빌드/실행 시 환경 변수로 설정하세요.)'
      );
      warnedMissingSecret = true;
    }
    return;
  }
  if (!clientId || typeof clientId !== 'string') return;
  const name = String(eventName || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40);
  if (!name) return;

  const url = `${GA4_COLLECT_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId.slice(0, 64),
    events: [{ name, params: sanitizeParams(params) }]
  };

  try {
    await axios.post(url, body, {
      timeout: 12000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.warn('[ga4] MP 전송 실패:', e.message);
  }
}

module.exports = { sendGA4Event, measurementId };
