const resultForm = document.getElementById('result-form');
const winnerBetSelect = document.getElementById('winner-bet-select');
const winnerNameSelect = document.getElementById('winner-name-select');
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

let adminCode = '';
let pinRequestTimer = null;

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
  resultForm.style.display = 'grid';
  resultMessage.textContent = 'Modo administrador activo.';
  await loadPinRequests();
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

loadPublicWinners();
