import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { networkInterfaces } from 'os';

const PORT = 3001;

const server = createServer();
const wss = new WebSocketServer({ server });

// Simple room system: one room at a time
let room = {
  host: null,   // ws connection
  guest: null,  // ws connection
};

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function broadcast(data, exclude) {
  const msg = JSON.stringify(data);
  [room.host, room.guest].forEach(ws => {
    if (ws && ws !== exclude && ws.readyState === 1) ws.send(msg);
  });
}

wss.on('connection', (ws) => {
  // Assign role
  let role;
  if (!room.host) {
    room.host = ws;
    role = 'host';
  } else if (!room.guest) {
    room.guest = ws;
    role = 'guest';
    // Notify host that guest joined
    if (room.host.readyState === 1) {
      room.host.send(JSON.stringify({ type: 'player-joined', role: 'guest' }));
    }
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    ws.close();
    return;
  }

  ws.send(JSON.stringify({ type: 'role', role }));
  console.log(`${role} connected (${[room.host, room.guest].filter(Boolean).length}/2 players)`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      // Relay to the other player
      broadcast(data, ws);
    } catch {}
  });

  ws.on('close', () => {
    if (ws === room.host) {
      room.host = null;
      console.log('host disconnected');
      if (room.guest?.readyState === 1) {
        room.guest.send(JSON.stringify({ type: 'player-left', role: 'host' }));
      }
    } else if (ws === room.guest) {
      room.guest = null;
      console.log('guest disconnected');
      if (room.host?.readyState === 1) {
        room.host.send(JSON.stringify({ type: 'player-left', role: 'guest' }));
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\nBlinkBird multiplayer server running`);
  console.log(`  Local:   ws://localhost:${PORT}`);
  console.log(`  Network: ws://${ip}:${PORT}`);
  console.log(`\nShare the network URL with the other player\n`);
});
