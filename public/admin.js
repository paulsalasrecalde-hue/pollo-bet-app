const resultForm = document.getElementById('result-form');
const manualWinnerForm = document.getElementById('manual-winner-form');
const winnerBetSelect = document.getElementById('winner-bet-select');
const winnerNameSelect = document.getElementById('winner-name-select');
const manualWinnerName = document.getElementById('manual-winner-name');
const manualWinnerMatch = document.getElementById('manual-winner-match');
const manualWinnerBet = document.getElementById('manual-winner-bet');
const manualWinnerAmount = document.getElementById('manual-winner-amount');
const resultMessage = document.getElementById('result-message');
const winnersList = document.getElementById('winners-list');
const adminCodeInput = document.getElementById('admin-code-input');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogin = document.getElementById('admin-login');
const adminUserForm = document.getElementById('admin-user-form');
const adminUserName = document.getElementById('admin-user-name');
const adminUserPin = document.getElementById('admin-user-pin');
const adminUserMessage = document.getElementById('admin-user-message');
const pinRequestsList = document.getElementById('pin-requests-list');
const resetBetsBtn = document.getElementById('reset-bets-btn');
const autoResultsBtn = document.getElementById('auto-results-btn');
const resetBetsMessage = document.getElementById('reset-bets-message');
const betHistoryList = document.getElementById('bet-history-list');

let adminCode = '';
let pinRequestTimer = null;
const FIXED_BET_AMOUNT = 1;
const FIXED_BET_LABEL = 'Medio Pollo';

function renderWinnerOptions(winners) {
  const selectedBet = winnerBetSelect.value;
  const selectedWinner = winnerNameSelect.value;
  const pendingWinners = winners.filter((winner) => winner.status !== 'winner');

  winnerBetSelect.innerHTML = '<option value="">Selecciona una apuesta cerrada...</option>';
  pendingWinners.forEach((winner) => {
    const option = document.createElement('option');
    option.value = winner.key;
    option.textContent = `${winner.originalUserName} vs ${winner.counterUserName || 'pendiente'} - ${winner.matchId}`;
    winnerBetSelect.appendChild(option);
  });

  winnerBetSelect.value = pendingWinners.some((winner) => winner.key === selectedBet) ? selectedBet : '';
  winnerNameSelect.innerHTML = '<option value="">Selecciona el ganador...</option>';

  const currentBet = pendingWinners.find((winner) => winner.key === winnerBetSelect.value);
  if (currentBet) {
    [currentBet.originalUserName, currentBet.counterUserName].filter(Boolean).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      winnerNameSelect.appendChild(option);
    });
  }

  winnerNameSelect.value = [...winnerNameSelect.options].some((option) => option.value === selectedWinner) ? selectedWinner : '';
}

function renderWinners(winners) {
  const visibleWinners = winners.filter((winner) => winner.status === 'winner');
  winnersList.innerHTML = '';

  if (!visibleWinners.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aun no hay ganadores registrados.';
    winnersList.appendChild(empty);
    return;
  }

  visibleWinners.forEach((winner) => {
    const item = document.createElement('li');
    item.className = 'winner-item';
    const betText = winner.betDescription || `${winner.originalUserName} vs ${winner.counterUserName || 'pendiente'}`;
    item.innerHTML = `
      <div class="notification-title">Ganador: ${winner.winnerName}</div>
      <div class="notification-details">
        <strong>Partido:</strong> ${winner.matchId}<br />
        <strong>Apuesta:</strong> ${betText}<br />
        <strong>Apuesta:</strong> ${FIXED_BET_LABEL}
      </div>
    `;
    winnersList.appendChild(item);
  });
}

async function loadPublicWinners() {
  const res = await fetch('/api/results');
  const data = await res.json();
  renderWinners(Array.isArray(data.winners) ? data.winners : []);
}

function renderPinRequests(pinRequests) {
  const pendingRequests = pinRequests.filter((request) => request.status === 'pending');
  pinRequestsList.innerHTML = '';

  if (!pendingRequests.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No hay solicitudes pendientes.';
    pinRequestsList.appendChild(empty);
    return;
  }

  pendingRequests.forEach((request) => {
    const item = document.createElement('li');
    item.className = 'notification-item';

    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = request.name;

    const details = document.createElement('div');
    details.className = 'notification-details';
    details.textContent = `Solicitado: ${new Date(request.createdAt).toLocaleString('es-ES')}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'counter-button';
    button.textContent = 'Autorizar PIN';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Autorizando...';
      try {
        await approvePinRequest(request.id);
      } finally {
        button.disabled = false;
        button.textContent = 'Autorizar PIN';
      }
    });

    item.appendChild(title);
    item.appendChild(details);
    item.appendChild(button);
    pinRequestsList.appendChild(item);
  });
}

async function loadPinRequests() {
  if (!adminCode) {
    renderPinRequests([]);
    return;
  }

  const res = await fetch('/api/admin/pin-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    adminUserMessage.textContent = data.error || 'No se pudieron cargar las solicitudes.';
    return;
  }

  renderPinRequests(Array.isArray(data.pinRequests) ? data.pinRequests : []);
}

async function approvePinRequest(requestId) {
  const res = await fetch('/api/admin/pin-requests/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode, requestId })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    adminUserMessage.textContent = data.error || 'No se pudo autorizar el PIN.';
    return;
  }

  adminUserMessage.textContent = `Jugador autorizado: ${data.user.name}`;
  renderPinRequests(Array.isArray(data.pinRequests) ? data.pinRequests : []);
}

function renderBetHistory(rows) {
  betHistoryList.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aun no hay apuestas aceptadas en el historial.';
    betHistoryList.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('li');
    item.className = 'notification-item';
    const activeText = row.active ? 'Vigente' : 'Guardada';
    const dateText = new Date(row.counterCreatedAt || row.createdAt || row.recordedAt).toLocaleString('es-ES');
    item.innerHTML = `
      <div class="notification-title">${row.originalUserName} (${row.originalTeamName}) vs ${row.counterUserName || 'pendiente'} (${row.counterTeamName || 'contrario'})</div>
      <div class="notification-details">
        <strong>Partido:</strong> ${row.matchId}<br />
        <strong>Apuesta:</strong> ${FIXED_BET_LABEL}<br />
        <strong>Aceptada:</strong> ${dateText}<br />
        <strong>Estado:</strong> ${activeText}
      </div>
    `;
    betHistoryList.appendChild(item);
  });
}

async function loadBetHistory() {
  if (!adminCode) {
    renderBetHistory([]);
    return;
  }

  const res = await fetch('/api/admin/bet-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    resetBetsMessage.textContent = data.error || 'No se pudo cargar el historial de apuestas.';
    return;
  }

  renderBetHistory(Array.isArray(data.bets) ? data.bets : []);
}

async function loadAdminResults() {
  if (!adminCode) {
    await loadPublicWinners();
    return;
  }

  const res = await fetch('/api/admin/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    resultMessage.textContent = data.error || 'No se pudo cargar el panel administrador.';
    return;
  }

  const winners = Array.isArray(data.winners) ? data.winners : [];
  renderWinnerOptions(winners);
  renderWinners(winners);
}

winnerBetSelect.addEventListener('change', async () => {
  await loadAdminResults();
});

adminLoginBtn.addEventListener('click', async () => {
  const typedCode = adminCodeInput.value.trim();
  if (!typedCode) {
    resultMessage.textContent = 'Ingresa la clave de administrador.';
    return;
  }

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode: typedCode })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    resultMessage.textContent = data.error || 'Clave incorrecta.';
    return;
  }

  adminCode = typedCode;
  adminLogin.style.display = 'none';
  adminUserForm.style.display = 'grid';
  autoResultsBtn.style.display = 'inline-block';
  resetBetsBtn.style.display = 'inline-block';
  resultForm.style.display = 'grid';
  manualWinnerForm.style.display = 'grid';
  resultMessage.textContent = 'Modo administrador activo.';
  await loadPinRequests();
  await loadBetHistory();
  await loadAdminResults();

  if (pinRequestTimer) {
    clearInterval(pinRequestTimer);
  }
  pinRequestTimer = setInterval(loadPinRequests, 15000);
});

adminUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = adminUserName.value.trim();
  const pin = adminUserPin.value.trim();

  if (!name) {
    adminUserMessage.textContent = 'Escribe el nombre real del jugador.';
    adminUserName.focus();
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    adminUserMessage.textContent = 'El PIN debe tener 4 numeros.';
    adminUserPin.focus();
    return;
  }

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminCode, name, pin })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    adminUserMessage.textContent = data.error || 'No se pudo guardar el jugador.';
    return;
  }

  adminUserMessage.textContent = `Jugador autorizado: ${data.user.name}`;
  adminUserForm.reset();
  if (Array.isArray(data.pinRequests)) {
    renderPinRequests(data.pinRequests);
  }
});

autoResultsBtn.addEventListener('click', async () => {
  if (!adminCode) {
    resetBetsMessage.textContent = 'Primero ingresa como administrador.';
    return;
  }

  autoResultsBtn.disabled = true;
  autoResultsBtn.textContent = 'Consultando...';
  resetBetsMessage.textContent = 'Consultando resultados finales...';
  try {
    const res = await fetch('/api/admin/auto-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminCode })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      resetBetsMessage.textContent = data.error || 'No se pudieron actualizar los ganadores automaticos.';
      return;
    }

    resetBetsMessage.textContent = `Ganadores automaticos guardados: ${Array.isArray(data.resolved) ? data.resolved.length : 0}.`;
    const winners = Array.isArray(data.winners) ? data.winners : [];
    renderWinnerOptions(winners);
    renderWinners(winners);
  } finally {
    autoResultsBtn.disabled = false;
    autoResultsBtn.textContent = 'Actualizar ganadores automaticos';
  }
});

resetBetsBtn.addEventListener('click', async () => {
  if (!adminCode) {
    resetBetsMessage.textContent = 'Primero ingresa como administrador.';
    return;
  }

  const confirmed = window.confirm('Esto limpiara manualmente las apuestas actuales. Usa esto solo despues de guardar ganadores. El cambio de dia ya no borra apuestas automaticamente.');
  if (!confirmed) {
    return;
  }

  resetBetsBtn.disabled = true;
  resetBetsBtn.textContent = 'Limpiando...';
  try {
    const res = await fetch('/api/admin/reset-bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminCode })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      resetBetsMessage.textContent = data.error || 'No se pudieron borrar las apuestas.';
      return;
    }

    resetBetsMessage.textContent = data.message || 'Apuestas borradas.';
    await loadBetHistory();
    await loadAdminResults();
  } finally {
    resetBetsBtn.disabled = false;
    resetBetsBtn.textContent = 'Limpiar apuestas manualmente';
  }
});

resultForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    winnerKey: winnerBetSelect.value,
    winnerName: winnerNameSelect.value,
    adminCode
  };

  const res = await fetch('/api/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    resultMessage.textContent = data.error || 'No se pudo guardar el ganador.';
    return;
  }

  resultMessage.textContent = 'Ganador guardado en el historial.';
  resultForm.reset();
  await loadAdminResults();
});

manualWinnerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    winnerName: manualWinnerName.value.trim(),
    matchId: manualWinnerMatch.value.trim(),
    betDescription: manualWinnerBet.value.trim(),
    amount: FIXED_BET_AMOUNT,
    adminCode
  };

  const res = await fetch('/api/admin/manual-winner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    resultMessage.textContent = data.error || 'No se pudo guardar el ganador manual.';
    return;
  }

  resultMessage.textContent = 'Ganador manual guardado en el historial.';
  manualWinnerForm.reset();
  manualWinnerAmount.value = String(FIXED_BET_AMOUNT);
  const winners = Array.isArray(data.winners) ? data.winners : [];
  renderWinnerOptions(winners);
  renderWinners(winners);
});

loadPublicWinners();
