import { getSocket, RoomState } from '../net/socket';

export function showLobby(onStart: (state: RoomState) => void): void {
  const root = document.getElementById('app')!;
  root.innerHTML = '';

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.background = '#0b1020';
  container.style.color = 'white';
  container.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial';
  container.style.gap = '24px';

  // Two separate panels: Create and Join
  const column = document.createElement('div');
  column.style.display = 'flex';
  column.style.gap = '24px';

  const cardStyle = (el: HTMLElement) => {
    el.style.padding = '24px';
    el.style.background = '#141a2a';
    el.style.borderRadius = '12px';
    el.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    el.style.minWidth = '320px';
  };

  const createCard = document.createElement('div');
  cardStyle(createCard);
  const createTitle = document.createElement('h3');
  createTitle.textContent = 'Create Lobby';
  createTitle.style.marginTop = '0';
  const createName = document.createElement('input');
  createName.placeholder = 'Your name';
  createName.maxLength = 24;
  createName.style.display = 'block';
  createName.style.marginBottom = '8px';
  const createColor = document.createElement('input');
  createColor.type = 'color';
  createColor.value = '#d946ef';
  createColor.style.display = 'block';
  createColor.style.marginBottom = '8px';
  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create';
  createBtn.onclick = () => {
    const s = getSocket();
    s.emit('createLobby', { name: createName.value || 'Host', color: parseInt(createColor.value.slice(1), 16) }, (resp: { ok: boolean; code?: string; state?: RoomState }) => {
      if (resp.ok && resp.state) renderLobbyState(resp.state);
    });
  };
  createCard.appendChild(createTitle);
  createCard.appendChild(createName);
  createCard.appendChild(createColor);
  createCard.appendChild(createBtn);

  const joinCard = document.createElement('div');
  cardStyle(joinCard);
  const joinTitle = document.createElement('h3');
  joinTitle.textContent = 'Join Lobby';
  joinTitle.style.marginTop = '0';
  const joinName = document.createElement('input');
  joinName.placeholder = 'Your name';
  joinName.maxLength = 24;
  joinName.style.display = 'block';
  joinName.style.marginBottom = '8px';
  const joinColor = document.createElement('input');
  joinColor.type = 'color';
  joinColor.value = '#3aa0ff';
  joinColor.style.display = 'block';
  joinColor.style.marginBottom = '8px';
  const joinInput = document.createElement('input');
  joinInput.placeholder = 'Enter code';
  joinInput.maxLength = 4;
  joinInput.style.textTransform = 'uppercase';
  joinInput.style.padding = '8px';
  joinInput.style.marginRight = '8px';
  const joinBtn = document.createElement('button');
  joinBtn.textContent = 'Join';
  joinBtn.onclick = () => {
    const code = joinInput.value.toUpperCase();
    if (!code) return;
    const s = getSocket();
    s.emit('joinLobby', { code, name: joinName.value || 'Player', color: parseInt(joinColor.value.slice(1), 16) }, (resp: { ok: boolean; state?: RoomState }) => {
      if (resp.ok && resp.state) renderLobbyState(resp.state);
    });
  };
  joinCard.appendChild(joinTitle);
  const joinRow = document.createElement('div');
  joinRow.appendChild(joinName);
  joinRow.appendChild(joinColor);
  joinRow.appendChild(joinInput);
  joinRow.appendChild(joinBtn);
  joinCard.appendChild(joinRow);

  const lobbyCard = document.createElement('div');
  cardStyle(lobbyCard);
  const lobbyTitle = document.createElement('h3');
  lobbyTitle.textContent = 'Lobby';
  lobbyTitle.style.marginTop = '0';
  lobbyCard.appendChild(lobbyTitle);
  const lobbyDiv = document.createElement('div');
  lobbyDiv.style.marginTop = '8px';
  lobbyCard.appendChild(lobbyDiv);

  column.appendChild(createCard);
  column.appendChild(joinCard);
  column.appendChild(lobbyCard);

  container.appendChild(column);
  root.appendChild(container);

  function renderLobbyState(state: RoomState) {
    lobbyDiv.innerHTML = '';
    const code = document.createElement('div');
    code.textContent = `Lobby Code: ${state.code}`;
    lobbyDiv.appendChild(code);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr auto auto';
    list.style.gap = '6px';

    state.players.forEach((p) => {
      const row = document.createElement('div');
      row.style.display = 'contents';
      const name = document.createElement('div');
      name.textContent = p.name || (p.id === state.hostId ? 'Host' : p.id.slice(0, 6));
      const color = document.createElement('input');
      color.type = 'color';
      color.value = '#' + p.color.toString(16).padStart(6, '0');
      color.oninput = () => getSocket().emit('setColor', parseInt(color.value.slice(1), 16));
      const ready = document.createElement('input');
      ready.type = 'checkbox';
      ready.checked = p.ready;
      ready.onchange = () => getSocket().emit('setReady', ready.checked);
      row.appendChild(name);
      row.appendChild(color);
      row.appendChild(ready);
      list.appendChild(row);
    });
    lobbyDiv.appendChild(list);

    if (state.hostId === getSocket().id) {
      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start Race';
      startBtn.onclick = () => getSocket().emit('startRace');
      lobbyDiv.appendChild(startBtn);
    }

    const s = getSocket();
    s.off('roomState');
    s.on('roomState', renderLobbyState);
    s.off('start');
    s.on('start', () => onStart(state));
  }
}


