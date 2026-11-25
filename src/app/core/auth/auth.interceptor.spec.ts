// @vitest-environment jsdom
import '@angular/compiler';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../services/api-config';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let token: WritableSignal<string | null>;
  let logout: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));

  beforeEach(() => {
    token = signal<string | null>('teszt-token');
    logout = vi.fn(() => token.set(null));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { token, logout },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    controller.verify();
    TestBed.resetTestingModule();
  });
  afterAll(() => TestBed.resetTestEnvironment());

  it('csak a saját API-kéréseken küldi a Bearer tokent', () => {
    http.get(`${API_BASE_URL}/movies`).subscribe();
    const apiRequest = controller.expectOne(`${API_BASE_URL}/movies`);
    expect(apiRequest.request.headers.get('Authorization')).toBe('Bearer teszt-token');
    apiRequest.flush([]);

    http.get('https://kulso.example.test/data').subscribe();
    const externalRequest = controller.expectOne('https://kulso.example.test/data');
    expect(externalRequest.request.headers.has('Authorization')).toBe(false);
    externalRequest.flush({});
  });

  it('401 esetén törli a munkamenetet és visszairányít a belépéshez', () => {
    const currentUrl = router.url;
    let receivedError: unknown;
    http.get(`${API_BASE_URL}/users`).subscribe({
      error: (error: unknown) => { receivedError = error; },
    });
    controller.expectOne(`${API_BASE_URL}/users`).flush(
      { error: 'Bejelentkezés szükséges.', code: 'UNAUTHORIZED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(receivedError).toBeInstanceOf(HttpErrorResponse);
    expect(logout).toHaveBeenCalledOnce();
    expect(token()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'],
      { queryParams: { returnUrl: currentUrl } },
    );
  });
});
