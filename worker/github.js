export function authorizeUrl(clientId, redirectUri, state) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
  });
  return `https://github.com/login/oauth/authorize?${p}`;
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error('github token exchange failed');
  const data = await res.json();
  if (!data.access_token) throw new Error('no access_token in github response');
  return data.access_token;
}

export async function fetchUser(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'blinkbird',
    },
  });
  if (!res.ok) throw new Error('github user fetch failed');
  return res.json();
}
