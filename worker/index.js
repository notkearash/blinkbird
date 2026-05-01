import { RoomDO, isUuid } from './room.js';
import { authorizeUrl, exchangeCode, fetchUser } from './github.js';
import { readSession, makeSession, sessionCookie, clearCookie, sign, verify } from './session.js';

export { RoomDO };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function redirect(location, init = {}) {
  return new Response(null, {
    status: 302,
    ...init,
    headers: { Location: location, ...(init.headers || {}) },
  });
}

function originOf(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function isSecureRequest(request) {
  return new URL(request.url).protocol === 'https:';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === '/api/me') return handleMe(request, env);
      if (pathname === '/api/auth/github/login') return handleLogin(request, env);
      if (pathname === '/api/auth/github/callback') return handleCallback(request, env);
      if (pathname === '/api/auth/logout') return handleLogout(request);
      if (pathname === '/api/room/create') return handleCreate(request, env);
      const m = pathname.match(/^\/api\/room\/([^/]+)\/ws$/);
      if (m) return handleRoomWs(request, env, m[1]);

      if (pathname.startsWith('/api/')) return json({ error: 'not found' }, { status: 404 });

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('not found', { status: 404 });
    } catch (err) {
      console.error('worker error', err);
      return json({ error: 'internal error' }, { status: 500 });
    }
  },
};

async function handleMe(request, env) {
  const sess = await readSession(request, env.SESSION_SECRET);
  if (!sess) return json({ user: null }, { status: 200 });
  return json({
    user: { id: sess.id, login: sess.login, name: sess.name, avatar: sess.avatar },
  });
}

function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  if (value.startsWith('/api/')) return '/';
  return value;
}

async function handleLogin(request, env) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get('return_to'));
  const nonce = crypto.randomUUID();
  const state = await sign({ r: returnTo, n: nonce, exp: Date.now() + 10 * 60 * 1000 }, env.SESSION_SECRET);
  const redirectUri = `${originOf(request)}/api/auth/github/callback`;
  return redirect(authorizeUrl(env.GITHUB_CLIENT_ID, redirectUri, state));
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return json({ error: 'missing code/state' }, { status: 400 });

  const statePayload = await verify(state, env.SESSION_SECRET);
  if (!statePayload) return json({ error: 'bad state' }, { status: 400 });

  const redirectUri = `${originOf(request)}/api/auth/github/callback`;
  const accessToken = await exchangeCode({
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    code,
    redirectUri,
  });
  const gh = await fetchUser(accessToken);
  const token = await makeSession(gh, env.SESSION_SECRET);

  const cookie = sessionCookie('session', token, { secure: isSecureRequest(request) });
  const returnTo = safeReturnTo(statePayload.r);
  return redirect(returnTo, { headers: { 'Set-Cookie': cookie } });
}

function handleLogout(request) {
  return redirect('/', {
    headers: { 'Set-Cookie': clearCookie('session', { secure: isSecureRequest(request) }) },
  });
}

async function handleCreate(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 });
  const sess = await readSession(request, env.SESSION_SECRET);
  if (!sess) return json({ error: 'unauthorized' }, { status: 401 });
  return json({ roomId: crypto.randomUUID() });
}

async function handleRoomWs(request, env, roomId) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 });
  }
  if (!isUuid(roomId)) return new Response('bad room id', { status: 400 });

  const sess = await readSession(request, env.SESSION_SECRET);
  if (!sess) return new Response('unauthorized', { status: 401 });

  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);

  const headers = new Headers(request.headers);
  headers.set('x-user-id', String(sess.id ?? ''));
  headers.set('x-user-login', sess.login ?? '');
  headers.set('x-user-name', sess.name ?? '');
  headers.set('x-user-avatar', sess.avatar ?? '');

  return stub.fetch('https://room/ws', { headers });
}
