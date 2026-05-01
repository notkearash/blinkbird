const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

export class RoomDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (upgrade !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const user = {
        id: request.headers.get('x-user-id'),
        login: request.headers.get('x-user-login'),
        name: request.headers.get('x-user-name'),
        avatar: request.headers.get('x-user-avatar'),
      };
      return this.#accept(user);
    }
    return new Response('not found', { status: 404 });
  }

  #peers() {
    return this.state.getWebSockets().map((ws) => ({
      ws,
      meta: ws.deserializeAttachment() || {},
    }));
  }

  #peerInfo(meta) {
    return {
      login: meta.login,
      name: meta.name,
      avatar: meta.avatar,
      role: meta.role,
    };
  }

  #broadcast(data, exclude) {
    const msg = JSON.stringify(data);
    for (const { ws } of this.#peers()) {
      if (ws !== exclude) {
        try { ws.send(msg); } catch { /* peer gone */ }
      }
    }
  }

  #accept(user) {
    const peers = this.#peers();
    if (peers.length >= 2) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      try {
        server.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        server.close(1000, 'full');
      } catch { /* peer gone */ }
      return new Response(null, { status: 101, webSocket: client });
    }

    const takenRoles = new Set(peers.map((p) => p.meta.role));
    const role = takenRoles.has('host') ? 'guest' : 'host';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const meta = { ...user, role };
    server.serializeAttachment(meta);
    this.state.acceptWebSocket(server);

    const existing = peers.map((p) => this.#peerInfo(p.meta));
    server.send(JSON.stringify({
      type: 'role',
      role,
      you: this.#peerInfo(meta),
      peers: existing,
    }));

    if (peers.length >= 1) {
      this.#broadcast({ type: 'player-joined', peer: this.#peerInfo(meta) }, server);
      server.send(JSON.stringify({ type: 'player-joined', peer: existing[0] }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    let data;
    try { data = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { return; }
    // Don't let clients spoof control messages.
    if (data && typeof data === 'object' && typeof data.type === 'string') {
      const reserved = new Set(['role', 'player-joined', 'player-left', 'error']);
      if (reserved.has(data.type)) return;
    }
    this.#broadcast(data, ws);
  }

  webSocketClose(ws) {
    const meta = ws.deserializeAttachment() || {};
    this.#broadcast({ type: 'player-left', peer: this.#peerInfo(meta) }, ws);
  }

  webSocketError(ws) {
    const meta = ws.deserializeAttachment() || {};
    this.#broadcast({ type: 'player-left', peer: this.#peerInfo(meta) }, ws);
  }
}
