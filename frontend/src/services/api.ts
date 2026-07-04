const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000') + '/api';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export class ApiClient {
  private static getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private static getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  private static setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  public static clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('organization');
  }

  /**
   * Refreshes the access token using the refresh token
   */
  private static async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch (err) {
      console.error('Error refreshing token:', err);
    }

    this.clearTokens();
    return false;
  }

  /**
   * Executes an HTTP request with automatic token injection and retries on auth failure
   */
  public static async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const token = this.getAccessToken();
    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      let response = await fetch(`${API_BASE}${endpoint}`, config);

      // Handle token expiration: attempt single silent refresh
      if (response.status === 401 && this.getRefreshToken()) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry request with fresh access token
          headers.set('Authorization', `Bearer ${this.getAccessToken()}`);
          response = await fetch(`${API_BASE}${endpoint}`, config);
        }
      }

      if (!response.ok) {
        let errMsg = 'An unexpected error occurred';
        try {
          const errData = await response.json();
          errMsg = errData.message || errMsg;
        } catch {
          // ignore parsing error
        }
        return { error: errMsg, status: response.status };
      }

      // Handle empty/204 responses
      if (response.status === 204) {
        return { data: {} as T, status: 204 };
      }

      const data = await response.json();
      return { data, status: response.status };
    } catch (err: any) {
      return { error: err.message || 'Network connectivity error', status: 500 };
    }
  }
}
