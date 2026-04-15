const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('standingsAPI', {
  fetchStandings:       (sport = 'nba') => ipcRenderer.invoke('standings:fetch', sport),
  fetchScoreboardByTeam:(teamId, sport = 'nba', leagueId = null) =>
    ipcRenderer.invoke('scoreboard:fetchByTeam', teamId, sport, leagueId),
  fetchNextGame:        (teamId, sport = 'nba', leagueId = null) =>
    ipcRenderer.invoke('schedule:fetchNextGame', teamId, sport, leagueId),
  minimizeWindow:       () => ipcRenderer.send('window:minimize'),
  fetchAllGames:        (sport = 'nba', leagueId = null) =>
    ipcRenderer.invoke('scoreboard:fetchAll', sport, leagueId),
  // 축구 순위 (범용)
  fetchSoccerStandings: (leagueId = 'eng.1') =>
    ipcRenderer.invoke('standings:fetchSoccer', leagueId),
  // 하위 호환
  fetchEplStandings:    () => ipcRenderer.invoke('standings:fetchEpl'),
  // UCL 토너먼트 대진표
  fetchUclTournament:   () => ipcRenderer.invoke('ucl:fetchTournament'),
  // KBO
  kboFetchTeamStatus:   (teamCode) => ipcRenderer.invoke('kbo:fetchTeamStatus', teamCode),
  kboFetchNextGame:     (teamCode) => ipcRenderer.invoke('kbo:fetchNextGame', teamCode),
  kboFetchAllGames:     () => ipcRenderer.invoke('kbo:fetchAllGames'),
  kboGetTeams:          () => ipcRenderer.invoke('kbo:getTeams'),
  /** 몰래보기: 최소화/숨김 시 렌더러가 폴링 간격 조절 */
  onPeekWindowState: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const wrap = (_evt, payload) => handler(payload);
    ipcRenderer.on('peeks:peek-state', wrap);
    return () => ipcRenderer.removeListener('peeks:peek-state', wrap);
  }
});

contextBridge.exposeInMainWorld('analyticsAPI', {
  trackEvent: (clientId, eventName, params) =>
    ipcRenderer.invoke('ga4:track', { clientId, eventName, params })
});
