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
    // MLB는 비시즌에 파라미터 없이 조회하면 스프링캠프 데이터를 반환하므로
    // 시즌 연도를 명시하고, 현재 연도 → 이전 연도 순으로 fallback
    standingsUrls: (() => {
      const now = new Date();
      const month = now.getMonth() + 1; // 1=Jan, 3=Mar
      const y = now.getFullYear();
      // MLB 정규시즌: 4월~10월. 1~3월은 오프시즌이므로 전년도를 우선 조회
      const primary = month <= 3 ? y - 1 : y;
      return [
        `https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${primary}`,
        `https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${primary - 1}`,
        `https://site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${primary}`
      ];
    })(),
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

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*'
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

function mapConferenceRows(entries) {
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

    return {
      teamId, team, abbr, logo,
      w: wins || '-',
      l: losses || '-',
      wl: wins && losses ? `${wins}-${losses}` : '-',
      pct, gb, clincher, seed,
      winsNum: toNumber(wins, -1)
    };
  });

  rows.sort((a, b) => {
    if (a.seed !== b.seed) return a.seed - b.seed;
    return b.winsNum - a.winsNum;
  });

  return rows.map((row, index) => ({
    teamId: row.teamId,
    team: row.team,
    abbr: row.abbr,
    logo: row.logo,
    w: row.w,
    l: row.l,
    wl: row.wl,
    pct: row.pct,
    gb: row.gb,
    clincher: row.clincher,
    rank: Number.isFinite(row.seed) ? row.seed : index + 1
  }));
}

// MLB는 컨퍼런스 하위에 디비전이 있어 한 단계 더 flatten 필요
function getConferenceEntries(conf) {
  if (conf?.standings?.entries?.length) return conf.standings.entries;
  return (conf?.children || []).flatMap((div) => div.standings?.entries || []);
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

  for (const url of config.standingsUrls) {
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
      isHome, pitcher,
      scoreKey: `${myScore}-${oppScore}`
    };
  }
  if (state === 'pre') {
    return { mode: 'pre', myAbbr, oppAbbr, opponentName, isHome, startDateISO: event.date, pitcher };
  }
  if (state === 'post') {
    const myWon = Number(myScore) > Number(oppScore);
    return {
      mode: 'post',
      myScore, oppScore, myAbbr, oppAbbr,
      result: myWon ? 'W' : 'L',
      isHome, pitcher,
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

async function fetchNextGame(teamId, sport = 'nba', leagueId = null) {
  if (!teamId) return null;
  if (sport === 'epl') { sport = 'soccer'; leagueId = leagueId || 'eng.1'; }
  const scheduleBase = (sport === 'soccer' && leagueId)
    ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams`
    : (SPORT_CONFIG[sport]?.scheduleBase || SPORT_CONFIG.nba.scheduleBase);
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
        name: opp?.team?.shortDisplayName || opp?.team?.displayName || '상대팀',
        abbreviation: opp?.team?.abbreviation || '',
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
