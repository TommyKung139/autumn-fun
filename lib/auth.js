const crypto = require('crypto');

function getSecret() {
  return process.env.AUTH_SECRET || process.env.SITE_PASSWORD || 'ctbc-autumn-outing-default-secret';
}

// Token format: base64url(expiryEpochSeconds) + '.' + base64url(hmac)
function createToken(ttlSeconds = 60 * 60 * 24 * 30) {
  const secret = getSecret();
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = String(expiry);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const secret = getSecret();
  const [payloadB64, sig] = token.split('.');
  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch (e) {
    return false;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig || '');
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  const expiry = parseInt(payload, 10);
  if (!Number.isFinite(expiry)) return false;
  return Math.floor(Date.now() / 1000) < expiry;
}

function getTokenFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // fallback: cookie
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/(?:^|;\s*)ctbc_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

function requireAuth(req, res) {
  const token = getTokenFromRequest(req);
  if (!verifyToken(token)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

module.exports = { createToken, verifyToken, getTokenFromRequest, requireAuth };
