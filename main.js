const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { sendGA4Event } = require('./ga4-mp');

// ── 창 크기/위치 기억 (userData JSON, 디바운스 저장) ──
const WINDOW_STATE_FILE = 'window-state.json';
const WINDOW_SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_WIN_WIDTH = 240;
const DEFAULT_WIN_HEIGHT = 350;
const MIN_WIN_WIDTH = 130;
const MIN_WIN_HEIGHT = 180;

let windowStateSaveTimer = null;

function windowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function loadWindowStateRaw() {
  try {
    const p = windowStatePath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    console.warn('[window-state] 로드 실패', e.message);
    return null;
  }
}

/** 저장값 검증·보정. 무효면 null → 기본 크기·중앙 배치 */
function validateWindowBounds(state) {
  if (
    typeof state.width !== 'number' ||
    typeof state.height !== 'number' ||
    !Number.isFinite(state.width) ||
    !Number.isFinite(state.height)
  ) {
    return null;
  }

  const primary = screen.getPrimaryDisplay();
  const pwa = primary.workArea;
  // 요구사항: 저장된 크기가 화면(작업 영역)보다 크면 무효
  if (state.width > pwa.width || state.height > pwa.height) {
    return null;
  }

  let w = Math.max(MIN_WIN_WIDTH, Math.min(state.width, pwa.width));
  let h = Math.max(MIN_WIN_HEIGHT, Math.min(state.height, pwa.height));

  const hasPos = typeof state.x === 'number' && typeof state.y === 'number'
    && Number.isFinite(state.x) && Number.isFinite(state.y);
  if (!hasPos) {
    return { width: w, height: h, center: true };
  }

  let x = state.x;
  let y = state.y;
  const d = screen.getDisplayNearestPoint({ x: x + w / 2, y: y + h / 2 });
  const wa = d.workArea;
  if (w > wa.width || h > wa.height) {
    w = Math.max(MIN_WIN_WIDTH, Math.min(w, wa.width));
    h = Math.max(MIN_WIN_HEIGHT, Math.min(h, wa.height));
  }
  const margin = 48;
  const minX = wa.x - w + margin;
  const maxX = wa.x + wa.width - margin;
  const minY = wa.y - h + margin;
  const maxY = wa.y + wa.height - margin;
  x = Math.min(Math.max(x, minX), maxX);
  y = Math.min(Math.max(y, minY), maxY);

  return { x, y, width: w, height: h, center: false };
}

function writeWindowStateFile(bounds) {
  const payload = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
  fs.writeFile(windowStatePath(), JSON.stringify(payload), 'utf8', (err) => {
    if (err) console.warn('[window-state] 저장 실패', err.message);
  });
}

function scheduleWindowStateSave(win) {
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    if (!win || win.isDestroyed()) return;
    writeWindowStateFile(win.getBounds());
  }, WINDOW_SAVE_DEBOUNCE_MS);
}

function flushWindowStateSave(win) {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
  if (!win || win.isDestroyed()) return;
  writeWindowStateFile(win.getBounds());
}

function attachWindowStatePersistence(win) {
  const bump = () => scheduleWindowStateSave(win);
  win.on('resize', bump);
  win.on('move', bump);
  win.on('close', () => flushWindowStateSave(win));
}

// ── 축구 리그 메타데이터 ──
const SOCCER_LEAGUES = {
  'eng.1':          { name: 'EPL',       shortName: 'EPL',  emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'esp.1':          { name: 'La Liga',   shortName: 'LAL',  emoji: '🇪🇸' },
  'ger.1':          { name: 'Bundesliga',shortName: 'BUN',  emoji: '🇩🇪' },
  'ita.1':          { name: 'Serie A',   shortName: 'SRA',  emoji: '🇮🇹' },
  'uefa.champions': { name: 'UCL',       shortName: 'UCL',  emoji: '⭐' }
};

// 리그별 UEFA/강등 존 (inclusive rank ranges)
const SOCCER_ZONES = {
  'eng.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'esp.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'ger.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[16,18] },
  'ita.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'uefa.champions': { ucl:[1,8],  uel:null,    playoff:[9,24], rel:[25,36] }
};

function getSoccerUrls(leagueId, type = 'scoreboard') {
  const path = type === 'standings'
    ? `https://site.api.espn.com/apis/v2/sports/soccer/${leagueId}/standings`
    : `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`;
  const pathWeb = type === 'standings'
    ? `https://site.web.api.espn.com/apis/v2/sports/soccer/${leagueId}/standings`
    : `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`;
  return [path, pathWeb];
}

// ── 종목별 API 엔드포인트 설정 ──
const SPORT_CONFIG = {
  nba: {
    standingsUrls: [
      'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
      'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings'
    ],
    scoreboardUrls: [
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
    ],
    scheduleBase: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    confNames: ['eastern', 'western'],
    confLabels: ['Eastern', 'Western']
  },
  mlb: {
    // 시즌 연도는 KST 달력 연도(예: 2026)만 사용. 호출마다 getStandingsUrls()로 season·캐시 버스트 갱신.
    getStandingsUrls() {
      const y = yearKST();
      const bust = Date.now();
      return [
        `https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${y}&_=${bust}`,
        `https://site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${y}&_=${bust}`
      ];
    },
    scoreboardUrls: [
      'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
      'https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'
    ],
    scheduleBase: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams',
    confNames: ['american', 'national'],
    confLabels: ['American', 'National']
  },
  // soccer는 leagueId로 동적 생성 — SOCCER_LEAGUES 참고
  soccer: {
    confNames: [],
    confLabels: []
  }
};

// ── 축구 팀 목록은 순위 API에서 동적으로 파싱 ──
// fetchSoccerStandings(leagueId) 가 teams 배열도 함께 반환함

// KST 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
function todayKST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function isTodayKST(isoDateStr) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(isoDateStr)) === todayKST();
}

/** KST 기준 달력 연도 (MLB season=YYYY 등에 사용) */
function yearKST() {
  return Number(todayKST().slice(0, 4));
}

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache'
};

function getStat(entry, statName) {
  const stat = (entry.stats || []).find((item) => item.name === statName);
  return stat ? String(stat.displayValue ?? stat.value ?? '').trim() : '';
}

function toNumber(value, fallback = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatPct(value) {
  if (!value) return '-';
  if (value.startsWith('.')) return `0${value}`;
  return value;
}

/** ESPN stat 원시 value (MLB 정렬용) */
function getEspnStatValue(entry, statName) {
  const stat = (entry.stats || []).find((item) => item.name === statName);
  if (!stat) return null;
  if (typeof stat.value === 'number' && Number.isFinite(stat.value)) return stat.value;
  return null;
}

/**
 * NBA: playoffSeed → 승수 순 (기존)
 * MLB 지구 내: 승률 내림차순 → 동률 시 팀 풀네임 알파벳 순 A-Z (en)
 */
function mapConferenceRows(entries, sport = 'nba') {
  const rows = (entries || []).map((entry) => {
    const team = entry.team?.displayName || entry.team?.shortDisplayName || '-';
    const teamId = String(entry.team?.id || entry.team?.uid || team);
    const wins = getStat(entry, 'wins');
    const losses = getStat(entry, 'losses');
    const pct = formatPct(getStat(entry, 'winPercent'));
    const seed = toNumber(getStat(entry, 'playoffSeed'));
    const gb = getStat(entry, 'gamesBehind') || '-';
    const logo = entry.team?.logos?.[0]?.href || entry.team?.logo || '';
    const abbr = entry.team?.abbreviation || entry.team?.shortDisplayName || team.slice(0, 3).toUpperCase();
    // 'x'=포스트시즌 확정, 'y'=지구 우승, 'z'=1번 시드, 'p'=순위 확정, 'e'=탈락
    const clincher = getStat(entry, 'clincher') || '';

    const winsNum = toNumber(wins, -1);
    let pctSort = -1;
    if (sport === 'mlb') {
      pctSort = getEspnStatValue(entry, 'winPercent');
      if (pctSort === null) {
        const raw = String(getStat(entry, 'winPercent') || '').trim();
        const pf = parseFloat(raw.startsWith('.') ? `0${raw}` : raw);
        pctSort = Number.isFinite(pf) ? pf : -1;
      }
    }

    return {
      teamId,
      team,
      abbr,
      logo,
      w: wins || '-',
      l: losses || '-',
      wl: wins && losses ? `${wins}-${losses}` : '-',
      pct,
      gb,
      clincher,
      seed,
      winsNum,
      pctSort
    };
  });

  if (sport === 'mlb') {
    rows.sort((a, b) => {
      const dp = (b.pctSort ?? -1) - (a.pctSort ?? -1);
      if (dp !== 0) return dp;
      return String(a.team).localeCompare(String(b.team), 'en', { sensitivity: 'base' });
    });
  } else {
    rows.sort((a, b) => {
      if (a.seed !== b.seed) return a.seed - b.seed;
      return b.winsNum - a.winsNum;
    });
  }

  return rows.map((row, index) => {
    const common = {
      teamId: row.teamId,
      team: row.team,
      abbr: row.abbr,
      logo: row.logo,
      w: row.w,
      l: row.l,
      wl: row.wl,
      pct: row.pct,
      gb: row.gb,
      clincher: row.clincher
    };
    if (sport === 'mlb') {
      return {
        ...common,
        rank: index + 1,
        playoffSeed:
          Number.isFinite(row.seed) && row.seed !== Number.POSITIVE_INFINITY ? row.seed : null
      };
    }
    return {
      ...common,
      rank: Number.isFinite(row.seed) ? row.seed : index + 1
    };
  });
}

// MLB는 컨퍼런스 하위에 디비전이 있어 한 단계 더 flatten 필요
function getConferenceEntries(conf) {
  if (conf?.standings?.entries?.length) return conf.standings.entries;
  return (conf?.children || []).flatMap((div) => div.standings?.entries || []);
}

function mlbDivisionSortKey(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('east')) return 0;
  if (n.includes('central')) return 1;
  if (n.includes('west')) return 2;
  return 9;
}

function formatMlbDivisionLabel(divName) {
  const n = String(divName || '').toLowerCase();
  if (n.includes('east')) return 'East';
  if (n.includes('central')) return 'Central';
  if (n.includes('west')) return 'West';
  const s = String(divName || '').trim();
  return s.replace(/^american\s+league\s+/i, '').replace(/^national\s+league\s+/i, '').trim() || 'Division';
}

/** ESPN 팀 id → 지구 키 (site.api ESPN v2 MLB는 리그에 children 없이 entries 15개만 주는 경우가 많음) */
const MLB_AMERICAN_DIVISION_BY_TEAM_ID = {
  1: 'east',
  2: 'east',
  10: 'east',
  30: 'east',
  14: 'east',
  4: 'central',
  5: 'central',
  6: 'central',
  7: 'central',
  9: 'central',
  3: 'west',
  11: 'west',
  12: 'west',
  13: 'west',
  18: 'west'
};

const MLB_NATIONAL_DIVISION_BY_TEAM_ID = {
  15: 'east',
  28: 'east',
  21: 'east',
  22: 'east',
  20: 'east',
  16: 'central',
  17: 'central',
  8: 'central',
  23: 'central',
  26: 'central',
  24: 'west',
  27: 'west',
  19: 'west',
  29: 'west',
  25: 'west'
};

const MLB_DIVISION_ORDER = ['east', 'central', 'west'];

function mlbDivisionKeyFromApiName(divName) {
  const n = String(divName || '').toLowerCase();
  if (n.includes('east')) return 'east';
  if (n.includes('central')) return 'central';
  if (n.includes('west')) return 'west';
  return null;
}

function mlbDivisionBlockFromChild(div) {
  const key = mlbDivisionKeyFromApiName(div.name);
  const rows = mapConferenceRows(div.standings.entries, 'mlb');
  if (key) return { division: key, rows };
  return { division: null, label: formatMlbDivisionLabel(div.name), rows };
}

/** 리그 단일 entries(최대 15)를 지구별로 나눔 */
function partitionMlbFlatEntriesByTeamId(entries, leagueKey) {
  const idMap =
    leagueKey === 'american' ? MLB_AMERICAN_DIVISION_BY_TEAM_ID : MLB_NATIONAL_DIVISION_BY_TEAM_ID;
  const buckets = { east: [], central: [], west: [], other: [] };
  for (const e of entries || []) {
    const tid = String(e.team?.id || '');
    const div = idMap[Number(tid)] || idMap[tid] || 'other';
    (buckets[div] || buckets.other).push(e);
  }
  const out = [];
  for (const d of MLB_DIVISION_ORDER) {
    if (buckets[d].length) out.push({ division: d, rows: mapConferenceRows(buckets[d], 'mlb') });
  }
  if (buckets.other.length) {
    out.push({ division: 'other', rows: mapConferenceRows(buckets.other, 'mlb') });
  }
  return out;
}

/**
 * AL/NL 각각 [{ division, rows } | { division:null, label, rows }, ...]
 * — API에 division children가 있으면 사용, 없으면 팀 id로 강제 분할
 */
function mapMlbConferenceToDivisions(conf, leagueKey) {
  if (!conf) return [];
  const rawChildren = conf.children || [];
  const withEntries = rawChildren.filter((d) => d.standings?.entries?.length);

  if (withEntries.length >= 2) {
    return [...withEntries]
      .sort((a, b) => mlbDivisionSortKey(a.name) - mlbDivisionSortKey(b.name))
      .map((div) => mlbDivisionBlockFromChild(div));
  }

  if (withEntries.length === 1) {
    return [mlbDivisionBlockFromChild(withEntries[0])];
  }

  const leagueEntries = conf?.standings?.entries?.length ? conf.standings.entries : [];
  if (leagueEntries.length) {
    return partitionMlbFlatEntriesByTeamId(leagueEntries, leagueKey);
  }

  const fallbackEntries = getConferenceEntries(conf);
  if (fallbackEntries.length) {
    return partitionMlbFlatEntriesByTeamId(fallbackEntries, leagueKey);
  }

  return [];
}

function parseEspnStandingsPayload(payload, sport = 'nba') {
  const config = SPORT_CONFIG[sport] || SPORT_CONFIG.nba;
  const children = payload?.children || [];

  const confA = children.find((c) =>
    String(c.name || '').toLowerCase().includes(config.confNames[0])
  );
  const confB = children.find((c) =>
    String(c.name || '').toLowerCase().includes(config.confNames[1])
  );

  if (sport === 'mlb') {
    const americanDivisions = mapMlbConferenceToDivisions(confA, 'american');
    const nationalDivisions = mapMlbConferenceToDivisions(confB, 'national');
    const flatAmerican = americanDivisions.flatMap((d) => d.rows);
    const flatNational = nationalDivisions.flatMap((d) => d.rows);
    if (!flatAmerican.length && !flatNational.length) return null;
    return {
      eastern: flatAmerican.map((row) => ({ ...row, conference: 'American' })),
      western: flatNational.map((row) => ({ ...row, conference: 'National' })),
      mlbByDivision: { american: americanDivisions, national: nationalDivisions },
      sport,
      fetchedAt: new Date().toISOString()
    };
  }

  const eastern = mapConferenceRows(getConferenceEntries(confA));
  const western = mapConferenceRows(getConferenceEntries(confB));

  if (!eastern.length && !western.length) {
    // 양쪽 모두 비어있으면 이 URL은 유효하지 않은 데이터 → 다음 URL 시도
    return null;
  }

  return {
    eastern: eastern.map((row) => ({ ...row, conference: config.confLabels[0] })),
    western: western.map((row) => ({ ...row, conference: config.confLabels[1] })),
    sport,
    fetchedAt: new Date().toISOString()
  };
}

// ── EPL 순위 파싱 (단일 리그 구조) ──
// ── EPL 전용 순위 파서 (축구: rank/ties/points 기준) ──
function mapSoccerRows(entries, leagueId = 'eng.1') {
  return (entries || []).map((entry) => {
    const tm     = entry.team || {};
    const teamId = String(tm.id || '');
    const team   = tm.displayName || tm.shortDisplayName || '-';
    const abbr   = tm.abbreviation || tm.shortDisplayName || team.slice(0, 3).toUpperCase();
    const logo   = tm.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;

    const gs = (name) => {
      const s = (entry.stats || []).find((x) => x.name === name);
      return s ? String(s.displayValue ?? s.value ?? '') : '';
    };

    const rank   = toNumber(gs('rank'), 99);
    const wins   = gs('wins')   || '0';
    const draws  = gs('ties')   || '0';   // ESPN은 무승부를 'ties'로 제공
    const losses = gs('losses') || '0';
    const pts    = gs('points') || '-';

    return {
      teamId, team, abbr, logo, rank, leagueId,
      w: wins, d: draws, l: losses, pts,
      gb: '-', pct: '-', wl: `${wins}-${draws}-${losses}`,
      clincher: '', conference: leagueId
    };
  }).sort((a, b) => a.rank - b.rank);
}

// 모든 축구 리그에 사용 가능한 범용 순위 조회
async function fetchSoccerStandings(leagueId = 'eng.1') {
  const urls = getSoccerUrls(leagueId, 'standings');
  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
      const payload  = response.data;

      const entries =
        payload?.children?.[0]?.standings?.entries ||
        payload?.standings?.[0]?.entries ||
        payload?.children?.[0]?.children?.[0]?.standings?.entries ||
        [];

      if (!entries.length) throw new Error(`[${leagueId}] 순위 엔트리 없음`);

      const table = mapSoccerRows(entries, leagueId);
      const teams = table.map((r) => ({
        id: r.teamId, name: r.team, abbr: r.abbr, logo: r.logo
      }));

      return { table, teams, leagueId, fetchedAt: new Date().toISOString() };
    } catch (error) {
      console.error(`[standings:soccer:${leagueId}] 실패`, { url, message: error.message });
    }
  }
  throw new Error(`[soccer:${leagueId}] 모든 순위 소스 실패`);
}

async function fetchStandings(sport = 'nba') {
  const config = SPORT_CONFIG[sport] || SPORT_CONFIG.nba;
  const urls =
    typeof config.getStandingsUrls === 'function'
      ? config.getStandingsUrls()
      : config.standingsUrls;

  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
      const result = parseEspnStandingsPayload(response.data, sport);
      if (result) return result;   // 유효한 데이터면 즉시 반환
      // null이면 이 URL은 빈 데이터 → 조용히 다음 URL 시도
    } catch (error) {
      // 네트워크/HTTP 오류만 warn 수준으로 기록
      console.warn(`[standings:${sport}] URL 실패, 다음 소스 시도`, {
        url,
        status: error.response?.status,
        msg: error.message
      });
    }
  }

  // 모든 URL 실패 → 호출부(loadStandings/loadMlbStandings)에서 처리
  throw new Error(`[${sport}] 유효한 순위 데이터를 가져오지 못했습니다`);
}

// ── MLB 투수 정보 추출 헬퍼 ──
function extractProbablePitcher(competitor) {
  const prob = competitor?.probables?.[0];
  if (!prob?.athlete) return null;
  const era  = (prob.statistics || []).find((s) => s.abbreviation === 'ERA')?.displayValue || '';
  const wins = (prob.statistics || []).find((s) => s.abbreviation === 'W')?.displayValue  || '';
  const loss = (prob.statistics || []).find((s) => s.abbreviation === 'L')?.displayValue  || '';
  const record = prob.record || (wins || loss ? `(${wins}-${loss}${era ? ', ' + era + ' ERA' : ''})` : '');
  return {
    name:   prob.athlete.shortName || prob.athlete.displayName || '',
    record: record   // e.g. "(0-1, 0.90)"
  };
}

function mapTeamGameStatus(event, teamId, sport = 'nba') {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const myTeam = competitors.find((c) => String(c.team?.id) === String(teamId));
  if (!myTeam) return null;

  const opponent = competitors.find((c) => String(c.team?.id) !== String(teamId));
  const statusType = event.status?.type || {};
  const state = statusType.state;
  const detail = event.status?.type?.detail || '';
  const shortDetail = event.status?.type?.shortDetail || detail;

  const myScore = myTeam.score || '0';
  const oppScore = opponent?.score || '0';
  const myAbbr = myTeam.team?.abbreviation || myTeam.team?.shortDisplayName || 'MY';
  const oppAbbr = opponent?.team?.abbreviation || opponent?.team?.shortDisplayName || 'OPP';
  const opponentName = opponent?.team?.shortDisplayName || opponent?.team?.displayName || '상대팀';
  const isHome = myTeam.homeAway === 'home';

  const venueObj = competition?.venue || {};
  const venue = venueObj.fullName || '';
  const venueCity = venueObj.address?.city || '';

  // ── MLB 전용: 투수 정보 ──
  let pitcher = null;
  if (sport === 'mlb') {
    if (state === 'in') {
      // 진행 중: situation.pitcher (현재 마운드 투수)
      const sit = competition?.situation?.pitcher;
      if (sit?.athlete) {
        pitcher = {
          mode:    'current',
          name:    sit.athlete.shortName || sit.athlete.displayName || '',
          summary: sit.summary || ''   // "2.2 IP, 0 ER, 4 H, 4 K, BB"
        };
      }
    } else {
      // 경기 전/후: probables (선발 투수)
      const myProb  = extractProbablePitcher(myTeam);
      const oppProb = extractProbablePitcher(opponent);
      if (myProb || oppProb) {
        pitcher = {
          mode:   'probable',
          my:     myProb,
          opp:    oppProb,
          myAbbr, oppAbbr
        };
      }
    }
  }

  if (state === 'in') {
    return {
      mode: 'live',
      myScore, oppScore, myAbbr, oppAbbr,
      period: shortDetail || detail,
      isHome, pitcher, venue, venueCity,
      scoreKey: `${myScore}-${oppScore}`
    };
  }
  if (state === 'pre') {
    return { mode: 'pre', myAbbr, oppAbbr, opponentName, isHome, startDateISO: event.date, pitcher, venue, venueCity };
  }
  if (state === 'post') {
    const myWon = Number(myScore) > Number(oppScore);
    return {
      mode: 'post',
      myScore, oppScore, myAbbr, oppAbbr,
      result: myWon ? 'W' : 'L',
      isHome, pitcher, venue, venueCity,
      scoreKey: `${myScore}-${oppScore}`
    };
  }

  return { mode: 'unknown', detail: detail || '상태 확인 중' };
}

async function fetchTeamGameStatus(teamId, sport = 'nba', leagueId = null) {
  if (!teamId) {
    return { mode: 'none', title: '팀 미선택', detail: '응원 팀을 먼저 선택해 주세요.' };
  }

  // 하위 호환: sport:'epl' → sport:'soccer', leagueId:'eng.1'
  if (sport === 'epl') { sport = 'soccer'; leagueId = leagueId || 'eng.1'; }

  const scoreboardUrls = (sport === 'soccer' && leagueId)
    ? getSoccerUrls(leagueId, 'scoreboard')
    : (SPORT_CONFIG[sport]?.scoreboardUrls || SPORT_CONFIG.nba.scoreboardUrls);

  let lastError;

  for (const url of scoreboardUrls) {
    try {
      const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
      const allEvents = Array.isArray(response.data?.events) ? response.data.events : [];
      const events = allEvents.filter((ev) => isTodayKST(ev.date));

      if (!events.length) {
        return { mode: 'none', title: '오늘 경기 없음', detail: '오늘 예정된 경기가 없습니다.' };
      }

      const matched = events.find((event) =>
        (event.competitions?.[0]?.competitors || []).some(
          (c) => String(c.team?.id) === String(teamId)
        )
      );

      if (!matched) {
        return { mode: 'none', title: '오늘 경기 없음', detail: '오늘 예정된 경기가 없습니다.' };
      }

      const result = mapTeamGameStatus(matched, teamId, sport);
      if (!result) {
        return { mode: 'none', title: '오늘 경기 없음', detail: '오늘 예정된 경기가 없습니다.' };
      }
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[scoreboard:${sport}] 소스 호출 실패`, {
        url,
        statusCode: error.response?.status,
        message: error.message
      });
    }
  }

  return {
    mode: 'error',
    title: '경기 정보 확인 중...',
    detail: `네트워크 오류 (${lastError?.response?.status || 'ERR'})`
  };
}

/** 축구: 팀 정보 API의 nextEvent 필드로 다음 경기 추출 */
async function fetchNextGameSoccer(teamId, leagueId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams/${teamId}`;
  const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
  const nextEvents = Array.isArray(response.data?.team?.nextEvent) ? response.data.team.nextEvent : [];
  const now = new Date();

  const next = nextEvents.find((ev) => {
    const state = ev.competitions?.[0]?.status?.type?.state;
    return state === 'pre' && new Date(ev.date) > now;
  });

  if (!next) return { seasonEnd: true };

  const competition = next.competitions?.[0];
  const competitors = competition?.competitors || [];
  const myCompetitor = competitors.find((c) => String(c.id) === String(teamId));
  const opp = competitors.find((c) => String(c.id) !== String(teamId));

  return {
    date: next.date,
    isHome: myCompetitor?.homeAway === 'home',
    opponent: {
      name:
        opp?.team?.displayName
        || opp?.team?.shortDisplayName
        || opp?.team?.name
        || '상대팀',
      abbreviation: opp?.team?.abbreviation || opp?.team?.shortDisplayName || '',
      logo: opp?.team?.logos?.[0]?.href || opp?.team?.logo || ''
    }
  };
}

async function fetchNextGame(teamId, sport = 'nba', leagueId = null) {
  if (!teamId) return null;
  if (sport === 'epl') { sport = 'soccer'; leagueId = leagueId || 'eng.1'; }

  // 축구: nextEvent 필드를 가진 팀 정보 API 사용 (schedule 엔드포인트는 미래 일정 미포함)
  if (sport === 'soccer' && leagueId) {
    try {
      return await fetchNextGameSoccer(teamId, leagueId);
    } catch (error) {
      console.error(`[schedule:soccer:${leagueId}] fetchNextGame 실패`, {
        teamId, message: error.message, status: error.response?.status
      });
      return null;
    }
  }

  const scheduleBase = SPORT_CONFIG[sport]?.scheduleBase || SPORT_CONFIG.nba.scheduleBase;
  const url = `${scheduleBase}/${teamId}/schedule`;
  try {
    const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
    const events = Array.isArray(response.data?.events) ? response.data.events : [];
    const now = new Date();

    const next = events.find((ev) => {
      const state = ev.competitions?.[0]?.status?.type?.state;
      return state === 'pre' && new Date(ev.date) > now;
    });

    if (!next) return { seasonEnd: true };

    const competition = next.competitions?.[0];
    const competitors = competition?.competitors || [];
    const myCompetitor = competitors.find((c) => String(c.team?.id) === String(teamId));
    const opp = competitors.find((c) => String(c.team?.id) !== String(teamId));

    return {
      date: next.date,
      isHome: myCompetitor?.homeAway === 'home',
      opponent: {
        name:
          opp?.team?.displayName
          || opp?.team?.shortDisplayName
          || opp?.team?.name
          || '상대팀',
        abbreviation: opp?.team?.abbreviation || opp?.team?.shortDisplayName || '',
        logo: opp?.team?.logo || opp?.team?.logos?.[0]?.href || ''
      }
    };
  } catch (error) {
    console.error(`[schedule:${sport}] fetchNextGame 실패`, {
      teamId, message: error.message, status: error.response?.status
    });
    return null;
  }
}

function createWindow() {
  const raw = loadWindowStateRaw();
  const bounds = raw ? validateWindowBounds(raw) : null;

  const winOptions = {
    title: 'PEEKS',
    minWidth: MIN_WIN_WIDTH,
    minHeight: MIN_WIN_HEIGHT,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (bounds) {
    winOptions.width = bounds.width;
    winOptions.height = bounds.height;
    if (bounds.center) {
      winOptions.center = true;
    } else {
      winOptions.x = bounds.x;
      winOptions.y = bounds.y;
    }
  } else {
    winOptions.width = DEFAULT_WIN_WIDTH;
    winOptions.height = DEFAULT_WIN_HEIGHT;
    winOptions.center = true;
  }

  const win = new BrowserWindow(winOptions);

  win.setAlwaysOnTop(true, 'screen-saver');
  attachWindowStatePersistence(win);

  const pushPeekWindowState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('peeks:peek-state', {
      minimized: win.isMinimized(),
      hidden: !win.isVisible()
    });
  };
  win.on('minimize', pushPeekWindowState);
  win.on('restore', pushPeekWindowState);
  win.on('show', pushPeekWindowState);
  win.on('hide', pushPeekWindowState);
  win.webContents.once('did-finish-load', pushPeekWindowState);

  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

// ── 전체 경기 매핑 ──
function mapGameRow(event) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  if (!away || !home) return null;

  const statusType = event.status?.type || {};
  const getInfo = (c) => ({
    id:    String(c?.team?.id || ''),
    abbr:  c?.team?.abbreviation || c?.team?.shortDisplayName || '???',
    logo:  c?.team?.logos?.[0]?.href || c?.team?.logo || '',
    score: c?.score ?? ''
  });

  return {
    id:     event.id,
    state:  statusType.state || 'pre',
    status: statusType.shortDetail || statusType.detail || '',
    date:   event.date,
    away:   getInfo(away),
    home:   getInfo(home)
  };
}

// ── UCL 토너먼트 단계 판별 및 대진표 fetch ──
// ── UCL 토너먼트 라운드 정의 ──
const UCL_ROUNDS = [
  { key: 'playoffs',  name: 'Knockout Round Playoffs', nameKo: '플레이오프',  start: '2026-01-30', end: '2026-02-27' },
  { key: 'r16',       name: 'Round of 16',             nameKo: '16강',        start: '2026-02-27', end: '2026-03-20' },
  { key: 'qf',        name: 'Quarterfinals',           nameKo: '8강',         start: '2026-03-20', end: '2026-04-17' },
  { key: 'sf',        name: 'Semifinals',              nameKo: '4강',         start: '2026-04-17', end: '2026-05-08' },
  { key: 'final',     name: 'Final',                   nameKo: '결승',        start: '2026-05-08', end: '2026-07-01' }
];

function getCurrentUclRoundKey() {
  const now = todayKST(); // 'YYYY-MM-DD'
  for (const r of UCL_ROUNDS) {
    if (now >= r.start && now < r.end) return r.key;
  }
  // 시즌 종료 이후면 마지막 라운드
  if (todayKST() >= UCL_ROUNDS[UCL_ROUNDS.length - 1].end) return UCL_ROUNDS[UCL_ROUNDS.length - 1].key;
  return null;
}

function dateToYYYYMMDD(isoStr) {
  return isoStr.slice(0, 10).replace(/-/g, '');
}

function parseUclMatchups(events) {
  const matchups = [];
  const seen = new Map();

  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const ev of sorted) {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors || [];
    if (competitors.length < 2) continue;

    const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1];

    const homeId = String(home.team?.id || home.team?.displayName || '?');
    const awayId = String(away.team?.id || away.team?.displayName || '?');
    const pairKey = [homeId, awayId].sort().join('_');

    const note = comp?.notes?.[0]?.headline || '';
    const noteLow = note.toLowerCase();
    const isLeg2 = noteLow.includes('2nd leg');
    const state = ev.status?.type?.state || 'pre';

    // 미확정 팀: API가 "QF W2" / "SF W1" 같은 placeholder 이름을 줌
    const isPlaceholder = (name) => /^(QF|SF|R16|PO)\s*W\d+/i.test(name);

    const makeTeam = (c) => ({
      id: String(c.team?.id || ''),
      abbr: c.team?.abbreviation || c.team?.shortDisplayName || '?',
      name: c.team?.shortDisplayName || c.team?.displayName || '?',
      logo: c.team?.logos?.[0]?.href || c.team?.logo || '',
      placeholder: isPlaceholder(c.team?.shortDisplayName || c.team?.displayName || '')
    });

    const venue = comp?.venue || {};
    const legData = {
      date: ev.date,
      state,
      homeScore: (state === 'in' || state === 'post') ? (home.score ?? '') : '',
      awayScore: (state === 'in' || state === 'post') ? (away.score ?? '') : '',
      status: ev.status?.type?.shortDetail || '',
      note,
      venue: venue.fullName || '',
      city: venue.address?.city || ''
    };

    if (!seen.has(pairKey)) {
      const mu = {
        leg1Home: null,
        leg1Away: null,
        leg1: null,
        leg2: null,
        winner: '',
        winnerIsLeg1Home: null,
        aggregate: ''
      };
      seen.set(pairKey, mu);
      matchups.push(mu);
    }

    const mu = seen.get(pairKey);
    if (isLeg2) {
      mu.leg2 = legData;
      // leg2 홈/원정 팀 저장 (leg1Home이 아직 없으면 leg2 기준으로 채움)
      if (!mu.leg1Home) {
        mu.leg1Home = makeTeam(away); // leg2 원정 = leg1 홈
        mu.leg1Away = makeTeam(home); // leg2 홈 = leg1 원정
      }
      // 합산 스코어 추출
      const aggMatch = note.match(/(\d+[-–]\d+)\s+on aggregate/);
      if (aggMatch) mu.aggregate = aggMatch[1].replace('–', '-');
      // 진출 팀 판별: leg2 홈팀 ID 기준
      // leg2 홈 = leg1 원정(leg1Away) → 진출이면 winnerIsLeg1Home=false
      // leg2 원정 = leg1 홈(leg1Home) → 진출이면 winnerIsLeg1Home=true
      if (note.includes('advance')) {
        const m = note.match(/^(.+?)\s+advance/);
        if (m) mu.winner = m[1].trim();
        // leg2 홈팀(home)이 진출했는가 vs 원정팀(away)이 진출했는가
        // aggregate note 진출팀과 leg2 home 팀 이름 비교
        const winnerName = (mu.winner || '').toLowerCase();
        const leg2HomeName = (home.team?.shortDisplayName || home.team?.displayName || '').toLowerCase();
        const leg2AwayName = (away.team?.shortDisplayName || away.team?.displayName || '').toLowerCase();
        // leg2 홈이 winner면 → leg1Away가 winner → winnerIsLeg1Home=false
        // leg2 away가 winner면 → leg1Home이 winner → winnerIsLeg1Home=true
        const leg2HomeIsWinner = winnerName && (
          leg2HomeName.includes(winnerName.slice(0, 6)) ||
          winnerName.includes(leg2HomeName.slice(0, 6))
        );
        mu.winnerIsLeg1Home = !leg2HomeIsWinner;
      } else if (note.includes('lead')) {
        // 아직 2차전 미종료: "X lead Y-Z on aggregate"
        // lead 팀이 leg2 홈인지 원정인지 판별
        const leadMatch = note.match(/^(.+?)\s+lead/);
        if (leadMatch) {
          const leadName = leadMatch[1].trim().toLowerCase();
          const leg2HomeName = (home.team?.shortDisplayName || home.team?.displayName || '').toLowerCase();
          const leg2HomeIsLeading = leg2HomeName.includes(leadName.slice(0, 6)) ||
            leadName.includes(leg2HomeName.slice(0, 6));
          mu.winnerIsLeg1Home = !leg2HomeIsLeading;
        }
      }
    } else {
      mu.leg1 = legData;
      // leg1 홈/원정 팀 저장 (아직 없을 때만)
      if (!mu.leg1Home) {
        mu.leg1Home = makeTeam(home);
        mu.leg1Away = makeTeam(away);
      }
    }
  }

  return matchups;
}

async function fetchUclTournament() {
  // 전체 시즌 토너먼트 날짜 범위로 조회 (2026-01-30 ~ 2026-07-01)
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20260130-20260701`;

  try {
    const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
    const allEvents = Array.isArray(response.data?.events) ? response.data.events : [];

    if (!allEvents.length) return null;

    // 라운드별로 이벤트 분류
    const roundMap = {};
    for (const r of UCL_ROUNDS) {
      const evs = allEvents.filter(ev => {
        const d = ev.date?.slice(0, 10);
        return d >= r.start && d < r.end;
      });
      if (evs.length) {
        roundMap[r.key] = {
          key: r.key,
          name: r.name,
          nameKo: r.nameKo,
          matchups: parseUclMatchups(evs)
        };
      }
    }

    const currentKey = getCurrentUclRoundKey();

    return {
      rounds: roundMap,
      currentRoundKey: currentKey,
      roundOrder: UCL_ROUNDS.filter(r => roundMap[r.key]).map(r => r.key)
    };
  } catch (err) {
    console.error('[ucl:tournament] fetch 실패', err.message);
    return null;
  }
}

async function fetchAllGames(sport = 'nba', leagueId = null) {
  if (sport === 'epl') { sport = 'soccer'; leagueId = leagueId || 'eng.1'; }
  const urls = (sport === 'soccer' && leagueId)
    ? getSoccerUrls(leagueId, 'scoreboard')
    : (SPORT_CONFIG[sport]?.scoreboardUrls || []);
  if (!urls.length) return [];
  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 15000, headers: HTTP_HEADERS });
      const events = Array.isArray(response.data?.events) ? response.data.events : [];
      return events
        .filter((ev) => isTodayKST(ev.date))
        .map(mapGameRow)
        .filter(Boolean);
    } catch (error) {
      console.error(`[allgames:${sport}:${leagueId}] 실패`, { url, message: error.message });
    }
  }
  return [];
}

// ── KBO (네이버 스포츠 API) ──
const KBO_TEAMS = [
  { code: 'NC',  name: 'NC 다이노스',   shortName: 'NC',  logo: 'https://sports-phinf.pstatic.net/team/kbo/default/NC.png' },
  { code: 'KT',  name: 'KT 위즈',       shortName: 'KT',  logo: 'https://sports-phinf.pstatic.net/team/kbo/default/KT.png' },
  { code: 'LG',  name: 'LG 트윈스',     shortName: 'LG',  logo: 'https://sports-phinf.pstatic.net/team/kbo/default/LG.png' },
  { code: 'LT',  name: '롯데 자이언츠', shortName: '롯데', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/LT.png' },
  { code: 'SK',  name: 'SSG 랜더스',    shortName: 'SSG', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/SK.png' },
  { code: 'OB',  name: '두산 베어스',   shortName: '두산', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/OB.png' },
  { code: 'HH',  name: '한화 이글스',   shortName: '한화', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/HH.png' },
  { code: 'SS',  name: '삼성 라이온즈', shortName: '삼성', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/SS.png' },
  { code: 'HT',  name: 'KIA 타이거즈',  shortName: 'KIA', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/HT.png' },
  { code: 'WO',  name: '키움 히어로즈', shortName: '키움', logo: 'https://sports-phinf.pstatic.net/team/kbo/default/WO.png' }
];

const KBO_HEADERS = {
  ...HTTP_HEADERS,
  'Referer': 'https://sports.naver.com',
  'Origin': 'https://sports.naver.com'
};

function kboTeamByCode(code) {
  return KBO_TEAMS.find(t => t.code === code) || null;
}

function kboDateStr(date) {
  // 'YYYYMMDD' 형식 반환
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date).replace(/-/g, '');
}

async function fetchKboGames(dateStr = null) {
  const d = dateStr || kboDateStr(new Date());
  const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic&gameDate=${d}&categoryId=kbo`;
  try {
    const response = await axios.get(url, { timeout: 15000, headers: KBO_HEADERS });
    const raw = response.data?.result?.games;
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error('[kbo] fetchKboGames 실패', err.message);
    return [];
  }
}

async function fetchKboTeamStatus(teamCode) {
  const games = await fetchKboGames();
  const game = games.find(g => g.homeTeamCode === teamCode || g.awayTeamCode === teamCode);
  if (!game) return { mode: 'none' };

  const isHome = game.homeTeamCode === teamCode;
  // reversedHomeAway=true → KBO 홈/원정이 UI상 반대로 표시됨 (실제 홈은 homeTeamCode)
  const myTeam   = kboTeamByCode(teamCode);
  const oppCode  = isHome ? game.awayTeamCode : game.homeTeamCode;
  const oppTeam  = kboTeamByCode(oppCode);
  const myScore  = isHome ? game.homeTeamScore : game.awayTeamScore;
  const oppScore = isHome ? game.awayTeamScore : game.homeTeamScore;
  const myLogo   = isHome ? game.homeTeamEmblemUrl : game.awayTeamEmblemUrl;
  const oppLogo  = isHome ? game.awayTeamEmblemUrl : game.homeTeamEmblemUrl;
  const myAbbr   = myTeam?.shortName  || teamCode;
  const oppAbbr  = oppTeam?.shortName || oppCode;

  // 네이버: BEFORE 외에 READY(출전 대기 등)가 오며, 미처리 시 mode none → "오늘 경기 없음"으로 잘못 표시됨
  const status = String(game.statusCode || '').trim().toUpperCase();
  const isCanceled = game.cancel || game.suspended || status === 'CANCEL';

  if (isCanceled) return { mode: 'none', myAbbr, oppAbbr, myLogo, oppLogo };

  if (status === 'BEFORE' || status === 'READY') {
    return {
      mode: 'pre',
      myAbbr, oppAbbr, myLogo, oppLogo,
      opponentName: oppTeam?.name || oppCode,
      isHome,
      startDateISO: game.gameDateTime
    };
  }
  // 네이버 KBO: 진행 중은 statusCode "STARTED" (이닝 등은 statusInfo)
  if (status === 'LIVE' || status === 'IN_PROGRESS' || status === 'STARTED') {
    return {
      mode: 'live',
      myAbbr, oppAbbr, myLogo, oppLogo,
      myScore: String(myScore), oppScore: String(oppScore),
      isHome,
      period: game.statusInfo || 'LIVE',
      scoreKey: `${myScore}-${oppScore}`
    };
  }
  if (status === 'RESULT' || status === 'FINAL') {
    const myWon = myScore > oppScore;
    const isDraw = myScore === oppScore;
    return {
      mode: 'post',
      myAbbr, oppAbbr, myLogo, oppLogo,
      myScore: String(myScore), oppScore: String(oppScore),
      isHome,
      result: isDraw ? 'D' : (myWon ? 'W' : 'L'),
      scoreKey: `${myScore}-${oppScore}`
    };
  }
  return { mode: 'none' };
}

async function fetchKboNextGame(teamCode) {
  // KST 달력 기준 오늘부터 30일 이내, 아직 끝나지 않은 다음 일정 (종료 경기는 같은 날 스킵)
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = kboDateStr(d);
    const games = await fetchKboGames(dateStr);
    const game = games.find(g => (g.homeTeamCode === teamCode || g.awayTeamCode === teamCode) && !g.cancel && !g.suspended);
    if (!game) continue;
    const st = String(game.statusCode || '').trim().toUpperCase();
    if (st === 'RESULT' || st === 'FINAL') continue;

    const isHome = game.homeTeamCode === teamCode;
    const oppCode = isHome ? game.awayTeamCode : game.homeTeamCode;
    const oppTeam = kboTeamByCode(oppCode);
    return {
      date: game.gameDateTime,
      isHome,
      opponent: {
        name: oppTeam?.name || oppCode,
        abbreviation: oppTeam?.shortName || oppCode,
        logo: isHome ? game.awayTeamEmblemUrl : game.homeTeamEmblemUrl
      }
    };
  }
  return { seasonEnd: true };
}

async function fetchAllKboGames() {
  const games = await fetchKboGames();
  return games
    .filter(g => !g.cancel && !g.suspended)
    .map(g => {
      const homeTeam = kboTeamByCode(g.homeTeamCode);
      const awayTeam = kboTeamByCode(g.awayTeamCode);
      const status = g.statusCode;
      return {
        gameId: g.gameId,
        homeAbbr:  homeTeam?.shortName || g.homeTeamName,
        awayAbbr:  awayTeam?.shortName || g.awayTeamName,
        homeName:  homeTeam?.name || g.homeTeamName,
        awayName:  awayTeam?.name || g.awayTeamName,
        homeLogo:  g.homeTeamEmblemUrl,
        awayLogo:  g.awayTeamEmblemUrl,
        homeScore: g.homeTeamScore,
        awayScore: g.awayTeamScore,
        status,         // BEFORE / READY / STARTED / RESULT / FINAL …
        statusInfo: g.statusInfo,
        startTime: g.gameDateTime
      };
    });
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('standings:fetch', async (_, sport = 'nba') => {
    try {
      return await fetchStandings(sport);
    } catch (error) {
      return { error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('scoreboard:fetchByTeam', async (_, teamId, sport = 'nba', leagueId = null) => {
    return fetchTeamGameStatus(teamId, sport, leagueId);
  });

  ipcMain.handle('schedule:fetchNextGame', async (_, teamId, sport = 'nba', leagueId = null) => {
    return fetchNextGame(teamId, sport, leagueId);
  });

  ipcMain.handle('scoreboard:fetchAll', async (_, sport = 'nba', leagueId = null) => {
    return fetchAllGames(sport, leagueId);
  });

  ipcMain.handle('standings:fetchSoccer', async (_, leagueId = 'eng.1') => {
    return fetchSoccerStandings(leagueId);
  });

  ipcMain.handle('standings:fetchEpl', async () => {
    return fetchSoccerStandings('eng.1');
  });

  ipcMain.handle('ucl:fetchTournament', async () => {
    return fetchUclTournament();
  });

  ipcMain.handle('kbo:fetchTeamStatus', async (_, teamCode) => {
    return fetchKboTeamStatus(teamCode);
  });

  ipcMain.handle('kbo:fetchNextGame', async (_, teamCode) => {
    return fetchKboNextGame(teamCode);
  });

  ipcMain.handle('kbo:fetchAllGames', async () => {
    return fetchAllKboGames();
  });

  ipcMain.handle('kbo:getTeams', async () => {
    return KBO_TEAMS;
  });

  ipcMain.handle('ga4:track', async (_evt, payload) => {
    try {
      const clientId = payload?.clientId;
      const eventName = payload?.eventName;
      const params = payload?.params && typeof payload.params === 'object' ? payload.params : {};
      await sendGA4Event(clientId, eventName, params);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
