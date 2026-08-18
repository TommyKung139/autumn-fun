// Shared client-side helpers: auth token storage, gated fetch, nav highlighting.
(function () {
  const TOKEN_KEY = 'ctbc_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {}, {
      Authorization: 'Bearer ' + (getToken() || ''),
    });
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401) {
      clearToken();
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '/login.html?next=' + next;
      throw new Error('unauthorized');
    }
    return res;
  }

  // Guard: call at top of every protected page.
  async function requireAuthOrRedirect() {
    if (!getToken()) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '/login.html?next=' + next;
      return false;
    }
    try {
      const res = await apiFetch('/api/verify');
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function logout() {
    clearToken();
    location.href = '/login.html';
  }

  function highlightNav() {
    const path = location.pathname.replace(/\/$/, '') || '/index.html';
    document.querySelectorAll('nav.tabs a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href === path || (path === '/' && href === '/index.html')) {
        a.classList.add('active');
      }
    });
  }

  window.CTBC = { getToken, setToken, clearToken, apiFetch, requireAuthOrRedirect, logout, highlightNav };
})();
