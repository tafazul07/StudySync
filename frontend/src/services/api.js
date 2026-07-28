/**
 * Wrapper around fetch() that automatically attaches the JWT auth token
 * from localStorage to the Authorization header.
 *
 * On 401 responses, attempts to refresh the access token using the refresh token.
 * If refresh succeeds, retries the original request.
 * If refresh fails, clears stale credentials and redirects to /login.
 */

let isRefreshing = false;
let refreshPromise = null;

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  // Deduplicate concurrent refresh requests
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // On 401, try to refresh the token and retry
  if (res.status === 401 && localStorage.getItem('refreshToken')) {
    // Don't try to refresh for auth endpoints themselves
    if (url.startsWith('/api/auth/login') || url.startsWith('/api/auth/register')) {
      return res;
    }

    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the original request with new token
      const newToken = localStorage.getItem('accessToken');
      const retryHeaders = { ...options.headers, Authorization: `Bearer ${newToken}` };
      res = await fetch(url, { ...options, headers: retryHeaders });
    }

    // If still 401 after refresh, clear and redirect
    if (res.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
  }

  return res;
}
