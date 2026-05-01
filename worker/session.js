const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  );
}

export async function sign(payload, secret) {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

export async function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

export function sessionCookie(name, value, { maxAge = 60 * 60 * 24 * 30, secure = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name, { secure = true } = {}) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function readSession(request, secret) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return verify(cookies.session, secret);
}

export async function makeSession(user, secret) {
  const payload = {
    id: user.id,
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  return sign(payload, secret);
}
