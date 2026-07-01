const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const ALLOW_LIVE_MATCH_BETS = true;
const ADMIN_CODE = process.env.ADMIN_CODE || 'pollo2026';

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
let notificationClients = new Set();
let activeResetDate = getLocalDateKey();

const matches = [];

function isAdminCodeValid(value) {
  return String(value || '') === ADMIN_CODE;
}

function getLocalDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureDailyReset() {
  const todayKey = getLocalDateKey();
  if (todayKey === activeResetDate) {
    return;
  }

  users = [];
  bets = [];
  notifications = [];
  activeResetDate = todayKey;

  broadcastNotification({
    id: `daily-reset-${Date.now()}`,
    type: 'daily-reset',
    message: 'Las apuestas se reiniciaron por cambio de día.',
    createdAt: new Date().toISOString()
  });
}

app.use('/api', (_req, _res, next) => {
  ensureDailyReset();
  next();
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
        originalUserName: originalBet.userName,
        originalTeamName: originalBet.teamName,
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

function getWinnerRowsForResponse() {
  const activeRows = buildWinnerRows();
  const historyKeys = new Set(winnerHistory.map((row) => row.key));
  const pendingRows = activeRows.filter((row) => !historyKeys.has(row.key));
  return [...winnerHistory, ...pendingRows];
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
    const normalized = String(value).replace(/-/g, '');
    if (/^\d{8}$/.test(normalized)) {
      return normalized;
    }
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pollo-bet-app' });
});

app.post('/api/register', (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  const normalizedName = name.trim();
  let user = users.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase());

  if (!user) {
    user = { id: Date.now().toString(), name: normalizedName };
    users.push(user);
  }

  res.json({
    user,
    blockedByRound: false,
    blockedStarter: null,
    requiresNewStarter: false
  });
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
  const { userName, matchId, teamName, amount } = req.body;
  const matchText = String(matchId || '').trim();
  const teamText = String(teamName || '').trim();
  const amountValue = Number(amount);

  if (!userName || !matchText || !teamText || !amountValue || amountValue <= 0) {
    return res.status(400).json({ error: 'Faltan datos válidos para crear la apuesta.' });
  }

  const availability = await getMatchAvailability(matchText);
  if (!ALLOW_LIVE_MATCH_BETS && availability.found && !availability.canBet) {
    return res.status(400).json({ error: 'Este partido ya inició o finalizó. Ya no se pueden hacer apuestas.' });
  }

  let user = users.find((item) => item.name.toLowerCase() === userName.toLowerCase());
  if (!user) {
    user = { id: Date.now().toString(), name: userName.trim() };
    users.push(user);
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
  const notification = {
    id: Date.now().toString(),
    betId: bet.id,
    userName: bet.userName,
    matchId: bet.matchId,
    teamName: bet.teamName,
    amount: bet.amount,
    message: `${user.name} creó una apuesta y está esperando respuesta. Puedes responder o ignorar.`,
    createdAt: bet.createdAt,
    originalBetId: bet.id,
    originalUserName: bet.userName,
    countered: false,
    isCounter: false,
    waitingResponse: true
  };

  notifications.unshift(notification);
  broadcastNotification(notification);

  res.json({ bet, notification });
});

app.post('/api/counter-bets', async (req, res) => {
  const { userName, challengeId } = req.body;

  if (!userName || !challengeId) {
    return res.status(400).json({ error: 'Faltan datos válidos para aceptar el reto.' });
  }

  let user = users.find((item) => item.name.toLowerCase() === userName.toLowerCase());
  if (!user) {
    user = { id: Date.now().toString(), name: userName.trim() };
    users.push(user);
  }

  const originalBet = bets.find((item) => item.id === challengeId && item.type === 'original');
  if (!originalBet) {
    return res.status(404).json({ error: 'Reto no encontrado.' });
  }

  const availability = await getMatchAvailability(originalBet.matchId);
  if (!ALLOW_LIVE_MATCH_BETS && availability.found && !availability.canBet) {
    return res.status(400).json({ error: 'Este partido ya inició o finalizó. Ya no se pueden aceptar apuestas.' });
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
  originalBet.countered = true;
  originalBet.counteredBy = user.name;

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

app.post('/api/admin/results', (req, res) => {
  if (!isAdminCodeValid(req.body.adminCode)) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  }

  res.json({
    winners: getWinnerRowsForResponse()
  });
});

app.post('/api/results', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
