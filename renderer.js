const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FAVORITE_TEAMS_KEY = 'favoriteTeams';   // [{ teamId, sport, leagueId? }]
const SCORE_LIVE_REFRESH_MS = 10 * 1000;
const SCORE_IDLE_REFRESH_MS = 30 * 60 * 1000;
/** 창 최소화·숨김 또는 탭이 백그라운드일 때 (배터리·트래픽 절약) */
const SCORE_LIVE_PEEK_MS = 2 * 60 * 1000;
const SCORE_IDLE_PEEK_MS = 45 * 60 * 1000;
const CARD_ACCENTS = ['#4d8cff', '#9c6ddf', '#2ec882', '#ff8040', '#ffc43d', '#df6e6e'];
const SPORT_EMOJI = { nba: '🏀', mlb: '⚾', soccer: '⚽' };

// ── 축구 리그 메타 (main.js의 SOCCER_LEAGUES와 동기화) ──
const SOCCER_LEAGUES = {
  'eng.1':          { name: 'EPL',        shortName: 'EPL',  emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'esp.1':          { name: 'La Liga',    shortName: 'LAL',  emoji: '🇪🇸' },
  'ger.1':          { name: 'Bundesliga', shortName: 'BUN',  emoji: '🇩🇪' },
  'ita.1':          { name: 'Serie A',    shortName: 'SRA',  emoji: '🇮🇹' },
  'uefa.champions': { name: 'UCL',        shortName: 'UCL',  emoji: '⭐' }
};
const SOCCER_LEAGUE_IDS = Object.keys(SOCCER_LEAGUES);

// 리그별 UEFA/강등 존
const SOCCER_ZONES = {
  'eng.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'esp.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'ger.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[16,18] },
  'ita.1':          { ucl:[1,4],  uel:[5,6],   playoff:null,   rel:[18,20] },
  'uefa.champions': { ucl:[1,8],  uel:null,    playoff:[9,24], rel:[25,36] }
};

// ── 스텔스 설정 키 ──
const PEEKS_OPACITY_KEY = 'peeks_opacity';
const PEEKS_GHOST_KEY   = 'peeks_ghost';
const PEEKS_MONO_KEY    = 'peeks_mono';
const PEEKS_CODER_KEY = 'peeks_coder';
const PEEKS_CODER_FORMAT_KEY = 'peeks_coder_format';

// ── GA4 Measurement Protocol (메인 프로세스 경유) ──
const GA4_CLIENT_ID_KEY = 'peeks_ga4_client_id';

function getOrCreateGaClientId() {
  try {
    let id = localStorage.getItem(GA4_CLIENT_ID_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `p_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(GA4_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return `p_${Date.now()}`;
  }
}

function gaTrack(eventName, params = {}) {
  try {
    const clientId = getOrCreateGaClientId();
    if (window.analyticsAPI?.trackEvent) {
      void window.analyticsAPI.trackEvent(clientId, eventName, params);
    }
  } catch (_) { /* noop */ }
}

function favoriteEntryKey(ft) {
  return `${ft.sport}:${ft.teamId}:${ft.leagueId || ''}`;
}

function teamNameFromCheckboxInput(input) {
  if (!input) return '';
  const label = input.closest('label');
  if (!label) return String(input.value || '');
  const clone = label.cloneNode(true);
  clone.querySelectorAll('input').forEach((el) => el.remove());
  clone.querySelectorAll('.team-checkbox-conf').forEach((el) => el.remove());
  const text = clone.textContent.replace(/\s+/g, ' ').trim();
  return text || String(input.value);
}

function findCheckboxForFavoriteEntry(entry) {
  const { teamId, sport, leagueId } = entry;
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(teamId) : String(teamId).replace(/"/g, '\\"');
  if (sport === 'nba') {
    return nbaCheckboxListEl?.querySelector(`input[type="checkbox"][value="${esc}"]`);
  }
  if (sport === 'mlb') {
    return mlbCheckboxListEl?.querySelector(`input[type="checkbox"][value="${esc}"]`);
  }
  if (sport === 'soccer') {
    const lid = leagueId || 'eng.1';
    const le = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(lid) : lid;
    return soccerCheckboxListEl?.querySelector(
      `input[type="checkbox"][value="${esc}"][data-league="${le}"]`
    );
  }
  return null;
}

// ── DOM 참조 ──
const statusEl = document.getElementById('status');
const easternBody = document.getElementById('east-body');
const westernBody = document.getElementById('west-body');
const alBody = document.getElementById('al-body');
const nlBody = document.getElementById('nl-body');
const updatedAtEl = document.getElementById('updated-at');
const favoriteSetupEl = document.getElementById('favorite-setup');
const nbaCheckboxListEl    = document.getElementById('nba-checkbox-list');
const mlbCheckboxListEl    = document.getElementById('mlb-checkbox-list');
const soccerCheckboxListEl = document.getElementById('soccer-checkbox-list');
const soccerSetupSection   = document.getElementById('soccer-setup-section');
const saveFavoriteBtn = document.getElementById('save-favorite-btn');
const homeBtn = document.getElementById('home-btn');
const settingsBtn = document.getElementById('settings-btn');
const toggleRankBtn = document.getElementById('toggle-rank-btn');
const myTeamViewEl = document.getElementById('my-team-view');
const myTeamsListEl = document.getElementById('my-teams-list');
const emptyStateEl  = document.getElementById('empty-state');
const emptyStateBtnEl = document.getElementById('empty-state-btn');
const tablesViewEl = document.getElementById('tables-view');
const nbaTablesEl     = document.getElementById('nba-tables');
const mlbTablesEl     = document.getElementById('mlb-tables');
const soccerTablesEl  = document.getElementById('soccer-tables');
const soccerStdBodyEl = document.getElementById('soccer-standings-body');
const soccerStandingsSubtabsEl = document.getElementById('soccer-standings-subtabs');
const soccerGamesSubtabsEl     = document.getElementById('soccer-games-subtabs');
// 하위 호환 alias (epl-body 제거됨 — soccer-standings-body 사용)
const eplBodyEl = soccerStdBodyEl;
const refreshBtn = document.getElementById('refresh-btn');
const teamSearchInput  = document.getElementById('team-search-input');
const teamSearchClear  = document.getElementById('team-search-clear');
const allGamesListEl    = document.getElementById('all-games-list');
const allGamesSectionEl = document.getElementById('all-games-section');
const allGamesToggleBtn = document.getElementById('all-games-toggle');
const gamesFilterTabsEl = document.getElementById('games-filter-tabs');
const opacitySlider   = document.getElementById('opacity-slider');
const opacityValEl    = document.getElementById('opacity-val');
const ghostModeCb     = document.getElementById('ghost-mode-cb');
const monoModeCb      = document.getElementById('mono-mode-cb');
const coderModeCb     = document.getElementById('coder-mode-cb');
const coderFormatRowEl = document.getElementById('coder-format-row');
const coderFormatLogEl = document.getElementById('coder-format-log');
const coderFormatCodeEl = document.getElementById('coder-format-code');

// ── 즐겨찾기 로드 (이전 버전 마이그레이션 포함) ──
function loadFavoriteTeams() {
  try {
    const raw = localStorage.getItem(FAVORITE_TEAMS_KEY);
    if (raw) {
      let teams = JSON.parse(raw);
      // 마이그레이션: sport:'epl' → sport:'soccer', leagueId:'eng.1'
      let migrated = false;
      teams = teams.map((ft) => {
        if (ft.sport === 'epl') { migrated = true; return { ...ft, sport: 'soccer', leagueId: 'eng.1' }; }
        return ft;
      });
      if (migrated) localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(teams));
      return teams;
    }
    // 이전 버전: 배열 of string IDs (NBA로 간주)
    const oldRaw = localStorage.getItem('favoriteTeamIds');
    if (oldRaw) {
      const oldIds = JSON.parse(oldRaw);
      const teams = oldIds.map((id) => ({ teamId: id, sport: 'nba' }));
      localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(teams));
      localStorage.removeItem('favoriteTeamIds');
      return teams;
    }
  } catch (_) {}
  return [];
}

// ── 상태 변수 ──
let nbaTeams = [];
let mlbTeams = [];
let soccerTeamsByLeague = {};   // { 'eng.1': [...], 'esp.1': [...], ... }
let soccerStandingsLoaded = {}; // { 'eng.1': true, ... }
let activeSoccerLeague = 'eng.1';   // 현재 순위/설정에서 선택된 리그
let activeSoccerGamesLeague = 'eng.1'; // All Games에서 선택된 리그
// 하위 호환 alias
Object.defineProperty(window, 'eplTeams', {
  get: () => soccerTeamsByLeague['eng.1'] || [],
  set: (v) => { soccerTeamsByLeague['eng.1'] = v; }
});

let favoriteTeams = loadFavoriteTeams();  // [{ teamId, sport, leagueId? }]
let currentView = 'my-team';
let activeSetupSport = 'nba';
let activeStandingsSport = 'nba';
let mlbStandingsLoaded = false;
let eplStandingsLoaded = false;  // 하위 호환

// ── 스텔스 상태 ──
let baseOpacity = parseFloat(localStorage.getItem(PEEKS_OPACITY_KEY) ?? '1');
let ghostMode   = localStorage.getItem(PEEKS_GHOST_KEY) === 'true';
let monoMode    = localStorage.getItem(PEEKS_MONO_KEY)  === 'true';
let coderMode   = localStorage.getItem(PEEKS_CODER_KEY) === 'true';
let coderFormat = localStorage.getItem(PEEKS_CODER_FORMAT_KEY) === 'code' ? 'code' : 'log';

// ── All Games 상태 ──
let allGamesCache     = { nba: null, mlb: null };  // soccer는 leagueId별로 캐시
let soccerGamesCache  = {};   // { 'eng.1': [...], ... }
let activeGamesSport  = 'nba';
let allGamesOpen      = false;
let scoreboardTimer = null;
let mainWinPeekMinimized = false;
let mainWinPeekHidden = false;
let lastScorePollHadLive = false;
let standingsSignature = '';
let teamGameStatuses = {};   // key: `${sport}_${teamId}`
let prevGameStatuses = {};
let teamNextGames = {};      // key: `${sport}_${teamId}`
let pendingFlashIds = new Set();
let isRefreshing = false;

function setStatus(msg) { statusEl.textContent = msg; }

// ── 스텔스 설정 적용 (투명도·고스트·모노; Coder는 body 클래스로 최우선 스타일) ──
function applyStealthSettings() {
  // CSS 변수로 투명도 제어
  document.documentElement.style.setProperty('--base-opacity', baseOpacity);
  // 고스트 모드: body 클래스로 :hover 오버라이드 활성화
  document.body.classList.toggle('ghost-mode', ghostMode);
  // 모노크롬: 위젯 전체 grayscale
  const w = document.querySelector('.widget');
  if (w) w.classList.toggle('mono', monoMode);
  applyCoderMode();
}

function applyCoderMode() {
  document.body.classList.toggle('coder-mode', coderMode);
  if (coderFormatRowEl) coderFormatRowEl.classList.toggle('hidden', !coderMode);
  syncCoderEmptyStateText();
}

function syncCoderEmptyStateText() {
  const tx = emptyStateEl?.querySelector('.empty-state-text');
  if (!tx) return;
  tx.textContent = coderMode
    ? '// no favorite teams — use settings (⚙) to add'
    : '아직 응원하는 팀이 없네요!';
}

// 설정 화면 열릴 때 컨트롤 동기화
function syncStealthControls() {
  const pct = Math.round(baseOpacity * 100);
  opacitySlider.value = pct;
  opacityValEl.textContent = `${pct}%`;
  ghostModeCb.checked = ghostMode;
  monoModeCb.checked  = monoMode;
  if (coderModeCb) coderModeCb.checked = coderMode;
  if (coderFormatLogEl && coderFormatCodeEl) {
    if (coderFormat === 'code') {
      coderFormatCodeEl.checked = true;
    } else {
      coderFormatLogEl.checked = true;
    }
  }
  if (coderFormatRowEl) coderFormatRowEl.classList.toggle('hidden', !coderMode);
}

// ── 종목 탭 전환 ──
function activateSportTab(sport) {
  activeSetupSport = sport;
  document.querySelectorAll('.sport-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sport === sport);
  });
  nbaCheckboxListEl.classList.toggle('hidden', sport !== 'nba');
  mlbCheckboxListEl.classList.toggle('hidden', sport !== 'mlb');
  soccerSetupSection.classList.toggle('hidden', sport !== 'soccer');
  if (sport === 'mlb' && !mlbTeams.length) loadMlbStandings();
  if (sport === 'soccer') {
    activateSoccerSetupTab(activeSoccerLeague);
  }
}

// ── 축구 설정 리그 서브탭 전환 ──
function activateSoccerSetupTab(leagueId) {
  activeSoccerLeague = leagueId;
  document.querySelectorAll('.soccer-setup-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.league === leagueId);
  });
  const teams = soccerTeamsByLeague[leagueId];
  if (!teams || !teams.length) {
    soccerCheckboxListEl.innerHTML = `<div style="font-size:10px;color:#7a8fa8;padding:6px 4px">${SOCCER_LEAGUES[leagueId]?.name || leagueId} 불러오는 중...</div>`;
    loadSoccerLeagueData(leagueId);
  } else {
    fillSoccerCheckboxList(teams, leagueId);
  }
}

// ── 체크박스 목록 렌더링 ──
function fillCheckboxList(teams, sport) {
  const containerEl = sport === 'mlb' ? mlbCheckboxListEl : nbaCheckboxListEl;
  const savedIds = favoriteTeams.filter((ft) => ft.sport === sport).map((ft) => ft.teamId);

  containerEl.innerHTML = teams
    .map((t) => {
      const checked = savedIds.includes(t.teamId);
      const conf = t.conference?.slice(0, 1) || '';
      return `
        <label class="team-checkbox-item${checked ? ' checked' : ''}">
          <input type="checkbox" value="${t.teamId}" data-sport="${sport}" ${checked ? 'checked' : ''} />
          ${t.team}
          <span class="team-checkbox-conf">${conf}</span>
        </label>`;
    })
    .join('');

  containerEl.querySelectorAll('.team-checkbox-item').forEach((label) => {
    label.querySelector('input').addEventListener('change', (e) => {
      label.classList.toggle('checked', e.target.checked);
    });
  });
}

// ── 축구 팀 체크박스 렌더링 ──
function fillSoccerCheckboxList(teams, leagueId) {
  const savedIds = favoriteTeams
    .filter((ft) => ft.sport === 'soccer' && ft.leagueId === leagueId)
    .map((ft) => ft.teamId);

  soccerCheckboxListEl.innerHTML = teams
    .map((t) => {
      const checked = savedIds.includes(t.teamId);
      return `
        <label class="team-checkbox-item${checked ? ' checked' : ''}">
          <input type="checkbox" value="${t.teamId}" data-sport="soccer" data-league="${leagueId}" ${checked ? 'checked' : ''} />
          ${t.team}
        </label>`;
    })
    .join('');

  soccerCheckboxListEl.querySelectorAll('.team-checkbox-item').forEach((label) => {
    label.querySelector('input').addEventListener('change', (e) => {
      label.classList.toggle('checked', e.target.checked);
    });
  });
}

// ── 팀 찾기 ──
function findTeam(teamId, sport, leagueId = null) {
  if (sport === 'soccer' || sport === 'epl') {
    const lid = leagueId || 'eng.1';
    const list = soccerTeamsByLeague[lid] || [];
    return list.find((t) => t.teamId === teamId);
  }
  const list = sport === 'mlb' ? mlbTeams : nbaTeams;
  return list.find((t) => t.teamId === teamId);
}

// ── UTC ISO → KST 표시 ──
function formatKST(isoDateStr) {
  try {
    const date = new Date(isoDateStr);
    const tz = { timeZone: 'Asia/Seoul' };
    const month = new Intl.DateTimeFormat('en', { ...tz, month: 'numeric' }).format(date);
    const day = new Intl.DateTimeFormat('en', { ...tz, day: 'numeric' }).format(date);
    const weekday = new Intl.DateTimeFormat('ko-KR', { ...tz, weekday: 'short' }).format(date);
    const time = new Intl.DateTimeFormat('ko-KR', {
      ...tz, hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date);
    return `${month}월 ${day}일(${weekday}) ${time}`;
  } catch (_) { return isoDateStr; }
}

// ── The Coder Mode: 터미널 로그 / const 스타일 ──
function escapeHtmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsStr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatCoderLogTimestamp() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

function statusDetailForCoder(status, sport) {
  if (!status) return '';
  if (status.mode === 'live') return status.period || 'LIVE';
  if (status.mode === 'post') {
    return sport === 'soccer' || sport === 'epl' ? 'FT' : 'FINAL';
  }
  if (status.mode === 'pre') {
    if (!status.startDateISO) return 'TBD';
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(status.startDateISO));
  }
  if (status.mode === 'loading') return 'LOADING';
  if (status.mode === 'none') return 'NO_GAME';
  return 'UNKNOWN';
}

function homeAwaySplit(status) {
  const my = status.myAbbr || '?';
  const opp = status.oppAbbr || '?';
  const ms = Number(status.myScore ?? 0);
  const os = Number(status.oppScore ?? 0);
  if (status.mode === 'pre') {
    if (status.isHome) return { home: my, away: opp, hs: 0, as: 0 };
    return { home: opp, away: my, hs: 0, as: 0 };
  }
  if (status.isHome) return { home: my, away: opp, hs: ms, as: os };
  return { home: opp, away: my, hs: os, as: ms };
}

function formatFavoriteCoderBlock(status, sport, teamSlug) {
  const ts = formatCoderLogTimestamp();
  const slugComment = escapeJsStr(teamSlug || 'team');
  const slugPlain = String(teamSlug || 'team');

  if (!status || status.mode === 'loading') {
    return coderFormat === 'code'
      ? `// ${slugComment}\nconst match = { status: "LOADING" };`
      : `[${ts}] WAIT: ${slugPlain} …`;
  }
  if (status.mode === 'none') {
    return coderFormat === 'code'
      ? `// ${slugComment}\nconst match = { status: "NO_GAME" };`
      : `[${ts}] IDLE: ${slugPlain} — no scheduled game`;
  }

  const { home, away, hs, as } = homeAwaySplit(status);

  if (status.mode === 'pre') {
    const detail = statusDetailForCoder(status, sport);
    if (coderFormat === 'code') {
      return `// ${slugComment}\nconst match = { home: "${escapeJsStr(home)}", away: "${escapeJsStr(away)}", score: [0, 0], status: "SCHEDULED", at: "${escapeJsStr(detail)}" };`;
    }
    return `[${ts}] PRE: ${away} @ ${home} — ${detail}`;
  }
  if (status.mode === 'live') {
    const clock = statusDetailForCoder(status, sport);
    if (coderFormat === 'code') {
      return `// ${slugComment}\nconst match = { home: "${escapeJsStr(home)}", away: "${escapeJsStr(away)}", score: [${as}, ${hs}], status: "LIVE", clock: "${escapeJsStr(clock)}" };`;
    }
    return `[${ts}] INFO: ${away}(${as}) vs ${home}(${hs}) - ${clock}`;
  }
  if (status.mode === 'post') {
    const fin = statusDetailForCoder(status, sport);
    const stLiteral = fin === 'FT' ? 'FT' : 'FINAL';
    if (coderFormat === 'code') {
      return `// ${slugComment}\nconst match = { home: "${escapeJsStr(home)}", away: "${escapeJsStr(away)}", score: [${as}, ${hs}], status: "${stLiteral}" };`;
    }
    return `[${ts}] INFO: ${away}(${as}) vs ${home}(${hs}) - ${fin}`;
  }
  if (status.mode === 'error' || status.mode === 'unknown') {
    return coderFormat === 'code'
      ? `// ${slugComment}\nconst match = { status: "UNKNOWN" };`
      : `[${ts}] WARN: ${slugPlain} — unknown`;
  }
  return `[${ts}] WARN: ${slugPlain}`;
}

function formatFavoriteCoderNextLine(nextGame, status) {
  if (status?.mode === 'live' || status?.mode === 'pre') return '';
  if (!nextGame?.date) return '';
  if (nextGame.seasonEnd) {
    return coderFormat === 'code'
      ? '// next: { season: "END" }'
      : `[${formatCoderLogTimestamp()}] NEXT: season ended`;
  }
  const prefix = nextGame.isHome ? 'vs' : '@';
  const oppAb = nextGame.opponent?.abbreviation || nextGame.opponent?.name || '?';
  const when = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(nextGame.date));
  if (coderFormat === 'code') {
    return `// next: { opp: "${escapeJsStr(oppAb)}", side: "${prefix === 'vs' ? 'home' : 'away'}", at: "${escapeJsStr(when)}" }`;
  }
  return `[${formatCoderLogTimestamp()}] NEXT: ${prefix} ${oppAb} · ${when}`;
}

function gameRowCoderHTML(game, sport) {
  const ts = formatCoderLogTimestamp();
  const away = escapeHtmlText(game.away.abbr || '?');
  const home = escapeHtmlText(game.home.abbr || '?');
  const lid = sport === 'soccer' ? activeSoccerGamesLeague : '';
  const bAway = `<button type="button" class="coder-fav-hit" data-team-id="${game.away.id}" data-sport="${sport}" data-league="${lid}">+${away}</button>`;
  const bHome = `<button type="button" class="coder-fav-hit" data-team-id="${game.home.id}" data-sport="${sport}" data-league="${lid}">+${home}</button>`;

  if (coderFormat === 'log') {
    let inner = '';
    if (game.state === 'pre') {
      inner = `[${ts}] PLN: ${away} @ ${home} — ${escapeHtmlText(formatGameTime(game.date))}`;
    } else if (game.state === 'post') {
      inner = `[${ts}] FIN: ${away}(${game.away.score}) vs ${home}(${game.home.score})`;
    } else {
      inner = `[${ts}] LIVE: ${away}(${game.away.score}) vs ${home}(${game.home.score}) — ${escapeHtmlText(game.status || '')}`;
    }
    return `<div class="coder-game-line">${inner} ${bAway}${bHome}</div>`;
  }

  const st = game.state === 'pre' ? 'SCHEDULED' : game.state === 'post' ? 'FINAL' : 'LIVE';
  const scr = game.state === 'pre' ? '[0, 0]' : `[${game.away.score}, ${game.home.score}]`;
  const clock = game.state === 'in' ? escapeJsStr(game.status || '') : '';
  const clockPart = clock ? `, clock: "${clock}"` : '';
  const line = `const match = { away: "${escapeJsStr(game.away.abbr)}", home: "${escapeJsStr(game.home.abbr)}", score: ${scr}, status: "${st}"${clockPart} };`;
  return `<div class="coder-game-line"><span class="coder-line-main">${escapeHtmlText(line)}</span> ${bAway}${bHome}</div>`;
}

// ── EPL 전용 축구 카드 본문 HTML ──
function soccerCardBodyHTML(status) {
  if (!status || status.mode === 'none') {
    return `<div class="card-no-game">오늘 예정된 경기가 없습니다</div>`;
  }
  if (status.mode === 'loading') {
    return `<div class="card-no-game">데이터 불러오는 중...</div>`;
  }

  // 축구 상태 텍스트: "1H 23'" / "HT" / "2H 67'" / "FT" 등
  const statusCls = status.mode === 'live' ? 'live'
    : (status.period || '').toLowerCase().includes('ht') || (status.period || '').includes('halftime') ? 'ht'
    : '';

  if (status.mode === 'live' || status.mode === 'post') {
    const label = status.mode === 'post' ? 'FT' : status.period || 'LIVE';
    return `
      <div class="card-soccer-body">
        <div class="card-soccer-team">
          <img class="card-soccer-logo" src="${status.myLogo || ''}" alt="" onerror="this.style.display='none'" />
          <span class="card-soccer-abbr">${status.myAbbr}</span>
        </div>
        <div class="card-soccer-center">
          <span class="card-soccer-score">${status.myScore} – ${status.oppScore}</span>
          <span class="card-soccer-status ${statusCls}">${label}</span>
        </div>
        <div class="card-soccer-team">
          <img class="card-soccer-logo" src="${status.oppLogo || ''}" alt="" onerror="this.style.display='none'" />
          <span class="card-soccer-abbr">${status.oppAbbr}</span>
        </div>
      </div>`;
  }
  if (status.mode === 'pre') {
    const prefix = status.isHome ? 'vs' : '@';
    const timeStr = status.startDateISO ? formatKST(status.startDateISO) : '-';
    return `
      <div class="card-soccer-body">
        <div class="card-soccer-team">
          <img class="card-soccer-logo" src="${status.myLogo || ''}" alt="" onerror="this.style.display='none'" />
          <span class="card-soccer-abbr">${status.myAbbr}</span>
        </div>
        <div class="card-soccer-center">
          <span class="card-soccer-score" style="font-size:11px;letter-spacing:0">${prefix} ${status.oppAbbr}</span>
          <span class="card-soccer-status">${timeStr.replace(/\d{1,2}월 \d{1,2}일\([가-힣]\) /, '')}</span>
        </div>
        <div class="card-soccer-team">
          <img class="card-soccer-logo" src="${status.oppLogo || ''}" alt="" onerror="this.style.display='none'" />
          <span class="card-soccer-abbr">${status.oppAbbr}</span>
        </div>
      </div>`;
  }
  return `<div class="card-no-game">경기 정보 확인 중...</div>`;
}

// ── MLB 투수 정보 HTML ──
function pitcherHTML(pitcher, mode) {
  try {
    if (!pitcher || typeof pitcher !== 'object') return '';
    if (pitcher.mode === 'current' && mode === 'live') {
      const name = pitcher.name || '';
      if (!name) return '';
      const sum = pitcher.summary ? ` · ${pitcher.summary}` : '';
      return `<div class="card-pitcher">⚾ ${name}${sum}</div>`;
    }
    if (pitcher.mode === 'probable') {
      const myAbbr  = pitcher.myAbbr  || '';
      const oppAbbr = pitcher.oppAbbr || '';
      const my  = (pitcher.my?.name)  ? `${myAbbr} ${pitcher.my.name} ${pitcher.my.record  || ''}`.trim() : '';
      const opp = (pitcher.opp?.name) ? `${oppAbbr} ${pitcher.opp.name} ${pitcher.opp.record || ''}`.trim() : '';
      if (!my && !opp) return '';
      const parts = [my, opp].filter(Boolean);
      return `<div class="card-pitcher">${parts.join('<span class="card-pitcher-sep"> vs </span>')}</div>`;
    }
    return '';
  } catch (e) {
    console.error('[pitcherHTML] 오류:', e);
    return '';
  }
}

// ── 카드 본문: 오늘 경기 상태 ──
function cardBodyHTML(status, sport = 'nba') {
  try {
    if (!status || status.mode === 'none') {
      return `<div class="card-no-game">오늘 예정된 경기가 없습니다</div>`;
    }
    if (status.mode === 'loading') {
      return `<div class="card-no-game">데이터 불러오는 중...</div>`;
    }
    if (status.mode === 'error' || status.mode === 'unknown') {
      return `<div class="card-no-game">경기 정보 확인 중...</div>`;
    }
    if (status.mode === 'live') {
      return `
        <div class="card-score-header">
          <span class="live-dot">●</span>
          <span class="card-period">${status.period || ''}</span>
        </div>
        <div class="card-score-row">
          <span class="card-abbr">${status.myAbbr || ''}</span>
          <span class="card-score-big">${status.myScore ?? '0'} – ${status.oppScore ?? '0'}</span>
          <span class="card-abbr opp">${status.oppAbbr || ''}</span>
        </div>
        ${sport === 'mlb' ? pitcherHTML(status.pitcher, 'live') : ''}`;
    }
    if (status.mode === 'post') {
      const rc = status.result === 'W' ? 'win' : 'loss';
      return `
        <div class="card-final-label">FINAL <span class="card-result ${rc}">${status.result || ''}</span></div>
        <div class="card-score-row">
          <span class="card-abbr">${status.myAbbr || ''}</span>
          <span class="card-score-big">${status.myScore ?? '0'} – ${status.oppScore ?? '0'}</span>
          <span class="card-abbr opp">${status.oppAbbr || ''}</span>
        </div>
        ${sport === 'mlb' ? pitcherHTML(status.pitcher, 'post') : ''}`;
    }
    if (status.mode === 'pre') {
      const prefix = status.isHome ? 'vs' : '@';
      const timeStr = status.startDateISO ? formatKST(status.startDateISO) : '-';
      return `
        <div class="card-no-game">오늘 경기 예정</div>
        <div class="card-pre-detail">${prefix} ${status.oppAbbr || ''} · ${timeStr}</div>
        ${sport === 'mlb' ? pitcherHTML(status.pitcher, 'pre') : ''}`;
    }
    return `<div class="card-no-game">경기 정보 확인 중...</div>`;
  } catch (e) {
    console.error('[cardBodyHTML] 렌더링 오류:', e, status);
    return `<div class="card-no-game">데이터 준비 중...</div>`;
  }
}

// ── 카드 푸터: 다음 경기 ──
function cardFooterHTML(nextGame, status) {
  if (status?.mode === 'live' || status?.mode === 'pre') return '';
  if (!nextGame) return '';
  if (nextGame.seasonEnd) {
    return `<div class="card-footer"><span class="card-next-label">NEXT</span><span class="card-next-date">시즌 종료</span></div>`;
  }
  if (!nextGame.date) return '';
  const prefix = nextGame.isHome ? 'vs' : '@';
  const logoHtml = nextGame.opponent?.logo
    ? `<img class="card-next-logo" src="${nextGame.opponent.logo}" alt="" onerror="this.style.display='none'" />`
    : '';
  return `
    <div class="card-footer">
      <span class="card-next-label">NEXT</span>
      ${logoHtml}
      <span class="card-next-opponent">${prefix} ${nextGame.opponent?.name || '-'}</span>
      <span class="card-next-date">${formatKST(nextGame.date)}</span>
    </div>`;
}

// ── 팀 카드 목록 렌더링 ──
function renderTeamCards() {
  if (!favoriteTeams.length) {
    if (emptyStateEl) emptyStateEl.classList.remove('hidden');
    if (myTeamsListEl) myTeamsListEl.innerHTML = '';
    syncCoderEmptyStateText();
    return;
  }
  if (emptyStateEl) emptyStateEl.classList.add('hidden');

  const html = favoriteTeams.map(({ teamId, sport, leagueId }, idx) => {
    try {
      const team = findTeam(teamId, sport, leagueId);
      const key = `${sport}_${teamId}`;
      const hasSoccer = Object.values(soccerTeamsByLeague).some((arr) => arr.length > 0);
      const hasAnyTeams = nbaTeams.length || mlbTeams.length || hasSoccer;
      const status = teamGameStatuses[key] || (hasAnyTeams ? { mode: 'none' } : { mode: 'loading' });
      const nextGame = teamNextGames[key];
      const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

      const teamName = team?.team || team?.name || '로딩 중...';

      if (coderMode) {
        const block = formatFavoriteCoderBlock(status, sport, teamName);
        const nextLn = formatFavoriteCoderNextLine(nextGame, status);
        const fullRaw = nextLn ? `${block}\n${nextLn}` : block;
        const fullHtml = escapeHtmlText(fullRaw);
        const preCls =
          coderFormat === 'code' ? 'coder-block coder-block--code' : 'coder-block';
        return `
        <div class="team-card coder-card" data-key="${key}" data-team-id="${teamId}" data-sport="${sport}" data-league="${leagueId || ''}">
          <pre class="${preCls}">${fullHtml}</pre>
        </div>`;
      }
      const abbr = team?.abbr || teamName.slice(0, 3).toUpperCase();
      const conf = team?.conference?.slice(0, 1) || '';
      const isSoccer = (sport === 'soccer' || sport === 'epl');
      const rank = team ? (isSoccer ? `${team.rank}위` : `${conf}${team.rank}위`) : '-';
      const record = isSoccer
        ? (team ? `${team.w}W ${team.d ?? '-'}D ${team.l}L` : '-')
        : (team ? `${team.w}-${team.l}` : '-');
      const logoHtml = team?.logo
        ? `<img class="card-team-logo" src="${team.logo}" alt="" onerror="this.style.display='none'" />`
        : `<span class="card-sport-emoji">${SPORT_EMOJI[sport] || ''}</span>`;

      let bodyInner = '';
      try {
        bodyInner = isSoccer ? soccerCardBodyHTML(status) : cardBodyHTML(status, sport);
      } catch (e) {
        console.error(`[renderCard] bodyHTML 오류 (${key}):`, e);
        bodyInner = `<div class="card-no-game">데이터 준비 중...</div>`;
      }
      const bodyHTML = `<div class="card-body">${bodyInner}</div>`;

      let footerHTML = '';
      try {
        footerHTML = !isSoccer ? cardFooterHTML(nextGame, status) : '';
      } catch (e) {
        console.error(`[renderCard] footerHTML 오류 (${key}):`, e);
      }

      return `
        <div class="team-card" data-key="${key}" data-team-id="${teamId}" data-sport="${sport}" data-league="${leagueId || ''}" style="--accent:${accent}">
          <div class="card-header">
            <div class="card-header-left">
              ${logoHtml}
              <span class="card-team-name">${teamName}</span>
              <span class="card-abbr-name">${abbr}</span>
            </div>
            <div class="card-meta">
              <span class="card-rank">${rank}</span>
              <span class="card-record">${record}</span>
            </div>
          </div>
          ${bodyHTML}
          ${footerHTML}
        </div>`;
    } catch (e) {
      console.error(`[renderCard] 카드 렌더링 오류 (${sport}_${teamId}):`, e);
      return `<div class="team-card" style="--accent:#666"><div class="card-no-game">카드 오류</div></div>`;
    }
  }).join('');

  myTeamsListEl.innerHTML = html;

  for (const key of pendingFlashIds) {
    const cardBody = myTeamsListEl.querySelector(`[data-key="${key}"] .card-body`);
    const coderBlock = myTeamsListEl.querySelector(`[data-key="${key}"] .coder-block`);
    if (cardBody) cardBody.classList.add('score-flash');
    if (coderBlock) coderBlock.classList.add('score-flash');
  }
  pendingFlashIds.clear();
}

// ── 즐겨찾기 추가 (All Games → My Teams) ──
function addToFavorites(teamId, sport, leagueId = null) {
  if (!teamId || !sport) return;
  const already = favoriteTeams.some(
    (ft) => ft.sport === sport && ft.teamId === teamId &&
            (leagueId ? ft.leagueId === leagueId : true)
  );
  if (already) return;
  const entry = leagueId ? { teamId, sport, leagueId } : { teamId, sport };
  favoriteTeams = [...favoriteTeams, entry];
  localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(favoriteTeams));
  const tmeta = findTeam(teamId, sport, leagueId);
  const tname = tmeta?.team || tmeta?.name || String(teamId);
  gaTrack('add_team', { team_name: tname, sport, league_id: leagueId || '' });
  // soccer 팀이면 리그 데이터 미리 로드
  if (sport === 'soccer' && leagueId && !soccerTeamsByLeague[leagueId]?.length) {
    loadSoccerLeagueData(leagueId);
  }
  renderTeamCards();
  renderAllGames();
  loadTeamGameStatus();
  loadNextGame();
}

// ── 게임 행 HTML ──
function formatGameTime(isoDateStr) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true
    }).format(new Date(isoDateStr));
  } catch (_) { return '예정'; }
}

function teamBtn(teamId, sport, logo, isFav) {
  const logoHtml = logo
    ? `<img class="gr-logo" src="${logo}" alt="" onerror="this.style.display='none'" />`
    : `<span class="gr-logo-fallback">${SPORT_EMOJI[sport] || ''}</span>`;
  return `<button class="gr-team-btn ${isFav ? 'fav' : ''}" data-team-id="${teamId}" data-sport="${sport}" data-league="${activeSoccerGamesLeague || ''}">${logoHtml}</button>`;
}

function gameRowHTML(game, sport) {
  const awayFav = favoriteTeams.some((ft) => ft.sport === sport && ft.teamId === game.away.id);
  const homeFav = favoriteTeams.some((ft) => ft.sport === sport && ft.teamId === game.home.id);

  const statusCls  = game.state === 'in' ? 'live' : game.state === 'post' ? 'final' : '';
  const statusText = game.state === 'post' ? 'FIN'
    : game.state === 'in'  ? game.status
    : formatGameTime(game.date);

  const center = game.state === 'pre'
    ? `<span class="gr-abbr">${game.away.abbr}</span><span class="gr-vs">@</span><span class="gr-abbr">${game.home.abbr}</span>`
    : `<span class="gr-score">${game.away.score}</span><span class="gr-vs">–</span><span class="gr-score">${game.home.score}</span>`;

  return `
    <div class="game-row">
      <span class="gr-status ${statusCls}">${statusText}</span>
      ${teamBtn(game.away.id, sport, game.away.logo, awayFav)}
      <div class="gr-center">${center}</div>
      ${teamBtn(game.home.id, sport, game.home.logo, homeFav)}
    </div>`;
}

// ── 축구 ALL GAMES: 리그별 스코어보드 선조회 (리그 탭 노출 여부 판단용) ──
function prefetchAllSoccerGamesCaches() {
  SOCCER_LEAGUE_IDS.forEach((lid) => {
    if (soccerGamesCache[lid] === undefined) {
      loadAllGames('soccer', lid);
    }
  });
}

/** ALL GAMES 접힘 / 타 종목 선택 시 숨김. 축구일 때는 5개 리그를 모두 조회한 뒤 전부 경기 0이면 숨김. */
function syncSoccerGamesSubtabsVisibility() {
  if (!soccerGamesSubtabsEl) return;
  if (!allGamesOpen || activeGamesSport !== 'soccer') {
    soccerGamesSubtabsEl.classList.add('hidden');
    return;
  }
  let anyLoading = false;
  let anyGames = false;
  for (const lid of SOCCER_LEAGUE_IDS) {
    const c = soccerGamesCache[lid];
    if (c === undefined) anyLoading = true;
    else if (Array.isArray(c) && c.length > 0) anyGames = true;
  }
  const show = anyLoading || anyGames;
  soccerGamesSubtabsEl.classList.toggle('hidden', !show);
}

// ── 전체 경기 렌더링 ──
function renderAllGames() {
  let games;
  if (activeGamesSport === 'soccer') {
    games = soccerGamesCache[activeSoccerGamesLeague];
  } else {
    games = allGamesCache[activeGamesSport];
  }
  if (games === null || games === undefined) {
    allGamesListEl.innerHTML = '<div class="gr-empty">불러오는 중...</div>';
    syncSoccerGamesSubtabsVisibility();
    return;
  }
  if (!games.length) {
    allGamesListEl.innerHTML = '<div class="gr-empty">오늘 예정된 경기가 없습니다</div>';
    syncSoccerGamesSubtabsVisibility();
    return;
  }
  if (coderMode) {
    allGamesListEl.innerHTML = games.map((g) => gameRowCoderHTML(g, activeGamesSport)).join('');
    allGamesListEl.querySelectorAll('.coder-fav-hit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const leagueId = btn.dataset.league || null;
        addToFavorites(btn.dataset.teamId, btn.dataset.sport, leagueId);
      });
    });
  } else {
    allGamesListEl.innerHTML = games.map((g) => gameRowHTML(g, activeGamesSport)).join('');
    allGamesListEl.querySelectorAll('.gr-team-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const leagueId = btn.dataset.league || null;
        addToFavorites(btn.dataset.teamId, btn.dataset.sport, leagueId);
      });
    });
  }
  syncSoccerGamesSubtabsVisibility();
}

// ── 전체 경기 데이터 로드 ──
async function loadAllGames(sport = activeGamesSport, leagueId = null) {
  const lid = sport === 'soccer' ? (leagueId || activeSoccerGamesLeague) : null;
  try {
    const games = await window.standingsAPI.fetchAllGames(sport, lid);
    if (sport === 'soccer') {
      soccerGamesCache[lid] = games || [];
    } else {
      allGamesCache[sport] = games || [];
    }
    if (sport === activeGamesSport && allGamesOpen) renderAllGames();
    else syncSoccerGamesSubtabsVisibility();
  } catch (err) {
    console.error(`[allgames:${sport}:${lid}] 로딩 실패`, err);
    if (sport === 'soccer') soccerGamesCache[lid] = [];
    else allGamesCache[sport] = [];
    if (sport === activeGamesSport && allGamesOpen) renderAllGames();
    else syncSoccerGamesSubtabsVisibility();
  }
}

// ── 뷰 전환 ──
function setView(view) {
  currentView = view;
  favoriteSetupEl.classList.toggle('hidden', view !== 'setup');
  myTeamViewEl.classList.toggle('hidden', view !== 'my-team');
  tablesViewEl.classList.toggle('hidden', view !== 'all-rank');

  // 버튼 상태 동기화
  homeBtn.classList.toggle('is-home', view === 'my-team');
  toggleRankBtn.classList.toggle('active-view', view === 'all-rank');
  settingsBtn.classList.toggle('active-view', view === 'setup');

  // my-team 진입 시 empty state 동기화
  if (view === 'my-team' && emptyStateEl) {
    emptyStateEl.classList.toggle('hidden', favoriteTeams.length > 0);
  }
}

// ── 플레이오프 구간 행 클래스 결정 ──
function getRowClass(rank, sport) {
  if (rank >= 1 && rank <= 6) return 'row-po';        // PO / 포스트시즌권 (NBA·MLB 공통)
  if (sport !== 'mlb' && rank >= 7 && rank <= 10) return 'row-pi';  // NBA 플레이인
  return '';
}

// ── 확정 마크 포맷 ──
function clincherBadge(c) {
  if (!c || c === '-') return '';
  // 의미 있는 값만 표시 (e=탈락은 제외)
  if (c === 'e') return '';
  return `<span class="clincher-badge">(${c})</span>`;
}

// ── 로딩용 빈 행 ──
function loadingRow(text = '데이터 로딩 중...') {
  return `<tr><td class="col-rank"></td><td class="col-team team" colspan="4" style="color:#7a8fa8">${text}</td></tr>`;
}

// ── 실제 데이터 행 ──
function teamRow(r, sport) {
  if (sport === 'soccer' || sport === 'epl') {
    // 리그별 존 규칙 적용
    const leagueId = r.leagueId || 'eng.1';
    const zones = SOCCER_ZONES[leagueId] || SOCCER_ZONES['eng.1'];
    const rk = Number(r.rank);
    const zone = (zones.ucl     && rk >= zones.ucl[0]     && rk <= zones.ucl[1])     ? 'row-ucl'
               : (zones.uel     && rk >= zones.uel[0]     && rk <= zones.uel[1])     ? 'row-uel'
               : (zones.playoff && rk >= zones.playoff[0] && rk <= zones.playoff[1]) ? 'row-pi'
               : (zones.rel     && rk >= zones.rel[0]     && rk <= zones.rel[1])     ? 'row-rel'
               : '';
    const isFav = favoriteTeams.some(
      (ft) => ft.sport === 'soccer' && ft.leagueId === leagueId && String(ft.teamId) === String(r.teamId)
    );
    const logoHtml = r.logo
      ? `<img src="${r.logo}" alt="" onerror="this.style.display='none'" />`
      : '';
    const favMark = isFav ? '<span class="epl-fav-mark">★</span>' : '';
    return `
      <tr class="${zone}" data-team-id="${r.teamId}" data-sport="soccer" data-league="${leagueId}">
        <td class="col-rank">${r.rank ?? ''}</td>
        <td class="col-epl-logo">${logoHtml}</td>
        <td class="col-team team">${r.team}${favMark}</td>
        <td class="col-epl-num">${r.w ?? '-'}</td>
        <td class="col-epl-num">${r.d ?? '-'}</td>
        <td class="col-epl-num">${r.l ?? '-'}</td>
        <td class="col-epl-pts">${r.pts ?? '-'}</td>
      </tr>`;
  }

  const cls = getRowClass(r.rank, sport);
  const gbCell = sport === 'mlb' ? `<td class="col-gb">${r.gb ?? '-'}</td>` : '';
  return `
    <tr class="${cls}">
      <td class="col-rank">${r.rank ?? ''}</td>
      <td class="col-team team">${r.team}${clincherBadge(r.clincher)}</td>
      <td class="col-w">${r.w ?? '-'}</td>
      <td class="col-l">${r.l ?? '-'}</td>
      <td class="col-pct">${r.pct}</td>
      ${gbCell}
    </tr>`;
}

// ── 축구 순위 테이블 클릭 이벤트 (즐겨찾기 토글) ──
// 이벤트 위임 방식 - tbody 자체에 한 번만 바인딩, 행 교체 시에도 유효
function attachSoccerTableEvents() {
  const body = soccerStdBodyEl;
  if (!body || body._soccerClickBound) return;
  body._soccerClickBound = true;
  body.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-team-id]');
    if (!row) return;
    const teamId = row.dataset.teamId;
    const lid    = row.dataset.league || activeSoccerLeague;
    const idx = favoriteTeams.findIndex(
      (ft) => ft.sport === 'soccer' && ft.leagueId === lid && String(ft.teamId) === String(teamId)
    );
    if (idx >= 0) {
      favoriteTeams = favoriteTeams.filter((_, i) => i !== idx);
    } else {
      favoriteTeams = [...favoriteTeams, { teamId, sport: 'soccer', leagueId: lid }];
      const nm = row.querySelector('.col-team')?.textContent?.replace(/★/g, '').trim() || String(teamId);
      gaTrack('add_team', { team_name: nm, sport: 'soccer', league_id: lid });
    }
    localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(favoriteTeams));
    renderTeamCards();
    loadTeamGameStatus();
    loadNextGame();
    const isNowFav = favoriteTeams.some(
      (ft) => ft.sport === 'soccer' && ft.leagueId === lid && String(ft.teamId) === String(teamId)
    );
    const mark = row.querySelector('.epl-fav-mark');
    const nameCell = row.querySelector('.col-team');
    if (isNowFav && !mark && nameCell) {
      nameCell.insertAdjacentHTML('beforeend', '<span class="epl-fav-mark">★</span>');
    } else if (!isNowFav && mark) {
      mark.remove();
    }
  });
}

function renderRows(target, rows, sport = 'nba') {
  target.innerHTML = rows.map((r) => teamRow(r, sport)).join('');
}

// ── 타이머 ──
function resetScoreboardTimer(ms) {
  if (scoreboardTimer) clearInterval(scoreboardTimer);
  scoreboardTimer = setInterval(loadTeamGameStatus, ms);
}

function peekFetchBackgrounded() {
  if (mainWinPeekMinimized || mainWinPeekHidden) return true;
  try {
    return document.visibilityState === 'hidden';
  } catch (_) {
    return false;
  }
}

function scorePollIntervalMs(hasLive) {
  const bg = peekFetchBackgrounded();
  if (!favoriteTeams.length) {
    return bg ? SCORE_IDLE_PEEK_MS : SCORE_IDLE_REFRESH_MS;
  }
  if (hasLive) return bg ? SCORE_LIVE_PEEK_MS : SCORE_LIVE_REFRESH_MS;
  return bg ? SCORE_IDLE_PEEK_MS : SCORE_IDLE_REFRESH_MS;
}

function resyncScoreboardTimer() {
  resetScoreboardTimer(scorePollIntervalMs(lastScorePollHadLive));
}

// ── 다음 경기 조회 ──
async function loadNextGame() {
  if (!favoriteTeams.length) return;

  const results = await Promise.all(
    favoriteTeams.map(({ teamId, sport, leagueId }) =>
      window.standingsAPI.fetchNextGame(teamId, sport, leagueId || null).then((r) => ({ teamId, sport, result: r }))
    )
  );

  results.forEach(({ teamId, sport, result }) => {
    teamNextGames[`${sport}_${teamId}`] = result;
  });

  renderTeamCards();
}

// ── 오늘 경기 상태 조회 ──
async function loadTeamGameStatus() {
  if (!favoriteTeams.length) {
    renderTeamCards();
    lastScorePollHadLive = false;
    resetScoreboardTimer(scorePollIntervalMs(false));
    return;
  }

  // Promise.allSettled: 한 팀 실패해도 나머지는 정상 처리
  let settled;
  try {
    settled = await Promise.allSettled(
      favoriteTeams.map(({ teamId, sport, leagueId }) =>
        window.standingsAPI.fetchScoreboardByTeam(teamId, sport, leagueId || null)
      )
    );
  } catch (err) {
    console.error('[loadTeamGameStatus] IPC 오류:', err);
    renderTeamCards();
    resetScoreboardTimer(scorePollIntervalMs(lastScorePollHadLive));
    return;
  }

  let hasLive = false;

  settled.forEach((result, i) => {
    const { teamId, sport, leagueId } = favoriteTeams[i];
    const key = `${sport}_${teamId}`;

    if (result.status === 'rejected') {
      console.error(`[scoreboard] ${key} 상태 조회 실패:`, result.reason);
      // 이전 상태 유지, 다음 카드로 계속
      return;
    }

    const status = result.value;
    const prev = prevGameStatuses[key];

    // Soccer: 경기 상태에 팀 로고 보강 (ID 기반 직접 매핑)
    if (status && (sport === 'soccer' || sport === 'epl')) {
      try {
        const lid = leagueId || 'eng.1';
        const leagueTeams = soccerTeamsByLeague[lid] || [];
        const myTeam = leagueTeams.find((t) => t.teamId === String(teamId));
        if (myTeam) {
          status.myLogo = myTeam.logo;
          const oppTeam = leagueTeams.find((t) => t.abbr === status.oppAbbr);
          status.oppLogo = oppTeam?.logo || '';
        }
      } catch (e) {
        console.error('[scoreboard] Soccer 로고 매핑 오류:', e);
      }
    }

    if (
      status?.mode === 'live' && prev?.mode === 'live' &&
      status.scoreKey && prev.scoreKey && status.scoreKey !== prev.scoreKey
    ) {
      pendingFlashIds.add(key);
    }

    prevGameStatuses[key] = teamGameStatuses[key];
    teamGameStatuses[key] = status;
    if (status?.mode === 'live') hasLive = true;
  });

  renderTeamCards();
  if (!hasLive) loadNextGame();
  lastScorePollHadLive = hasLive;
  resetScoreboardTimer(scorePollIntervalMs(hasLive));
}

// ── UI 로딩 상태 ──
function setRefreshingUI(loading) {
  refreshBtn.classList.toggle('spinning', loading);
  refreshBtn.disabled = loading;
}

function setLoadingPlaceholders() {
  const ph = loadingRow().repeat(5);
  easternBody.innerHTML = ph;
  westernBody.innerHTML = ph;
  if (favoriteTeams.length) renderTeamCards();
}

// ── 순위 탭 종목 전환 ──
function activateStandingsTab(sport) {
  activeStandingsSport = sport;
  document.querySelectorAll('.standings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.standings === sport);
  });
  nbaTablesEl.classList.toggle('hidden', sport !== 'nba');
  mlbTablesEl.classList.toggle('hidden', sport !== 'mlb');
  soccerTablesEl.classList.toggle('hidden', sport !== 'soccer');
  soccerStandingsSubtabsEl.classList.toggle('hidden', sport !== 'soccer');

  if (sport === 'soccer') activateSoccerStandingsTab(activeSoccerLeague);
  if (sport === 'mlb' && !mlbStandingsLoaded) loadMlbStandings();
}

// ── 축구 순위 리그 서브탭 전환 ──
function activateSoccerStandingsTab(leagueId) {
  activeSoccerLeague = leagueId;
  document.querySelectorAll('.soccer-std-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.league === leagueId);
  });
  // 항상 테이블 초기화 → 이전 리그 잔상 방지
  if (soccerStdBodyEl) soccerStdBodyEl.innerHTML = loadingRow('불러오는 중...').repeat(5);
  attachSoccerTableEvents();  // 한 번만 바인딩 (이후 호출은 no-op)
  if (soccerStandingsLoaded[leagueId]) {
    const teams = soccerTeamsByLeague[leagueId] || [];
    if (teams.length && soccerStdBodyEl) renderRows(soccerStdBodyEl, teams, 'soccer');
  } else {
    loadSoccerStandingsForTable(leagueId);
  }
}

// ── MLB 순위 로드 ──
async function loadMlbStandings() {
  // 순위 테이블 로딩 표시
  const ph = loadingRow('불러오는 중...').repeat(5);
  alBody.innerHTML = ph;
  nlBody.innerHTML = ph;

  // 설정 체크박스도 로딩 중 표시 (아직 비어 있을 때만)
  if (!mlbTeams.length) {
    mlbCheckboxListEl.innerHTML = '<div style="font-size:10px;color:#7a8fa8;padding:6px 4px">MLB 팀 불러오는 중...</div>';
  }

  try {
    const result = await window.standingsAPI.fetchStandings('mlb');
    if (!result || result.error) throw new Error(result?.error || 'MLB 데이터 없음');

    mlbTeams = [...(result.eastern || []), ...(result.western || [])];
    mlbStandingsLoaded = true;

    // 순위 테이블 렌더링 (eastern=American, western=National)
    renderRows(alBody, result.eastern || [], 'mlb');
    renderRows(nlBody, result.western || [], 'mlb');

    // 설정 체크박스 업데이트
    fillCheckboxList(mlbTeams, 'mlb');
  } catch (err) {
    console.warn('MLB 순위 로딩 실패 (무시하고 계속)', err.message);
    // 테이블에 안내 메시지만 표시 — 무한 로딩 방지
    if (alBody) alBody.innerHTML = loadingRow('시즌 데이터 준비 중');
    if (nlBody) nlBody.innerHTML = loadingRow('시즌 데이터 준비 중');
    if (!mlbTeams.length && mlbCheckboxListEl) {
      mlbCheckboxListEl.innerHTML = '<div style="font-size:10px;color:#7a8fa8;padding:6px 4px">MLB 시즌 준비 중</div>';
    }
    // mlbStandingsLoaded는 false 유지 → 다음 탭 전환 시 재시도
  }
}

// ── 축구 리그 순위 + 팀 목록 통합 로드 (범용) ──
async function loadSoccerLeagueData(leagueId = 'eng.1') {
  try {
    const result = await window.standingsAPI.fetchSoccerStandings(leagueId);
    if (!result?.table) throw new Error(`[${leagueId}] 데이터 없음`);

    // 팀 목록 구성/갱신
    const existing = soccerTeamsByLeague[leagueId] || [];
    if (existing.length) {
      soccerTeamsByLeague[leagueId] = existing.map((t) => {
        const row = result.table.find((r) => r.teamId === t.teamId);
        return row ? { ...t, rank: row.rank, w: row.w, d: row.d, l: row.l, pts: row.pts } : t;
      });
    } else {
      soccerTeamsByLeague[leagueId] = (result.teams || []).map((t) => {
        const row = result.table.find((r) => r.teamId === t.id);
        return {
          teamId: t.id, team: t.name, abbr: t.abbr, logo: t.logo,
          conference: leagueId, leagueId,
          rank: row?.rank ?? '-', w: row?.w ?? '-', d: row?.d ?? '-',
          l: row?.l ?? '-', pts: row?.pts ?? '-'
        };
      });
    }
    soccerStandingsLoaded[leagueId] = true;
    eplStandingsLoaded = (leagueId === 'eng.1') ? true : eplStandingsLoaded;  // 하위 호환

    renderTeamCards();

    // 순위 탭이 현재 이 리그면 테이블 갱신
    if (activeStandingsSport === 'soccer' && activeSoccerLeague === leagueId) {
      if (soccerStdBodyEl) {
        renderRows(soccerStdBodyEl, result.table, 'soccer');
        attachSoccerTableEvents();
      }
    }
    // 설정 탭이 soccer + 현재 리그면 체크박스 갱신
    if (activeSetupSport === 'soccer' && activeSoccerLeague === leagueId) {
      fillSoccerCheckboxList(soccerTeamsByLeague[leagueId], leagueId);
    }
  } catch (err) {
    console.error(`[soccer:${leagueId}] 순위 로딩 실패`, err.message);
    if (soccerStdBodyEl && activeStandingsSport === 'soccer' && activeSoccerLeague === leagueId) {
      soccerStdBodyEl.innerHTML = loadingRow(`${SOCCER_LEAGUES[leagueId]?.name || leagueId} 로딩 실패`);
    }
  }
}

// ── 순위 테이블용 직접 로드 ──
async function loadSoccerStandingsForTable(leagueId = 'eng.1') {
  await loadSoccerLeagueData(leagueId);
  if (soccerStdBodyEl && soccerTeamsByLeague[leagueId]?.length) {
    renderRows(soccerStdBodyEl, soccerTeamsByLeague[leagueId], 'soccer');
    attachSoccerTableEvents();
  }
}

// 하위 호환 alias
async function loadEplStandings()        { return loadSoccerLeagueData('eng.1'); }
async function loadEplTeams()            { return loadSoccerLeagueData('eng.1'); }
async function loadEplStandingsForTable(){ return loadSoccerStandingsForTable('eng.1'); }

// ── NBA + 필요 시 MLB 순위 로드 ──
async function loadStandings() {
  setStatus('데이터 로딩 중...');
  try {
    const result = await window.standingsAPI.fetchStandings('nba');
    if (!result || result.error) throw new Error(result?.error || 'Fetch failed');

    const nextTeams = [...(result.eastern || []), ...(result.western || [])];
    const nextSig = JSON.stringify({ eastern: result.eastern || [], western: result.western || [] });
    const changed = standingsSignature !== nextSig;
    nbaTeams = nextTeams;

    if (changed) {
      renderRows(easternBody, result.eastern || [], 'nba');
      renderRows(westernBody, result.western || [], 'nba');
      standingsSignature = nextSig;
    }

    fillCheckboxList(nbaTeams, 'nba');

    // MLB 즐겨찾기가 있으면 MLB 데이터도 로드 (카드 렌더링 목적)
    if (favoriteTeams.some((ft) => ft.sport === 'mlb') && !mlbStandingsLoaded) {
      loadMlbStandings();
    } else if (mlbTeams.length) {
      fillCheckboxList(mlbTeams, 'mlb');
    }

    if (!favoriteTeams.length) {
      renderTeamCards();           // empty state 표시
      setView('my-team');          // setup 대신 홈 empty state로
    } else {
      if (changed) renderTeamCards();
      loadTeamGameStatus();
      if (currentView !== 'all-rank') setView('my-team');
    }

    const d = new Date(result.fetchedAt);
    updatedAtEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    updatedAtEl.classList.remove('flash');
    void updatedAtEl.offsetWidth; // reflow로 애니메이션 재트리거
    updatedAtEl.classList.add('flash');
    setStatus('');
  } catch (err) {
    setStatus('연결 확인');
    const fb = rowTemplate('', '연결 확인', '-', '-', '-');
    easternBody.innerHTML = fb.repeat(5);
    westernBody.innerHTML = fb.repeat(5);
  }
}

async function updateScores() {
  if (isRefreshing) return;
  isRefreshing = true;
  setRefreshingUI(true);
  setStatus('수동 새로고침...');
  try {
    const gamesLoads =
      activeGamesSport === 'soccer' && allGamesOpen
        ? Promise.all(SOCCER_LEAGUE_IDS.map((lid) => loadAllGames('soccer', lid)))
        : loadAllGames(activeGamesSport);
    await Promise.all([loadStandings(), loadTeamGameStatus(), gamesLoads]);
    syncSoccerGamesSubtabsVisibility();
  } finally {
    isRefreshing = false;
    setRefreshingUI(false);
  }
}

// ── 팀 검색 필터 ──
function applyTeamSearch(query) {
  const q = query.trim().toLowerCase();
  const activeList = activeSetupSport === 'mlb' ? mlbCheckboxListEl
    : activeSetupSport === 'soccer' ? soccerCheckboxListEl
    : nbaCheckboxListEl;
  if (activeList) {
    activeList.querySelectorAll('.team-checkbox-item').forEach((label) => {
      const name = label.textContent.trim().toLowerCase();
      label.classList.toggle('search-hidden', q.length > 0 && !name.includes(q));
    });
  }
}

// ── 설정 탭 전환 ──
function activateSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tab);
  });
  document.getElementById('settings-panel-general').classList.toggle('hidden', tab !== 'general');
  document.getElementById('settings-panel-teams').classList.toggle('hidden', tab !== 'teams');
}

// ── 이벤트 리스너 ──
document.querySelectorAll('.settings-tab').forEach((btn) => {
  btn.addEventListener('click', () => activateSettingsTab(btn.dataset.settingsTab));
});

// ── All Games 토글 ──
allGamesToggleBtn.addEventListener('click', () => {
  allGamesOpen = !allGamesOpen;
  allGamesSectionEl.classList.toggle('open', allGamesOpen);
  allGamesListEl.classList.toggle('hidden', !allGamesOpen);
  gamesFilterTabsEl.classList.toggle('hidden', !allGamesOpen);

  if (allGamesOpen && activeGamesSport === 'soccer') {
    prefetchAllSoccerGamesCaches();
  }
  syncSoccerGamesSubtabsVisibility();

  if (allGamesOpen && activeGamesSport === 'soccer') {
    const c = soccerGamesCache[activeSoccerGamesLeague];
    if (c == null) loadAllGames('soccer', activeSoccerGamesLeague);
    else renderAllGames();
  } else if (allGamesOpen && allGamesCache[activeGamesSport] === null) {
    loadAllGames(activeGamesSport);
  } else if (allGamesOpen) {
    renderAllGames();
  }
});

// ── All Games 종목 필터 ──
document.querySelectorAll('.games-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.games-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeGamesSport = btn.dataset.gamesSport;
    if (activeGamesSport === 'soccer' && allGamesOpen) {
      prefetchAllSoccerGamesCaches();
    }
    syncSoccerGamesSubtabsVisibility();
    if (activeGamesSport === 'soccer') {
      const cached = soccerGamesCache[activeSoccerGamesLeague];
      if (cached == null) loadAllGames('soccer', activeSoccerGamesLeague);
      else renderAllGames();
    } else {
      if (allGamesCache[activeGamesSport] != null) renderAllGames();
      else { allGamesCache[activeGamesSport] = null; renderAllGames(); loadAllGames(activeGamesSport); }
    }
  });
});

// ── Soccer All Games 리그 서브탭 ──
document.querySelectorAll('.soccer-games-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.soccer-games-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeSoccerGamesLeague = btn.dataset.league;
    const cached = soccerGamesCache[activeSoccerGamesLeague];
    if (cached == null) loadAllGames('soccer', activeSoccerGamesLeague);
    else renderAllGames();
  });
});

// ── Soccer 순위 리그 서브탭 ──
document.querySelectorAll('.soccer-std-tab').forEach((btn) => {
  btn.addEventListener('click', () => activateSoccerStandingsTab(btn.dataset.league));
});

// ── Soccer 설정 리그 서브탭 ──
document.querySelectorAll('.soccer-setup-tab').forEach((btn) => {
  btn.addEventListener('click', () => activateSoccerSetupTab(btn.dataset.league));
});

document.querySelectorAll('.sport-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activateSportTab(btn.dataset.sport);
    applyTeamSearch(teamSearchInput.value);
  });
});

document.querySelectorAll('.standings-tab').forEach((btn) => {
  btn.addEventListener('click', () => activateStandingsTab(btn.dataset.standings));
});

teamSearchInput.addEventListener('input', () => {
  const val = teamSearchInput.value;
  teamSearchClear.classList.toggle('hidden', !val);
  applyTeamSearch(val);
});

teamSearchClear.addEventListener('click', () => {
  teamSearchInput.value = '';
  teamSearchClear.classList.add('hidden');
  applyTeamSearch('');
  teamSearchInput.focus();
});

saveFavoriteBtn.addEventListener('click', () => {
  const checked = [];
  nbaCheckboxListEl.querySelectorAll('input:checked').forEach((cb) => {
    checked.push({ teamId: cb.value, sport: 'nba' });
  });
  mlbCheckboxListEl.querySelectorAll('input:checked').forEach((cb) => {
    checked.push({ teamId: cb.value, sport: 'mlb' });
  });
  // soccer: data-league 속성에서 leagueId 추출
  soccerCheckboxListEl.querySelectorAll('input:checked').forEach((cb) => {
    checked.push({ teamId: cb.value, sport: 'soccer', leagueId: cb.dataset.league || 'eng.1' });
  });

  if (!checked.length) {
    setStatus('최소 1개 이상 선택해 주세요.');
    setTimeout(() => setStatus(''), 2000);
    return;
  }

  const prevKeys = new Set(favoriteTeams.map(favoriteEntryKey));

  favoriteTeams = checked;
  localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(favoriteTeams));

  checked.forEach((entry) => {
    if (!prevKeys.has(favoriteEntryKey(entry))) {
      const input = findCheckboxForFavoriteEntry(entry);
      const teamName = input ? teamNameFromCheckboxInput(input) : String(entry.teamId);
      gaTrack('add_team', {
        team_name: teamName,
        sport: entry.sport,
        league_id: entry.leagueId || ''
      });
    }
  });

  // soccer 팀이 포함된 리그 데이터 로드
  const soccerLeagues = [...new Set(
    favoriteTeams.filter((ft) => ft.sport === 'soccer').map((ft) => ft.leagueId).filter(Boolean)
  )];
  soccerLeagues.forEach((lid) => loadSoccerLeagueData(lid));

  renderTeamCards();
  loadTeamGameStatus();
  loadNextGame();
  setView('my-team');
});

homeBtn.addEventListener('click', () => {
  if (currentView === 'my-team') return;
  renderTeamCards();
  setView('my-team');
});

// ── Empty state 딥링크: 팀 관리 섹션으로 즉시 이동 ──
emptyStateBtnEl?.addEventListener('click', () => {
  // 1. 설정 탭으로 전환
  setView('setup');

  // 2. '팀 관리' 탭 활성화
  const teamsMgmtTab = document.querySelector('.settings-tab[data-settings-tab="teams"]');
  teamsMgmtTab?.click();

  // 3. 스크롤 + 하이라이트 + 검색창 포커스
  requestAnimationFrame(() => {
    const teamsPanel = document.getElementById('settings-panel-teams');
    if (teamsPanel) {
      teamsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 하이라이트 애니메이션 트리거
      teamsPanel.classList.remove('panel-highlight');
      void teamsPanel.offsetWidth;   // reflow → 애니메이션 재실행
      teamsPanel.classList.add('panel-highlight');
      teamsPanel.addEventListener('animationend', () => {
        teamsPanel.classList.remove('panel-highlight');
      }, { once: true });
    }
    // 검색창에 포커스
    const searchInput = document.getElementById('team-search-input');
    setTimeout(() => searchInput?.focus(), 120);
  });
});

// ── 홈 탭: 선호 팀 순서 — HTML5 DnD 대신 Pointer API (Electron + 자식 요소 간섭 회피)
// framer-motion Reorder는 React 전용이라 이 프로젝트(바닐라 renderer)에는 미사용.
/** true: 드롭 후 localStorage 반영. 시각 동작만 테스트할 때 false로 두면 메모리 순서만 바뀜 */
const PERSIST_FAVORITE_ORDER_AFTER_DRAG = true;

let favoriteCardPointerDrag = null; // { card, list, pointerId }

function getCardInsertBeforeFromPointerY(listEl, clientY, draggingCard) {
  const siblings = [...listEl.querySelectorAll('.team-card')].filter((c) => c !== draggingCard);
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of siblings) {
    const box = child.getBoundingClientRect();
    const offset = clientY - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

function syncFavoriteTeamsOrderFromDom(listEl) {
  const cards = [...listEl.querySelectorAll('.team-card')];
  const next = cards.map((c) => {
    const lid = c.dataset.league;
    const base = { teamId: c.dataset.teamId, sport: c.dataset.sport };
    if (base.sport === 'soccer' && lid) return { ...base, leagueId: lid };
    return base;
  }).filter((x) => x.teamId && x.sport);
  if (next.length !== favoriteTeams.length) return; // 안전: DOM과 불일치 시 무시
  favoriteTeams = next;
  if (PERSIST_FAVORITE_ORDER_AFTER_DRAG) {
    localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(favoriteTeams));
  }
}

function onFavoriteCardPointerMove(e) {
  if (!favoriteCardPointerDrag || e.pointerId !== favoriteCardPointerDrag.pointerId) return;
  const { card, list } = favoriteCardPointerDrag;
  const after = getCardInsertBeforeFromPointerY(list, e.clientY, card);
  if (after == null) {
    list.appendChild(card);
  } else {
    list.insertBefore(card, after);
  }
}

function teardownFavoriteCardDragListeners() {
  window.removeEventListener('pointermove', onFavoriteCardPointerMove);
  window.removeEventListener('pointerup', endFavoriteCardPointerDrag);
  window.removeEventListener('pointercancel', endFavoriteCardPointerDrag);
}

function finalizeFavoriteCardDrag(syncOrder) {
  if (!favoriteCardPointerDrag) return;
  const { card, list, pointerId } = favoriteCardPointerDrag;
  try {
    card.releasePointerCapture(pointerId);
  } catch (_) {}
  card.classList.remove('dragging');
  list.classList.remove('is-reordering');
  teardownFavoriteCardDragListeners();
  if (syncOrder) syncFavoriteTeamsOrderFromDom(list);
  favoriteCardPointerDrag = null;
}

function endFavoriteCardPointerDrag(e) {
  if (!favoriteCardPointerDrag) return;
  if (e && e.pointerId !== favoriteCardPointerDrag.pointerId) return;
  finalizeFavoriteCardDrag(true);
}

myTeamsListEl?.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const card = e.target.closest?.('.team-card');
  if (!card || !myTeamsListEl.contains(card)) return;

  if (favoriteCardPointerDrag) finalizeFavoriteCardDrag(true);

  e.preventDefault(); // 텍스트 선택·이미지 기본 드래그 완화
  favoriteCardPointerDrag = { card, list: myTeamsListEl, pointerId: e.pointerId };
  card.classList.add('dragging');
  myTeamsListEl.classList.add('is-reordering');
  try {
    card.setPointerCapture(e.pointerId);
  } catch (_) {}
  window.addEventListener('pointermove', onFavoriteCardPointerMove);
  window.addEventListener('pointerup', endFavoriteCardPointerDrag);
  window.addEventListener('pointercancel', endFavoriteCardPointerDrag);
});

settingsBtn.addEventListener('click', () => {
  if (currentView === 'setup') {
    setView(favoriteTeams.length ? 'my-team' : 'setup');
    return;
  }
  fillCheckboxList(nbaTeams, 'nba');
  if (mlbTeams.length) fillCheckboxList(mlbTeams, 'mlb');
  activateSportTab('nba');
  activateSettingsTab('general');
  teamSearchInput.value = '';
  teamSearchClear.classList.add('hidden');
  syncStealthControls();
  setView('setup');
});

toggleRankBtn.addEventListener('click', () => {
  if (currentView === 'all-rank') {
    renderTeamCards();
    setView('my-team');
    return;
  }
  setView('all-rank');
});

// ── 스텔스 컨트롤 이벤트 ──
opacitySlider.addEventListener('input', () => {
  baseOpacity = opacitySlider.value / 100;
  opacityValEl.textContent = `${opacitySlider.value}%`;
  localStorage.setItem(PEEKS_OPACITY_KEY, baseOpacity);
  applyStealthSettings();
});
opacitySlider.addEventListener('change', () => {
  gaTrack('change_mode', {
    mode: 'opacity',
    value_percent: Math.round(Number(opacitySlider.value) || 0)
  });
});

ghostModeCb.addEventListener('change', () => {
  ghostMode = ghostModeCb.checked;
  localStorage.setItem(PEEKS_GHOST_KEY, ghostMode);
  applyStealthSettings();
  gaTrack('change_mode', { mode: 'ghost', enabled: ghostMode ? 1 : 0 });
});

monoModeCb.addEventListener('change', () => {
  monoMode = monoModeCb.checked;
  localStorage.setItem(PEEKS_MONO_KEY, monoMode);
  applyStealthSettings();
  gaTrack('change_mode', { mode: 'mono', enabled: monoMode ? 1 : 0 });
});

if (coderModeCb) {
  coderModeCb.addEventListener('change', () => {
    coderMode = coderModeCb.checked;
    localStorage.setItem(PEEKS_CODER_KEY, coderMode);
    applyCoderMode();
    renderTeamCards();
    if (allGamesOpen) renderAllGames();
    gaTrack('change_mode', { mode: 'coder', enabled: coderMode ? 1 : 0 });
  });
}

function syncCoderFormatFromRadios() {
  if (!coderFormatLogEl || !coderFormatCodeEl) return;
  coderFormat = coderFormatCodeEl.checked ? 'code' : 'log';
  localStorage.setItem(PEEKS_CODER_FORMAT_KEY, coderFormat);
  gaTrack('change_mode', { mode: 'coder_format', format: coderFormat });
  if (coderMode) {
    renderTeamCards();
    if (allGamesOpen) renderAllGames();
  }
}

if (coderFormatLogEl) coderFormatLogEl.addEventListener('change', syncCoderFormatFromRadios);
if (coderFormatCodeEl) coderFormatCodeEl.addEventListener('change', syncCoderFormatFromRadios);

// ── 보스 키: Esc 두 번 → 최소화 ──
let escCount = 0;
let escTimer = null;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  escCount++;
  if (escCount >= 2) {
    clearTimeout(escTimer);
    escCount = 0;
    window.standingsAPI.minimizeWindow();
  } else {
    clearTimeout(escTimer);
    escTimer = setTimeout(() => { escCount = 0; }, 600);
  }
});

refreshBtn.addEventListener('click', () => updateScores());

// ── 반응형 밀도 (너비·높이): Compact | Standard | Full ──
const widgetEl = document.querySelector('.widget');
const DENSITY_FULL_MIN_W = 264;
const DENSITY_FULL_MIN_H = 400;
const DENSITY_COMPACT_MAX_W = 186;
const DENSITY_COMPACT_MAX_H = 260;

function applyWidgetDensity(w, h) {
  if (!widgetEl) return;
  widgetEl.style.setProperty('--widget-w', `${Math.round(w)}px`);
  widgetEl.style.setProperty('--widget-h', `${Math.round(h)}px`);
  const compact = w <= DENSITY_COMPACT_MAX_W || h <= DENSITY_COMPACT_MAX_H;
  const full = !compact && w >= DENSITY_FULL_MIN_W && h >= DENSITY_FULL_MIN_H;
  const standard = !compact && !full;
  widgetEl.classList.toggle('density-compact', compact);
  widgetEl.classList.toggle('density-standard', standard);
  widgetEl.classList.toggle('density-full', full);
  widgetEl.classList.toggle('wide', w >= 300);
}

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width: w, height: h } = entry.contentRect;
    applyWidgetDensity(w, h);
  }
});
if (widgetEl) {
  const r0 = widgetEl.getBoundingClientRect();
  applyWidgetDensity(r0.width, r0.height);
  resizeObserver.observe(widgetEl);
  requestAnimationFrame(() => {
    const r1 = widgetEl.getBoundingClientRect();
    applyWidgetDensity(r1.width, r1.height);
  });
}

// ── KST 자정 자동 갱신 ──
function scheduleMidnightRefresh() {
  const now = new Date();
  const todayKST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const nextMidnight = new Date(`${todayKST}T00:00:00+09:00`);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  const msUntil = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    teamGameStatuses = {};
    prevGameStatuses = {};
    teamNextGames = {};
    mlbTeams = [];
    allGamesCache = { nba: null, mlb: null };
    soccerGamesCache = {};
    soccerStandingsLoaded = {};
    loadStandings();
    loadTeamGameStatus();
    if (activeGamesSport === 'soccer' && allGamesOpen) {
      SOCCER_LEAGUE_IDS.forEach((lid) => loadAllGames('soccer', lid));
    } else {
      loadAllGames(activeGamesSport);
    }
    syncSoccerGamesSubtabsVisibility();
    scheduleMidnightRefresh();
  }, msUntil);
}

// ── 몰래보기: 창 최소화/숨김 + 다른 앱 포커스 시 폴링 완화 ──
if (typeof window.standingsAPI.onPeekWindowState === 'function') {
  window.standingsAPI.onPeekWindowState((payload) => {
    mainWinPeekMinimized = !!payload?.minimized;
    mainWinPeekHidden = !!payload?.hidden;
    resyncScoreboardTimer();
  });
}
document.addEventListener('visibilitychange', () => resyncScoreboardTimer());

// ── 초기화 ──
applyStealthSettings();
setLoadingPlaceholders();
renderTeamCards();               // empty state 초기 동기화
setView('my-team');              // 항상 홈 화면으로 시작 (팀 없으면 empty state 표시)
loadStandings();
setInterval(loadStandings, REFRESH_INTERVAL_MS);

// 관심 등록된 soccer 리그 데이터 선로딩 (지연 로드 — UI 렌더 후)
const favSoccerLeagues = [...new Set(
  favoriteTeams.filter((ft) => ft.sport === 'soccer').map((ft) => ft.leagueId).filter(Boolean)
)];
if (favSoccerLeagues.length) {
  setTimeout(() => favSoccerLeagues.forEach((lid) => loadSoccerLeagueData(lid)), 300);
}

loadTeamGameStatus();
loadAllGames('nba');
syncSoccerGamesSubtabsVisibility();
scheduleMidnightRefresh();

gaTrack('app_start', { app_version: '1.0.1' });
