const http = require('http');
const { Server } = require('socket.io');

const port = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

/**
 * rooms: {
 *   CODE: {
 *     started: boolean,
 *     hostId: string,
 *     players: {
 *       [socketId]: { name: string, color: number, ready: boolean }
 *     }
 *   }
 * }
 */
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(code)) return generateCode();
  return code;
}

function getRoomState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code,
    started: room.started,
    hostId: room.hostId,
    players: Object.entries(room.players).map(([id, p]) => ({ id, name: p.name, color: p.color, ready: p.ready }))
  };
}

io.on('connection', (socket) => {
  let joinedCode = null;

  socket.on('createLobby', (payload, cb) => {
    const name = payload && payload.name ? String(payload.name).slice(0, 24) : 'Host';
    const color = payload && typeof payload.color === 'number' ? payload.color : 0xd946ef;
    const code = generateCode();
    rooms.set(code, { started: false, hostId: socket.id, players: {} });
    socket.join(code);
    joinedCode = code;
    rooms.get(code).players[socket.id] = { name, color, ready: false };
    cb && cb({ ok: true, code, state: getRoomState(code) });
    io.to(code).emit('roomState', getRoomState(code));
  });

  socket.on('joinLobby', (payload, cb) => {
    const code = payload && payload.code ? String(payload.code).toUpperCase() : String(payload).toUpperCase();
    const name = payload && payload.name ? String(payload.name).slice(0, 24) : 'Player';
    const color = payload && typeof payload.color === 'number' ? payload.color : 0x3aa0ff;
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'NOT_FOUND' });
    socket.join(code);
    joinedCode = code;
    room.players[socket.id] = { name, color, ready: false };
    cb && cb({ ok: true, state: getRoomState(code) });
    io.to(code).emit('roomState', getRoomState(code));
  });

  socket.on('setColor', (color) => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (!room.players[socket.id]) return;
    room.players[socket.id].color = color;
    io.to(joinedCode).emit('roomState', getRoomState(joinedCode));
  });

  socket.on('setName', (name) => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (!room.players[socket.id]) return;
    room.players[socket.id].name = String(name).slice(0, 24);
    io.to(joinedCode).emit('roomState', getRoomState(joinedCode));
  });

  socket.on('setReady', (ready) => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (!room.players[socket.id]) return;
    room.players[socket.id].ready = !!ready;
    io.to(joinedCode).emit('roomState', getRoomState(joinedCode));
  });

  socket.on('startRace', () => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    const allReady = Object.values(room.players).every((p) => p.ready);
    if (!allReady) return;
    room.started = true;
    io.to(joinedCode).emit('start', { seed: Math.floor(Math.random() * 1e9) });
  });

  socket.on('state', (payload) => {
    const room = rooms.get(joinedCode);
    if (!room || !room.started) return;
    socket.to(joinedCode).emit('playerState', { id: socket.id, ...payload });
  });

  socket.on('disconnect', () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    delete room.players[socket.id];
    io.to(joinedCode).emit('roomState', getRoomState(joinedCode));
    // if host left or empty, cleanup
    const playerIds = Object.keys(room.players);
    if (room.hostId === socket.id) {
      if (playerIds.length === 0) {
        rooms.delete(joinedCode);
      } else {
        room.hostId = playerIds[0];
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Socket.io server listening on :${port}`);
});


