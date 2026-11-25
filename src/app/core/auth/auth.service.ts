import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../services/api-config';

export type UserRole = 'admin' | 'cashier';

export interface AuthUser {
  id: number;
  name: string;
  role: UserRole;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface StoredSession {
  token: string;
  user: AuthUser;
}

export const AUTH_STORAGE_KEY = 'vigado.auth.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storedSession = this.restoreSession();

  readonly token = signal<string | null>(this.storedSession?.token ?? null);
  readonly user = signal<AuthUser | null>(this.storedSession?.user ?? null);
  readonly isLoggedIn = computed(() => Boolean(this.token() && this.user()));
  readonly role = computed(() => this.user()?.role ?? null);

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, { email, password }).pipe(
      tap((response) => {
        this.saveSession(response);
        this.user.set(response.user);
        this.token.set(response.token);
      }),
      map((response) => response.user),
    );
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTH_STORAGE_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  private saveSession(response: LoginResponse): void {
    if (!response.token || !response.user || !Number.isSafeInteger(response.user.id)
      || typeof response.user.name !== 'string'
      || !['admin', 'cashier'].includes(response.user.role)) {
      throw new Error('A bejelentkezési válasz formátuma érvénytelen.');
    }
    if (typeof localStorage !== 'undefined') {
      const session: StoredSession = { token: response.token, user: response.user };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }
  }

  private restoreSession(): StoredSession | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof session.token === 'string' && session.token
        && session.user && Number.isSafeInteger(session.user.id)
        && typeof session.user.name === 'string'
        && ['admin', 'cashier'].includes(session.user.role)) {
        return { token: session.token, user: session.user };
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}
