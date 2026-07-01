const betForm = document.getElementById('bet-form');
const createBetBtn = document.getElementById('create-bet-btn');
const bettingSection = document.getElementById('betting-section');
const bettingLockHint = document.getElementById('betting-lock-hint');
const matchSelect = document.getElementById('match-select');
const dailyMatchesInfo = document.getElementById('daily-matches-info');
const teamSelect = document.getElementById('team-select');
const amountInput = document.getElementById('amount-input');
const activeBetsList = document.getElementById('active-bets-list');
const proposalsList = document.getElementById('proposals-list');
const participantsList = document.getElementById('participants-list');
const matchesList = document.getElementById('matches-list');
const userStatus = document.getElementById('user-status');
const userInfo = document.getElementById('user-info');
const userMessage = document.getElementById('user-message');
const userInput = document.getElementById('user-input');
const pinInput = document.getElementById('pin-input');
const setUserBtn = document.getElementById('set-user-btn');
const userSetup = document.getElementById('user-setup');
const userDisplay = document.getElementById('user-display');
const newBetBtn = document.getElementById('new-bet-btn');
const betMessage = document.getElementById('bet-message');
const winnersList = document.getElementById('winners-list');
const requestPinBtn = document.getElementById('request-pin-btn');
const pinRequestForm = document.getElementById('pin-request-form');
const pinRequestName = document.getElementById('pin-request-name');
const pinRequestPin = document.getElementById('pin-request-pin');
const sendPinRequestBtn = document.getElementById('send-pin-request-btn');

let currentUserName = '';
let currentChallengeId = null;
let currentUserPin = '';
let matchCatalog = []; 

function sameName(firstName, secondName) {
  return String(firstName || '').trim().toLowerCase() === String(secondName || '').trim().toLowerCase();
}

function normalizeTeamText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

  return (aliases[candidateText] || []).some((alias) => alias === selectedText);
}

function setBetFormEnabled(enabled) {
  matchSelect.disabled = !enabled;
  teamSelect.disabled = !enabled;
  amountInput.disabled = !enabled;
  createBetBtn.disabled = !enabled;

  bettingSection.classList.toggle('is-locked', !enabled);
  bettingLockHint.textContent = enabled
    ? 'Apartado activo: ya puedes seleccionar partido y apostar.'
    : 'Apartado apagado: primero confirma tu usuario en el paso 1.';
}

function lockUserStepAfterBet() {
  userInput.disabled = true;
  pinInput.disabled = true;
  setUserBtn.disabled = true;
  userMessage.textContent = '¡Tu apuesta quedó registrada! Para que otra persona la acepte, cambia de jugador en el paso 1.';
  setBetFormEnabled(false);
  newBetBtn.style.display = 'inline-block';
}

function unlockUserStepForNewPerson() {
  currentUserName = '';
  currentChallengeId = null;
  userInput.disabled = false;
  pinInput.disabled = false;
  setUserBtn.disabled = false;
  userInput.value = '';
  pinInput.value = '';
  currentUserPin = '';
  userInfo.textContent = '';
  userMessage.textContent = '';
  userSetup.style.display = 'grid';
  userDisplay.style.display = 'none';
  newBetBtn.style.display = 'none';
  setBetFormEnabled(false);
  userInput.focus();
}

function generateUserName() {
  const adjectives = ['Audaz', 'Rápido', 'Fuerte', 'Listo', 'Valiente', 'Ágil', 'Sabio', 'Noble'];
  const animals = ['Águila', 'León', 'Tigre', 'Lobo', 'Halcón', 'Puma', 'Pantera', 'Viper'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const anim = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${anim}${num}`;
}

function formatMatchDate(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadMatches() {
  const res = await fetch('/api/matches');
  matchCatalog = await res.json();
  renderMatches(matchCatalog);
}

async function loadDailyMatches() {
  dailyMatchesInfo.textContent = 'Cargando partidos del día...';

  try {
    const res = await fetch('/api/daily-matches');
    const data = await res.json();

    if (!res.ok) {
      dailyMatchesInfo.textContent = 'No se pudo cargar el cronograma diario.';
      return;
    }

    matchSelect.innerHTML = '<option value="">Selecciona un partido oficial...</option>';
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const availableMatches = matches.filter((item) => item.canBet !== false);

    const statusMap = {
      Scheduled: 'Programado',
      FT: 'Finalizado',
      LIVE: 'En juego'
    };

    availableMatches.forEach((item) => {
      const localDate = new Date(item.dateTime);
      const hourLocal = localDate.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateLocal = localDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short'
      });
      const statusEs = statusMap[item.status] || item.status || 'Programado';

      const option = document.createElement('option');
      option.value = item.match;
      option.textContent = `${item.match} · ${dateLocal} ${hourLocal} · ${statusEs}`;
      matchSelect.appendChild(option);
    });

    if (!matches.length) {
      dailyMatchesInfo.textContent = 'Hoy no hay partidos en el cronograma.';
      return;
    }

    if (!availableMatches.length) {
      dailyMatchesInfo.textContent = 'Hoy no hay partidos disponibles para apostar (ya iniciaron o finalizaron).';
      return;
    }

    dailyMatchesInfo.textContent = `Partidos disponibles para apostar: ${availableMatches.length} de ${matches.length} (hora local, fuente: ${data.source}).`;
  } catch (_error) {
    dailyMatchesInfo.textContent = 'No se pudo cargar el cronograma diario.';
  }
}



function renderMatches(matches) {
  matchesList.innerHTML = '';
  const sortedMatches = [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
  const frag = document.createDocumentFragment();

  sortedMatches.forEach((match) => {
    const item = document.createElement('div');
    item.className = 'match-item';
    item.innerHTML = `<strong>${match.home} vs ${match.away}</strong><span>${match.stage} · ${formatMatchDate(match.date)} · ${match.venue}</span>`;
    frag.appendChild(item);
  });

  matchesList.appendChild(frag);
}

function getOppositeTeamFromMatch(matchId, selectedTeam) {
  const parts = String(matchId || '').split(/\s+vs\s+/i).map((item) => item.trim()).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }

  if (!String(selectedTeam || '').trim()) {
    return null;
  }

  if (teamMatches(parts[0], selectedTeam)) {
    return parts[1];
  }

  if (teamMatches(parts[1], selectedTeam)) {
    return parts[0];
  }

  return null;
}

function renderNotificationItem(notify) {
  const item = document.createElement('li');
  item.className = 'notification-item';
  item.dataset.id = notify.id;

  const isAccepted = Boolean(notify.isCounter || notify.countered);
  const originalUserName = notify.originalUserName || notify.userName;
  const originalTeamName = notify.originalTeamName || notify.teamName;
  const counterUserName = notify.counterUserName || notify.counteredBy || notify.userName;
  const counterTeamName = notify.counterTeamName || getOppositeTeamFromMatch(notify.matchId, originalTeamName) || notify.teamName;

  const title = document.createElement('div');
  title.className = 'notification-title';
  title.textContent = isAccepted
    ? `${originalUserName} (${originalTeamName}) vs ${counterUserName} (${counterTeamName})`
    : (notify.userName || notify.originalUserName);
  item.appendChild(title);

  const details = document.createElement('div');
  details.className = 'notification-details';
  const amountText = Number.isFinite(Number(notify.amount)) ? Number(notify.amount) : 0;
  const teamLine = !isAccepted
    ? `<br /><strong>Equipo:</strong> ${notify.teamName}`
    : '';
  details.innerHTML = `
    <strong>Partido:</strong> ${notify.matchId}<br />
    <strong>Apuesta:</strong> ${amountText} presas<br />
    ${teamLine}
  `;
  item.appendChild(details);

  if (!notify.isCounter) {
    const author = notify.originalUserName || notify.userName;
    if (!notify.countered) {
      const isOwnBet = currentUserName && sameName(author, currentUserName);
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'counter-button';
      actionButton.textContent = 'Aceptar apuesta';

      actionButton.disabled = Boolean(isOwnBet);

      const status = document.createElement('div');
      status.className = 'notification-status';
      if (!currentUserName) {
        status.textContent = 'Confirma tu nombre para activar este botón.';
      } else if (isOwnBet) {
        status.textContent = 'Esta propuesta es tuya. Cambia de jugador en el paso 1 para que otra persona la acepte.';
      } else {
        status.textContent = 'Listo: ya puedes apostarle a esta persona.';
      }

      const form = document.createElement('form');
      form.className = 'inline-counter-form';
      form.style.display = 'none';

      const oppositeTeam = getOppositeTeamFromMatch(notify.matchId, notify.teamName);
      const autoInfo = document.createElement('div');
      autoInfo.className = 'notification-status';
      autoInfo.textContent = oppositeTeam
        ? `Aceptación automática: ${oppositeTeam} · ${amountText} presas.`
        : `Aceptación automática: equipo contrario · ${amountText} presas.`;

      const submitButton = document.createElement('button');
      submitButton.type = 'submit';
      submitButton.className = 'counter-button';
      submitButton.textContent = 'Confirmar apuesta automática';

      form.appendChild(autoInfo);
      form.appendChild(submitButton);

      actionButton.addEventListener('click', async () => {
        if (!currentUserName) {
          betMessage.textContent = 'Primero confirma tu nombre para apostar en notificaciones.';
          return;
        }

        if (sameName(author, currentUserName)) {
          betMessage.textContent = 'No puedes apostar contra tu propia apuesta. Cambia de jugador en el paso 1.';
          return;
        }

        form.style.display = form.style.display === 'none' ? 'grid' : 'none';
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitCounterBet(notify);
      });

      item.appendChild(actionButton);
      item.appendChild(status);
      item.appendChild(form);
    }

    if (notify.countered) {
      const status = document.createElement('div');
      status.className = 'notification-status';
      status.textContent = `Aceptado por ${notify.counteredBy || 'otro jugador'}`;
      item.appendChild(status);
    }
  }

  return item;
}

function renderNotificationItem(notify) {
  const item = document.createElement('li');
  item.className = 'notification-item';
  item.dataset.id = notify.id;

  const isAccepted = Boolean(notify.isCounter || notify.countered);
  const originalUserName = notify.originalUserName || notify.userName;
  const originalTeamName = notify.originalTeamName || notify.teamName;
  const counterUserName = notify.counterUserName || notify.counteredBy || notify.userName;
  const counterTeamName = notify.counterTeamName || getOppositeTeamFromMatch(notify.matchId, originalTeamName) || notify.teamName;
  const amountText = Number.isFinite(Number(notify.amount)) ? Number(notify.amount) : 0;

  const title = document.createElement('div');
  title.className = 'notification-title';
  title.textContent = isAccepted
    ? `${originalUserName} (${originalTeamName}) vs ${counterUserName} (${counterTeamName})`
    : originalUserName;
  item.appendChild(title);

  const details = document.createElement('div');
  details.className = 'notification-details';
  details.innerHTML = `
    <strong>Partido:</strong> ${notify.matchId}<br />
    <strong>Apuesta:</strong> ${amountText} presas<br />
    ${!isAccepted ? `<br /><strong>Equipo:</strong> ${notify.teamName}` : ''}
  `;
  item.appendChild(details);

  if (notify.isCounter) {
    return item;
  }

  if (notify.countered) {
    const status = document.createElement('div');
    status.className = 'notification-status';
    status.textContent = `Aceptado por ${notify.counteredBy || 'otro jugador'}`;
    item.appendChild(status);
    return item;
  }

  const isOwnBet = currentUserName && sameName(originalUserName, currentUserName);
  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'counter-button';
  actionButton.textContent = 'Aceptar apuesta';
  actionButton.disabled = Boolean(isOwnBet);

  const status = document.createElement('div');
  status.className = 'notification-status';
  if (isOwnBet) {
    status.textContent = 'Esta propuesta es tuya. Otra persona debe aceptarla desde su equipo.';
  } else if (currentUserName) {
    status.textContent = `Se aceptara como ${currentUserName}.`;
  } else {
    status.textContent = 'Puedes aceptarla ahora; te pediremos tu nombre.';
  }

  const oppositeTeam = getOppositeTeamFromMatch(notify.matchId, notify.teamName);
  const autoInfo = document.createElement('div');
  autoInfo.className = 'notification-status';
  autoInfo.textContent = oppositeTeam
    ? `Automatico: aceptas con ${oppositeTeam} por ${amountText} presas.`
    : `Automatico: aceptas con el equipo contrario por ${amountText} presas.`;

  actionButton.addEventListener('click', async () => {
    actionButton.disabled = true;
    actionButton.textContent = 'Aceptando...';
    try {
      await acceptBetDirectly(notify);
    } finally {
      actionButton.disabled = false;
      actionButton.textContent = 'Aceptar apuesta';
    }
  });

  item.appendChild(actionButton);
  item.appendChild(status);
  item.appendChild(autoInfo);
  return item;
}

async function acceptBetDirectly(notification) {
  if (!currentUserName) {
    const typedName = window.prompt('Escribe tu nombre para aceptar esta apuesta:');
    if (!typedName || !typedName.trim()) {
      betMessage.textContent = 'Necesitas un nombre para aceptar la apuesta.';
      return;
    }

    const registeredName = await registerUser(typedName.trim());
    if (!registeredName) {
      return;
    }
  }

  await submitCounterBet(notification);
}

function renderNotificationItem(notify) {
  const item = document.createElement('li');
  item.className = 'notification-item';
  item.dataset.id = notify.id;

  const isAccepted = Boolean(notify.isCounter || notify.countered);
  const originalUserName = notify.originalUserName || notify.userName;
  const originalTeamName = notify.originalTeamName || notify.teamName;
  const counterUserName = notify.counterUserName || notify.counteredBy || notify.userName;
  const counterTeamName = notify.counterTeamName || getOppositeTeamFromMatch(notify.matchId, originalTeamName) || notify.teamName;
  const amountText = Number.isFinite(Number(notify.amount)) ? Number(notify.amount) : 0;

  const title = document.createElement('div');
  title.className = 'notification-title';
  title.textContent = isAccepted
    ? `${originalUserName} (${originalTeamName}) vs ${counterUserName} (${counterTeamName})`
    : `${originalUserName} apuesta por ${originalTeamName}`;
  item.appendChild(title);

  const details = document.createElement('div');
  details.className = 'notification-details';
  details.innerHTML = `
    <strong>Partido:</strong> ${notify.matchId}<br />
    <strong>Apuesta:</strong> ${amountText} presas
  `;
  item.appendChild(details);

  if (notify.isCounter) {
    return item;
  }

  if (notify.countered) {
    const status = document.createElement('div');
    status.className = 'notification-status';
    status.textContent = `Aceptado por ${notify.counteredBy || 'otro jugador'}`;
    item.appendChild(status);
    return item;
  }

  const isOwnBet = currentUserName && sameName(originalUserName, currentUserName);
  const oppositeTeam = getOppositeTeamFromMatch(notify.matchId, notify.teamName);
  const acceptForm = document.createElement('form');
  acceptForm.className = 'inline-counter-form';

  const acceptNameInput = document.createElement('input');
  acceptNameInput.type = 'text';
  acceptNameInput.name = 'acceptorName';
  acceptNameInput.placeholder = 'Nombre de quien acepta';
  acceptNameInput.maxLength = 20;
  acceptNameInput.required = true;
  acceptNameInput.value = isOwnBet ? '' : currentUserName;
  acceptNameInput.disabled = Boolean(isOwnBet);

  const acceptPinInput = document.createElement('input');
  acceptPinInput.type = 'password';
  acceptPinInput.name = 'acceptorPin';
  acceptPinInput.placeholder = 'PIN';
  acceptPinInput.maxLength = 4;
  acceptPinInput.inputMode = 'numeric';
  acceptPinInput.required = true;
  acceptPinInput.value = isOwnBet ? '' : currentUserPin;
  acceptPinInput.disabled = Boolean(isOwnBet);

  const acceptButton = document.createElement('button');
  acceptButton.type = 'submit';
  acceptButton.className = 'counter-button';
  acceptButton.textContent = 'Aceptar apuesta';
  acceptButton.disabled = Boolean(isOwnBet);

  const status = document.createElement('div');
  status.className = 'notification-status';
  status.textContent = isOwnBet
    ? 'Esta propuesta es tuya. Debe aceptarla otra persona.'
    : (oppositeTeam
      ? `Acepta con ${oppositeTeam} por ${amountText} presas.`
      : `Acepta como contrario a ${notify.teamName} por ${amountText} presas.`);

  acceptForm.appendChild(acceptNameInput);
  acceptForm.appendChild(acceptPinInput);
  acceptForm.appendChild(acceptButton);

  acceptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const acceptorName = acceptNameInput.value.trim();
    if (!acceptorName) {
      betMessage.textContent = 'Escribe el nombre de quien acepta la apuesta.';
      acceptNameInput.focus();
      return;
    }

    if (sameName(originalUserName, acceptorName)) {
      betMessage.textContent = 'No puedes aceptar tu propia apuesta.';
      acceptNameInput.focus();
      return;
    }

    const acceptorPin = acceptPinInput.value.trim();
    if (!/^\d{4}$/.test(acceptorPin)) {
      betMessage.textContent = 'El PIN debe tener 4 numeros.';
      acceptPinInput.focus();
      return;
    }

    acceptButton.disabled = true;
    acceptButton.textContent = 'Aceptando...';
    try {
      await acceptBetWithName(notify, acceptorName, acceptorPin);
    } finally {
      acceptButton.disabled = false;
      acceptButton.textContent = 'Aceptar apuesta';
    }
  });

  item.appendChild(acceptForm);
  item.appendChild(status);
  return item;
}

async function acceptBetWithName(notification, acceptorName, acceptorPin) {
  const registerRes = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: acceptorName, pin: acceptorPin })
  });
  const registerData = await registerRes.json();
  if (!registerRes.ok || registerData.error) {
    betMessage.textContent = registerData.error || 'No se pudo registrar a quien acepta.';
    return;
  }

  const challengeId = notification.originalBetId || notification.betId;
  const res = await fetch('/api/counter-bets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: registerData.user.name,
      pin: acceptorPin,
      challengeId
    })
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    betMessage.textContent = data.error || 'No se pudo aceptar la apuesta.';
    return;
  }

  currentUserName = registerData.user.name;
  currentUserPin = acceptorPin;
  userStatus.textContent = currentUserName;
  userSetup.style.display = 'none';
  userDisplay.style.display = 'block';
  userMessage.textContent = 'Apuesta aceptada.';
  betMessage.textContent = `Reto cerrado: ${(notification.originalUserName || notification.userName)} vs ${currentUserName}`;
  await loadParticipants();
  await refreshNotifications();
  await loadResults();
}

async function submitCounterBet(notification) {
  if (!currentUserName) {
    betMessage.textContent = 'Primero confirma tu nombre para apostar en notificaciones.';
    return;
  }

  const author = notification.originalUserName || notification.userName;
  const payload = {
    userName: currentUserName,
    pin: currentUserPin,
    challengeId: notification.originalBetId || notification.betId
  };

  const res = await fetch('/api/counter-bets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) {
    betMessage.textContent = data.error;
    return;
  }

  betMessage.textContent = `Reto cerrado: ${author} vs ${currentUserName}`;
  await loadParticipants();
  await refreshNotifications();
}

function renderNotifications(notifications) {
  activeBetsList.innerHTML = '';
  proposalsList.innerHTML = '';

  const sortedByHierarchy = [...notifications].sort((a, b) => {
    const aAmount = Number(a.amount) || 0;
    const bAmount = Number(b.amount) || 0;
    if (bAmount !== aAmount) {
      return bAmount - aAmount;
    }

    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const activeBets = sortedByHierarchy.filter((notify) => Boolean(notify.isCounter));
  const proposals = sortedByHierarchy.filter((notify) => !notify.isCounter && !notify.countered);

  if (!activeBets.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aún no hay duelos cerrados.';
    activeBetsList.appendChild(empty);
  } else {
    activeBets.forEach((notify) => {
      activeBetsList.appendChild(renderNotificationItem(notify));
    });
  }

  if (!proposals.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No hay propuestas pendientes por ahora.';
    proposalsList.appendChild(empty);
  } else {
    proposals.forEach((notify) => {
      proposalsList.appendChild(renderNotificationItem(notify));
    });
  }
}


function renderResultsPanel(data) {
  const winners = Array.isArray(data.winners) ? data.winners : [];
  winnersList.innerHTML = '';

  if (!winners.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aun no hay ganadores registrados.';
    winnersList.appendChild(empty);
    return;
  }

  winners.forEach((winner) => {
    const item = document.createElement('li');
    item.className = 'winner-item';
    item.innerHTML = `
      <div class="notification-title">Ganador: ${winner.winnerName}</div>
      <div class="notification-details">
        <strong>Partido:</strong> ${winner.matchId}<br />
        <strong>Apuesta:</strong> ${winner.originalUserName} vs ${winner.counterUserName || 'pendiente'}<br />
        <strong>Presas:</strong> ${winner.amount}
      </div>
    `;
    winnersList.appendChild(item);
  });
}

async function loadResults() {
  const res = await fetch('/api/results');
  const data = await res.json();
  renderResultsPanel(data);
}

function prepareCounterBet(notification) {
  if (!currentUserName) {
    betMessage.textContent = 'Primero confirma tu usuario autorizado para aceptar un reto.';
    return;
  }

  if (notification.originalUserName === currentUserName) {
    betMessage.textContent = 'No puedes apostar contra tu propia apuesta.';
    return;
  }

  currentChallengeId = notification.originalBetId || notification.betId;
  matchSelect.value = notification.matchId;
  teamSelect.value = '';
  betMessage.textContent = `Apuesta de contra contra ${notification.originalUserName}. Completa tu equipo y monto.`;
  teamSelect.focus();
}

async function refreshNotifications() {
  const res = await fetch('/api/notifications');
  const notifications = await res.json();
  renderNotifications(notifications);
}

async function loadParticipants() {
  const res = await fetch('/api/participants');
  const participants = await res.json();
  participantsList.innerHTML = '';

  if (!participants.length) {
    const item = document.createElement('li');
    item.textContent = 'Aún no hay participantes.';
    participantsList.appendChild(item);
    return;
  }

  participants.forEach((participant) => {
    const item = document.createElement('li');
    const latestBet = participant.latestBet;
    item.textContent = `${participant.name} · ${latestBet ? `${latestBet.teamName} · ${latestBet.amount} presas` : 'sin apuesta aún'}`;
    participantsList.appendChild(item);
  });
}

function subscribeToNotifications() {
  const eventSource = new EventSource('/api/notifications/stream');

  eventSource.onmessage = async () => {
    try {
      await refreshNotifications();
    } catch (error) {
      console.error('No se pudo procesar la notificación', error);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
  };
}

async function registerUser(userName, pin) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: userName, pin })
  });

  const data = await res.json();
  if (data.error) {
    userMessage.textContent = data.error;
    return null;
  }

  currentUserName = data.user.name;
  currentUserPin = pin;
  userStatus.textContent = currentUserName;
  userMessage.textContent = 'Listo para apostar.';
  userInfo.textContent = '';
  userSetup.style.display = 'none';
  userDisplay.style.display = 'block';
  newBetBtn.style.display = 'none';
  userInput.disabled = false;
  setUserBtn.disabled = false;
  pinInput.disabled = false;

  if (data.blockedByRound) {
    userMessage.textContent = 'Ese nombre ya cerró una ronda. Pulsa HAZ UNA NUEVA APUESTA para reiniciar desde 0.';
    newBetBtn.style.display = 'inline-block';
    setBetFormEnabled(false);
  } else {
    setBetFormEnabled(true);
  }

  await refreshNotifications();
  return currentUserName;
}

function initializeUserSetup() {
  userInput.focus();
  newBetBtn.style.display = 'none';
  setBetFormEnabled(false);
}

betForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUserName) {
    betMessage.textContent = 'Primero confirma tu usuario autorizado.';
    createBetBtn.disabled = true;
    return;
  }

  const formData = new FormData(betForm);
  const payload = {
    userName: currentUserName,
    pin: currentUserPin,
    matchId: formData.get('matchId'),
    teamName: formData.get('teamName'),
    amount: formData.get('amount')
  };

  const endpoint = currentChallengeId ? '/api/counter-bets' : '/api/bets';
  if (currentChallengeId) {
    payload.challengeId = currentChallengeId;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) {
    betMessage.textContent = data.error;
    return;
  }

  if (currentChallengeId) {
    betMessage.textContent = `Contra-apuesta creada contra el reto ${currentChallengeId}`;
    currentChallengeId = null;
  } else {
    betMessage.textContent = '¡Tu apuesta quedó registrada!';
    lockUserStepAfterBet();
  }

  betForm.reset();
  loadParticipants();
  refreshNotifications();
});

newBetBtn.addEventListener('click', () => {
  unlockUserStepForNewPerson();
});

async function confirmUserFromInputs() {
  const name = userInput.value.trim();
  if (!name) {
    userMessage.textContent = 'Escribe tu nombre real.';
    userInput.focus();
    return;
  }

  const pin = pinInput.value.trim();
  if (!/^\d{4}$/.test(pin)) {
    userMessage.textContent = 'Ingresa un PIN de 4 numeros.';
    pinInput.focus();
    return;
  }

  await registerUser(name, pin);
}

setUserBtn.addEventListener('click', async () => {
  await confirmUserFromInputs();
});

requestPinBtn.addEventListener('click', () => {
  const isHidden = pinRequestForm.style.display === 'none';
  pinRequestForm.style.display = isHidden ? 'grid' : 'none';
  if (isHidden) {
    pinRequestName.value = userInput.value.trim();
    pinRequestPin.value = pinInput.value.trim();
    pinRequestName.focus();
  }
});

pinRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = pinRequestName.value.trim();
  const pin = pinRequestPin.value.trim();

  if (!name) {
    userMessage.textContent = 'Escribe tu nombre real para solicitar PIN.';
    pinRequestName.focus();
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    userMessage.textContent = 'El PIN debe tener 4 numeros.';
    pinRequestPin.focus();
    return;
  }

  sendPinRequestBtn.disabled = true;
  sendPinRequestBtn.textContent = 'Enviando...';
  try {
    const res = await fetch('/api/pin-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      userMessage.textContent = data.error || 'No se pudo enviar la solicitud.';
      return;
    }

    userInput.value = name;
    pinInput.value = pin;
    userMessage.textContent = data.message || 'Solicitud enviada. Espera aprobacion del administrador.';
    pinRequestForm.style.display = 'none';
    pinRequestForm.reset();
  } finally {
    sendPinRequestBtn.disabled = false;
    sendPinRequestBtn.textContent = 'Enviar solicitud';
  }
});

[userInput, pinInput].forEach((input) => {
  input.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      await confirmUserFromInputs();
    }
  });
});

initializeUserSetup();
loadDailyMatches();
loadParticipants();
refreshNotifications();
loadResults();
subscribeToNotifications();
setBetFormEnabled(false);
