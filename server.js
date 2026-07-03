const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;
const ALLOW_LIVE_MATCH_BETS = true;
const ADMIN_CODE = process.env.ADMIN_CODE || 'pollo2026';
const PIN_SECRET = process.env.PIN_SECRET || ADMIN_CODE;
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_TIME_ZONE = 'America/Guayaquil';

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static('public'));

let users = [];
let bets = [];
let notifications = [];
let winnerHistory = [];
let pinRequests = [];
let betHistory = [];
let notificationClients = new Set();
let activeResetDate = getLocalDateKey();

const matches = [];
const db = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

async function initDatabase() {
  if (!db) {
    return;
  }

  await db.query(`
    create table if not exists app_data (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);

  const { rows } = await db.query('select key, value from app_data');
  const state = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  users = Array.isArray(state.users) ? state.users : users;
  users = users.map((user) => ({ ...user, authorized: user.authorized !== false }));
  bets = Array.isArray(state.bets) ? state.bets : bets;
  notifications = Array.isArray(state.notifications) ? state.notifications : notifications;
  winnerHistory = Array.isArray(state.winnerHistory) ? state.winnerHistory : winnerHistory;
  pinRequests = Array.isArray(state.pinRequests) ? state.pinRequests : pinRequests;
  betHistory = Array.isArray(state.betHistory) ? state.betHistory : betHistory;
  activeResetDate = state.activeResetDate || activeResetDate;
  seedBetHistoryFromActiveBets();

  await persistState(['users', 'bets', 'notifications', 'winnerHistory', 'pinRequests', 'betHistory', 'activeResetDate']);
}

async function saveState(key, value) {
  if (!db) {
    return;
  }

  await db.query(
    `insert into app_data (key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

async function persistState(keys) {
  if (!db) {
    return;
  }

  const values = {
    users,
    bets,
    notifications,
    winnerHistory,
    pinRequests,
    betHistory,
    activeResetDate
  };

  for (const key of keys) {
    await saveState(key, values[key]);
  }
}

function isAdminCodeValid(value) {
  return String(value || '') === ADMIN_CODE;
}

function getLocalDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

async function ensureDailyReset() {
  const todayKey = getLocalDateKey();
  if (todayKey === activeResetDate) {
    return;
  }

  activeResetDate = todayKey;
  await persistState(['activeResetDate']);

  broadcastNotification({
    id: `day-change-${Date.now()}`,
    type: 'day-change',
    message: 'Cambio de dia detectado. Las apuestas anteriores se conservaron para registrar ganadores.',
    createdAt: new Date().toISOString()
  });
}

app.use('/api', async (_req, _res, next) => {
  try {
    await ensureDailyReset();
    next();
  } catch (error) {
    next(error);
  }
});

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTeamText(value) {
  return normalizeMatchText(value).replace(/[^a-z0-9]/g, '');
}

function teamMatches(candidate, selected) {
  const candidateText = normalizeTeamText(candidate);
  const selectedText = normalizeTeamText(selected);

  if (!candidateText || !selectedText) {
    return false;
  }

  if (candidateText === selectedText || candidateText.includes(selectedText) || selectedText.includes(candidateText)) {
    return true;
  }

  const aliases = {
    albania: ['albania'],
    algeria: ['argelia'],
    angola: ['angola'],
    argentina: ['argentina'],
    australia: ['australia'],
    austria: ['austria'],
    belgium: ['belgica'],
    bolivia: ['bolivia'],
    brazil: ['brasil'],
    bulgaria: ['bulgaria'],
    cameroon: ['camerun'],
    canada: ['canada'],
    capeverde: ['caboverde'],
    chile: ['chile'],
    china: ['china'],
    colombia: ['colombia'],
    costarica: ['costarica'],
    croatia: ['croacia'],
    czechia: ['chequia', 'republicacheca'],
    denmark: ['dinamarca'],
    ecuador: ['ecuador'],
    egypt: ['egipto'],
    england: ['inglaterra', 'ingaleterra', 'ingalterra', 'inglatera'],
    france: ['francia'],
    germany: ['alemania'],
    ghana: ['ghana'],
    greece: ['grecia'],
    honduras: ['honduras'],
    hungary: ['hungria'],
    iceland: ['islandia'],
    iran: ['iran'],
    iraq: ['irak'],
    ireland: ['irlanda'],
    italy: ['italia'],
    ivorycoast: ['costademarfil'],
    japan: ['japon'],
    jordan: ['jordania'],
    korea: ['corea', 'coreadelsur'],
    southkorea: ['corea', 'coreadelsur'],
    mexico: ['mexico', 'mejico'],
    morocco: ['marruecos'],
    netherlands: ['paisesbajos', 'holanda'],
    newzealand: ['nuevazelanda'],
    nigeria: ['nigeria'],
    norway: ['noruega'],
    panama: ['panama'],
    paraguay: ['paraguay'],
    peru: ['peru'],
    poland: ['polonia'],
    portugal: ['portugal'],
    qatar: ['catar', 'qatar'],
    romania: ['rumania'],
    russia: ['rusia'],
    saudiarabia: ['arabiasaudita'],
    scotland: ['escocia'],
    senegal: ['senegal'],
    serbia: ['serbia'],
    slovakia: ['eslovaquia'],
    slovenia: ['eslovenia'],
    southafrica: ['sudafrica'],
    spain: ['espana'],
    sweden: ['suecia'],
    switzerland: ['suiza'],
    tunisia: ['tunez'],
    turkey: ['turquia'],
    ukraine: ['ucrania'],
    unitedstates: ['estadosunidos', 'usa', 'eeuu', 'estadosunidosdeamerica'],
    uruguay: ['uruguay'],
    venezuela: ['venezuela'],
    wales: ['gales'],
    congodr: ['congo', 'rdcongo', 'congodr', 'republicademocraticadelcongo']
  };

  const candidateAliases = aliases[candidateText] || [];
  return candidateAliases.some((alias) => alias === selectedText);
}

function getOppositeTeam(matchId, selectedTeam) {
  const parts = String(matchId || '').split(/\s+vs\s+/i).map((item) => item.trim()).filter(Boolean);
  if (parts.length !== 2) {
    return `Contrario a ${String(selectedTeam || '').trim() || 'la apuesta original'}`;
  }

  if (!String(selectedTeam || '').trim()) {
    return parts[1];
  }

  if (teamMatches(parts[0], selectedTeam)) {
    return parts[1];
  }

  if (teamMatches(parts[1], selectedTeam)) {
    return parts[0];
  }

  return `Contrario a ${selectedTeam}`;
}

function buildWinnerRows() {
  return bets
    .filter((bet) => bet.type === 'original' && bet.countered)
    .map((originalBet) => {
      const counterBet = bets.find((bet) => bet.type === 'counter' && bet.responseTo === originalBet.id);
      const historyKey = getWinnerHistoryKey({
        matchId: originalBet.matchId,
        originalUserName: originalBet.userName,
        counterUserName: counterBet?.userName || originalBet.counteredBy || '',
        amount: originalBet.amount
      });
      const savedWinner = winnerHistory.find((row) => row.key === historyKey);

      return savedWinner || {
        key: historyKey,
        matchId: originalBet.matchId,
        amount: originalBet.amount,
        originalBetId: originalBet.id,
        originalCreatedAt: originalBet.createdAt,
        originalUserName: originalBet.userName,
        originalTeamName: originalBet.teamName,
        counterBetId: counterBet?.id || null,
        counterCreatedAt: counterBet?.createdAt || null,
        counterUserName: counterBet?.userName || originalBet.counteredBy || null,
        counterTeamName: counterBet?.teamName || getOppositeTeam(originalBet.matchId, originalBet.teamName),
        winnerName: null,
        status: 'pending-winner'
      };
    });
}

function getWinnerHistoryKey(row) {
  return [
    normalizeMatchText(row.matchId),
    normalizeMatchText(row.originalUserName),
    normalizeMatchText(row.counterUserName),
    Number(row.amount) || 0
  ].join('|');
}

function saveManualWinner(row, winnerName) {
  const normalizedWinner = String(winnerName || '').trim();
  const allowedNames = [row.originalUserName, row.counterUserName].filter(Boolean);

  if (!allowedNames.some((name) => name.toLowerCase() === normalizedWinner.toLowerCase())) {
    return null;
  }

  const historyRow = {
    ...row,
    key: getWinnerHistoryKey(row),
    winnerName: allowedNames.find((name) => name.toLowerCase() === normalizedWinner.toLowerCase()),
    status: 'winner',
    resolvedAt: new Date().toISOString()
  };
  const index = winnerHistory.findIndex((item) => item.key === historyRow.key);

  if (index >= 0) {
    winnerHistory[index] = historyRow;
  } else {
    winnerHistory.unshift(historyRow);
  }

  return historyRow;
}

async function fetchFinalResult(matchId, dateValue) {
  const date = getEspnDate(dateValue);
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const events = Array.isArray(data.events) ? data.events : [];
  const targetMatch = normalizeMatchText(matchId);

  for (const event of events) {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const home = competitors.find((item) => item.homeAway === 'home');
    const away = competitors.find((item) => item.homeAway === 'away');
    const homeName = home?.team?.displayName;
    const awayName = away?.team?.displayName;

    if (!homeName || !awayName) {
      continue;
    }

    const builtMatch = normalizeMatchText(`${homeName} vs ${awayName}`);
    if (builtMatch !== targetMatch) {
      continue;
    }

    const state = competition?.status?.type?.state || '';
    if (state !== 'post') {
      return {
        final: false,
        status: competition?.status?.type?.shortDetail || competition?.status?.type?.description || 'No finalizado'
      };
    }

    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
      return null;
    }

    return {
      final: true,
      homeTeam: homeName,
      awayTeam: awayName,
      homeScore,
      awayScore,
      winnerTeam: homeScore > awayScore ? homeName : awayScore > homeScore ? awayName : null,
      status: competition?.status?.type?.shortDetail || competition?.status?.type?.description || 'Final'
    };
  }

  return null;
}

function buildResultDates(row) {
  const dates = new Set();
  [row.originalCreatedAt, row.counterCreatedAt, new Date()].filter(Boolean).forEach((value) => {
    dates.add(getEspnDate(value));
  });
  return [...dates];
}

function resolveWinnerFromFinal(row, finalResult) {
  if (!finalResult?.final || !finalResult.winnerTeam) {
    return null;
  }

  if (teamMatches(finalResult.winnerTeam, row.originalTeamName)) {
    return row.originalUserName;
  }

  if (teamMatches(finalResult.winnerTeam, row.counterTeamName)) {
    return row.counterUserName;
  }

  return null;
}

async function applyAutomaticWinners() {
  const rows = buildWinnerRows().filter((row) => row.status !== 'winner');
  const resolved = [];
  const unresolved = [];

  for (const row of rows) {
    let finalResult = null;
    for (const date of buildResultDates(row)) {
      finalResult = await fetchFinalResult(row.matchId, date);
      if (finalResult) {
        break;
      }
    }

    const winnerName = resolveWinnerFromFinal(row, finalResult);
    if (!winnerName) {
      unresolved.push({
        key: row.key,
        matchId: row.matchId,
        originalUserName: row.originalUserName,
        counterUserName: row.counterUserName,
        reason: finalResult?.final === false ? 'not-final' : finalResult?.winnerTeam ? 'team-not-matched' : 'not-found-or-draw'
      });
      continue;
    }

    const savedWinner = saveManualWinner(
      {
        ...row,
        finalScore: `${finalResult.homeTeam} ${finalResult.homeScore}-${finalResult.awayScore} ${finalResult.awayTeam}`,
        resolvedBy: 'automatic'
      },
      winnerName
    );
    if (savedWinner) {
      savedWinner.finalScore = `${finalResult.homeTeam} ${finalResult.homeScore}-${finalResult.awayScore} ${finalResult.awayTeam}`;
      savedWinner.resolvedBy = 'automatic';
      resolved.push(savedWinner);
    }
  }

  if (resolved.length) {
    await persistState(['winnerHistory']);
  }

  return { resolved, unresolved };
}

function buildBetHistoryRow(bet, action) {
  return {
    historyId: `${action}-${bet.id}`,
    betId: bet.id,
    action,
    type: bet.type,
    userName: bet.userName,
    matchId: bet.matchId,
    teamName: bet.teamName,
    amount: bet.amount,
    createdAt: bet.createdAt,
    responseTo: bet.responseTo || null,
    countered: Boolean(bet.countered),
    counteredBy: bet.counteredBy || null,
    recordedAt: new Date().toISOString()
  };
}

function rememberBetHistory(bet, action) {
  const historyId = `${action}-${bet.id}`;
  const row = buildBetHistoryRow(bet, action);
  const index = betHistory.findIndex((item) => item.historyId === historyId);
  if (index >= 0) {
    betHistory[index] = { ...betHistory[index], ...row };
  } else {
    betHistory.unshift(row);
  }
}

function updateBetHistorySnapshot(bet) {
  betHistory = betHistory.map((item) => (
    item.betId === bet.id
      ? {
          ...item,
          countered: Boolean(bet.countered),
          counteredBy: bet.counteredBy || item.counteredBy || null
        }
      : item
  ));
}

function seedBetHistoryFromActiveBets() {
  for (const bet of bets) {
    if (!betHistory.some((item) => item.betId === bet.id)) {
      rememberBetHistory(bet, 'active-snapshot');
    }
  }
}

function getBetHistoryForResponse() {
  const activeIds = new Set(bets.map((bet) => bet.id));
  return betHistory
    .map((row) => ({
      ...row,
      active: activeIds.has(row.betId)
    }))
    .sort((first, second) => new Date(second.createdAt || second.recordedAt || 0) - new Date(first.createdAt || first.recordedAt || 0));
}

function getWinnerRowsForResponse() {
  const activeRows = buildWinnerRows();
  const historyKeys = new Set(winnerHistory.map((row) => row.key));
  const pendingRows = activeRows.filter((row) => !historyKeys.has(row.key));
  return [...winnerHistory, ...pendingRows];
}

function validatePin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(`${PIN_SECRET}:${pin}`).digest('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name
  };
}

function getAuthorizedUser(name, pin) {
  const normalizedName = String(name || '').trim();

  if (!normalizedName) {
    const error = new Error('El nombre es obligatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (!validatePin(pin)) {
    const error = new Error('El PIN debe tener 4 numeros.');
    error.statusCode = 400;
    throw error;
  }

  const user = users.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase());
  if (!user || user.authorized === false || !user.pinHash) {
    const error = new Error('Ese nombre no esta autorizado. Pide al administrador que cree tu usuario y PIN.');
    error.statusCode = 403;
    throw error;
  }

  if (user.pinHash !== hashPin(pin)) {
    const error = new Error('PIN incorrecto para ese nombre.');
    error.statusCode = 401;
    throw error;
  }

  return user;
}

async function createAuthorizedUser(name, pin) {
  const normalizedName = String(name || '').trim();

  if (!normalizedName) {
    const error = new Error('El nombre es obligatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (!validatePin(pin)) {
    const error = new Error('El PIN debe tener 4 numeros.');
    error.statusCode = 400;
    throw error;
  }

  const pinHash = hashPin(pin);
  let user = users.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase());

  if (user) {
    user.name = normalizedName;
    user.pinHash = pinHash;
    user.authorized = true;
  } else {
    user = {
      id: Date.now().toString(),
      name: normalizedName,
      pinHash,
      authorized: true
    };
    users.push(user);
  }

  await persistState(['users']);
  return user;
}

function publicPinRequest(request) {
  return {
    id: request.id,
    name: request.name,
    status: request.status,
    createdAt: request.createdAt,
    approvedAt: request.approvedAt || null
  };
}

async function requestPinRegistration(name, pin) {
  const normalizedName = String(name || '').trim();

  if (!normalizedName) {
    const error = new Error('El nombre es obligatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (!validatePin(pin)) {
    const error = new Error('El PIN debe tener 4 numeros.');
    error.statusCode = 400;
    throw error;
  }

  const existingUser = users.find((user) => user.name.toLowerCase() === normalizedName.toLowerCase());
  if (existingUser?.authorized !== false && existingUser?.pinHash) {
    const error = new Error('Ese nombre ya tiene PIN registrado.');
    error.statusCode = 409;
    throw error;
  }

  const existingRequest = pinRequests.find((request) =>
    request.status === 'pending' && request.name.toLowerCase() === normalizedName.toLowerCase()
  );

  if (existingRequest) {
    existingRequest.pin = String(pin);
    existingRequest.createdAt = new Date().toISOString();
    await persistState(['pinRequests']);
    return existingRequest;
  }

  const request = {
    id: Date.now().toString(),
    name: normalizedName,
    pin: String(pin),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  pinRequests.unshift(request);
  await persistState(['pinRequests']);
  return request;
}

async function approvePinRequest(requestId) {
  const request = pinRequests.find((item) => item.id === String(requestId || '') && item.status === 'pending');
  if (!request) {
    const error = new Error('Solicitud no encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const user = await createAuthorizedUser(request.name, request.pin);
  request.status = 'approved';
  request.approvedAt = new Date().toISOString();
  delete request.pin;
  await persistState(['users', 'pinRequests']);
  return { request, user };
}

async function getMatchAvailability(matchId) {
  const date = getEspnDate();

  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`);
    if (!response.ok) {
      return { found: false, canBet: true };
    }

    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const targetMatch = normalizeMatchText(matchId);

    for (const event of events) {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const home = competitors.find((item) => item.homeAway === 'home')?.team?.displayName;
      const away = competitors.find((item) => item.homeAway === 'away')?.team?.displayName;
      if (!home || !away) {
        continue;
      }

      const builtMatch = normalizeMatchText(`${home} vs ${away}`);
      if (builtMatch !== targetMatch) {
        continue;
      }

      const state = competition?.status?.type?.state || '';
      const eventTime = new Date(event.date).getTime();
      const startedByTime = Number.isFinite(eventTime) && eventTime <= Date.now();
      const startedByState = state === 'in' || state === 'post';
      const canBet = !(startedByTime || startedByState);

      return {
        found: true,
        canBet,
        state,
        status: competition?.status?.type?.shortDetail || competition?.status?.type?.description || 'Programado'
      };
    }

    return { found: false, canBet: true };
  } catch (_error) {
    return { found: false, canBet: true };
  }
}

function getEspnDate(value) {
  if (value) {
    const text = String(value);
    if (/^\d{8}$/.test(text)) {
      return text;
    }

    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      return `${dateOnly[1]}${dateOnly[2]}${dateOnly[3]}`;
    }
  }

  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return getLocalDateKey(safeDate).replace(/-/g, '');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pollo-bet-app' });
});

app.post('/api/register', async (req, res) => {
  try {
    const user = getAuthorizedUser(req.body.name, req.body.pin);

    res.json({
      user: publicUser(user),
      blockedByRound: false,
      blockedStarter: null,
      requiresNewStarter: false
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo registrar el usuario.' });
  }
});

app.post('/api/pin-requests', async (req, res) => {
  try {
    const request = await requestPinRegistration(req.body.name, req.body.pin);
    res.json({
      request: publicPinRequest(request),
      message: 'Solicitud enviada. Espera aprobacion del administrador.'
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo enviar la solicitud.' });
  }
});

app.get('/api/matches', (_req, res) => {
  res.json(matches);
});

app.get('/api/daily-matches', async (req, res) => {
  const date = getEspnDate(req.query.date);

  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`);
    if (!response.ok) {
      return res.status(502).json({ error: 'No se pudo consultar el cronograma diario.' });
    }

    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const matchesToday = events
      .map((event) => {
        const competition = event.competitions?.[0];
        const competitors = competition?.competitors || [];
        const home = competitors.find((item) => item.homeAway === 'home');
        const away = competitors.find((item) => item.homeAway === 'away');

        if (!home?.team?.displayName || !away?.team?.displayName) {
          return null;
        }

        return {
          id: event.id,
          match: `${home.team.displayName} vs ${away.team.displayName}`,
          homeTeam: home.team.displayName,
          awayTeam: away.team.displayName,
          dateTime: event.date,
          status: competition?.status?.type?.shortDetail || competition?.status?.type?.description || 'Programado',
          state: competition?.status?.type?.state || 'pre',
          canBet: ALLOW_LIVE_MATCH_BETS || ((competition?.status?.type?.state || 'pre') === 'pre' && new Date(event.date).getTime() > Date.now())
        };
      })
      .filter(Boolean);

    res.json({
      source: 'ESPN',
      competition: 'FIFA World Cup',
      date,
      total: matchesToday.length,
      matches: matchesToday
    });
  } catch (_error) {
    res.status(502).json({ error: 'No se pudo consultar el cronograma diario.' });
  }
});

app.get('/api/participants', (_req, res) => {
  const participants = users.map((user) => {
    const userBets = bets.filter((bet) => bet.userName.toLowerCase() === user.name.toLowerCase());
    return {
      id: user.id,
      name: user.name,
      totalBets: userBets.length,
      latestBet: userBets[userBets.length - 1] || null
    };
  });

  res.json(participants);
});

app.post('/api/bets', async (req, res) => {
  const { userName, pin, matchId, teamName, amount } = req.body;
  const matchText = String(matchId || '').trim();
  const teamText = String(teamName || '').trim();
  const amountValue = Number(amount);

  if (!userName || !matchText || !teamText || !amountValue || amountValue <= 0) {
    return res.status(400).json({ error: 'Faltan datos validos para crear la apuesta.' });
  }

  if (!validatePin(pin)) {
    return res.status(400).json({ error: 'El PIN debe tener 4 numeros.' });
  }

  const availability = await getMatchAvailability(matchText);
  if (!ALLOW_LIVE_MATCH_BETS && availability.found && !availability.canBet) {
    return res.status(400).json({ error: 'Este partido ya iniciÃ³ o finalizÃ³. Ya no se pueden hacer apuestas.' });
  }

  let user;
  try {
    user = getAuthorizedUser(userName, pin);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo validar el usuario.' });
  }

  const bet = {
    id: Date.now().toString(),
    userName: user.name,
    matchId: matchText,
    teamName: teamText,
    amount: amountValue,
    createdAt: new Date().toISOString(),
    type: 'original',
    countered: false
  };

  bets.push(bet);
  rememberBetHistory(bet, 'created');
  const notification = {
    id: Date.now().toString(),
    betId: bet.id,
    userName: bet.userName,
    matchId: bet.matchId,
    teamName: bet.teamName,
    amount: bet.amount,
    message: `${user.name} creÃ³ una apuesta y estÃ¡ esperando respuesta. Puedes responder o ignorar.`,
    createdAt: bet.createdAt,
    originalBetId: bet.id,
    originalUserName: bet.userName,
    countered: false,
    isCounter: false,
    waitingResponse: true
  };

  notifications.unshift(notification);
  await persistState(['users', 'bets', 'notifications', 'betHistory']);
  broadcastNotification(notification);

  res.json({ bet, notification });
});

app.post('/api/counter-bets', async (req, res) => {
  const { userName, pin, challengeId } = req.body;

  if (!userName || !challengeId) {
    return res.status(400).json({ error: 'Faltan datos validos para aceptar el reto.' });
  }

  if (!validatePin(pin)) {
    return res.status(400).json({ error: 'El PIN debe tener 4 numeros.' });
  }

  let user;
  try {
    user = getAuthorizedUser(userName, pin);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo validar el usuario.' });
  }

  const originalBet = bets.find((item) => item.id === challengeId && item.type === 'original');
  if (!originalBet) {
    return res.status(404).json({ error: 'Reto no encontrado.' });
  }

  const availability = await getMatchAvailability(originalBet.matchId);
  if (!ALLOW_LIVE_MATCH_BETS && availability.found && !availability.canBet) {
    return res.status(400).json({ error: 'Este partido ya iniciÃ³ o finalizÃ³. Ya no se pueden aceptar apuestas.' });
  }

  if (originalBet.countered) {
    return res.status(400).json({ error: 'Este reto ya fue aceptado.' });
  }

  if (originalBet.userName.toLowerCase() === user.name.toLowerCase()) {
    return res.status(400).json({ error: 'No puedes aceptar tu propia apuesta.' });
  }

  const teamText = getOppositeTeam(originalBet.matchId, originalBet.teamName);
  if (!teamText) {
    return res.status(400).json({ error: 'No se pudo determinar el equipo contrario para este reto.' });
  }

  const amountValue = Number(originalBet.amount);

  const counterBet = {
    id: Date.now().toString(),
    userName: user.name,
    matchId: originalBet.matchId,
    teamName: teamText,
    amount: amountValue,
    createdAt: new Date().toISOString(),
    type: 'counter',
    responseTo: challengeId
  };

  bets.push(counterBet);
  rememberBetHistory(counterBet, 'accepted');
  originalBet.countered = true;
  originalBet.counteredBy = user.name;
  updateBetHistorySnapshot(originalBet);

  const originalNotification = notifications.find((notif) => notif.originalBetId === challengeId && !notif.isCounter);
  if (originalNotification) {
    originalNotification.countered = true;
    originalNotification.counteredBy = user.name;
    originalNotification.counterTeamName = counterBet.teamName;
  }

  const notification = {
    id: Date.now().toString(),
    betId: counterBet.id,
    userName: counterBet.userName,
    matchId: counterBet.matchId,
    teamName: counterBet.teamName,
    originalUserName: originalBet.userName,
    originalTeamName: originalBet.teamName,
    counterUserName: counterBet.userName,
    counterTeamName: counterBet.teamName,
    amount: counterBet.amount,
    message: `${originalBet.userName} vs ${user.name}`,
    createdAt: counterBet.createdAt,
    originalBetId: challengeId,
    isCounter: true,
    duel: `${originalBet.userName} vs ${user.name}`
  };

  notifications.unshift(notification);
  await persistState(['users', 'bets', 'notifications', 'betHistory']);
  broadcastNotification(notification);

  res.json({ bet: counterBet, notification });
});

app.get('/api/results', (_req, res) => {
  res.json({
    winners: winnerHistory
  });
});

app.post('/api/admin/login', (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  res.json({ ok: true });
});

app.post('/api/admin/users', async (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  try {
    const user = await createAuthorizedUser(req.body.name, req.body.pin);
    res.json({
      user: publicUser(user),
      users: users.map(publicUser),
      pinRequests: pinRequests.map(publicPinRequest)
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo crear el usuario.' });
  }
});

app.post('/api/admin/pin-requests', (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  res.json({
    pinRequests: pinRequests.map(publicPinRequest)
  });
});

app.post('/api/admin/pin-requests/approve', async (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  try {
    const { request, user } = await approvePinRequest(req.body.requestId);
    res.json({
      request: publicPinRequest(request),
      user: publicUser(user),
      pinRequests: pinRequests.map(publicPinRequest)
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'No se pudo aprobar la solicitud.' });
  }
});

app.post('/api/admin/results', (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  res.json({
    winners: getWinnerRowsForResponse()
  });
});

app.post('/api/admin/bet-history', (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  res.json({
    bets: getBetHistoryForResponse()
  });
});

app.post('/api/admin/auto-results', async (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  try {
    const summary = await applyAutomaticWinners();
    if (summary.resolved.length) {
      broadcastNotification({
        id: `auto-winners-${Date.now()}`,
        type: 'winner',
        message: `Ganadores automaticos actualizados: ${summary.resolved.length}.`,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      ...summary,
      winners: getWinnerRowsForResponse()
    });
  } catch (_error) {
    res.status(502).json({ error: 'No se pudieron consultar los resultados finales automaticamente.' });
  }
});

app.post('/api/admin/reset-bets', async (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  bets = [];
  notifications = [];
  activeResetDate = getLocalDateKey();
  await persistState(['bets', 'notifications', 'activeResetDate']);

  broadcastNotification({
    id: `admin-reset-${Date.now()}`,
    type: 'admin-reset',
    message: 'El administrador borro todas las apuestas actuales.',
    createdAt: new Date().toISOString()
  });

  res.json({ ok: true, message: 'Apuestas borradas.' });
});

app.post('/api/results', async (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Solo el administrador puede guardar ganadores.' });
  }

  const winnerKey = String(req.body.winnerKey || '').trim();
  const winnerName = String(req.body.winnerName || '').trim();
  const row = buildWinnerRows().find((item) => item.key === winnerKey);

  if (!row || !winnerName) {
    return res.status(400).json({ error: 'Selecciona una apuesta y el ganador.' });
  }

  const savedWinner = saveManualWinner(row, winnerName);
  if (!savedWinner) {
    return res.status(400).json({ error: 'El ganador debe ser una de las dos personas de la apuesta.' });
  }
  await persistState(['winnerHistory']);

  broadcastNotification({
    id: `winner-${Date.now()}`,
    type: 'winner',
    message: `Ganador guardado: ${savedWinner.winnerName}.`,
    createdAt: savedWinner.resolvedAt
  });

  res.json({ winner: savedWinner, winners: getWinnerRowsForResponse() });
});

app.get('/api/notifications', (_req, res) => {
  res.json(notifications.slice(0, 10));
});

app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  notificationClients.add(res);
  res.write(': connected\n\n');

  req.on('close', () => {
    notificationClients.delete(res);
  });
});

function broadcastNotification(notification) {
  const payload = `data: ${JSON.stringify(notification)}\n\n`;
  for (const client of notificationClients) {
    client.write(payload);
  }
}

setInterval(ensureDailyReset, 60 * 1000);
setInterval(() => {
  applyAutomaticWinners().catch((error) => {
    console.error('No se pudieron actualizar ganadores automaticos:', error.message);
  });
}, 15 * 60 * 1000);

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
      console.log(db ? 'Base de datos conectada.' : 'Sin DATABASE_URL: usando memoria temporal.');
    });
  })
  .catch((error) => {
    console.error('No se pudo iniciar la base de datos:', error);
    process.exit(1);
  });
