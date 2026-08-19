const crypto = require('crypto');

function getSecret() {
  return process.env.AUTH_SECRET || process.env.SITE_PASSWORD || 'ctbc-autumn-outing-default-secret';
}

// Token format: base64url(JSON payload) + '.' + base64url(hmac-sha256 of payload)
// payload = { exp: epochSeconds, role: 'viewer' | 'editor' }
function createToken(role = 'viewer', ttlSeconds = 60 * 60 * 24 * 30) {
  const secret = getSecret();
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ exp: expiry, role });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

// Returns { role } if valid, or null if invalid/expired.
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const secret = getSecret();
  const [payloadB64, sig] = token.split('.');
  let payload, parsed;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    parsed = JSON.parse(payload);
  } catch (e) {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig || '');
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  if (!Number.isFinite(parsed.exp) || Math.floor(Date.now() / 1000) >= parsed.exp) return null;
  return { role: parsed.role === 'editor' ? 'editor' : 'viewer' };
}

function getTokenFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/(?:^|;\s*)ctbc_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

// Any valid token (viewer or editor) may read.
function requireAuth(req, res) {
  const token = getTokenFromRequest(req);
  const info = verifyToken(token);
  if (!info) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  req.authRole = info.role;
  return true;
}

// Only an editor-role token may write.
function requireEditor(req, res) {
  const token = getTokenFromRequest(req);
  const info = verifyToken(token);
  if (!info) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  if (info.role !== 'editor') {
    res.status(403).json({ error: '此操作需要編輯權限，請用編輯密碼登入' });
    return false;
  }
  req.authRole = info.role;
  return true;
}

module.exports = { createToken, verifyToken, getTokenFromRequest, requireAuth, requireEditor };
