// @vitest-environment jsdom
import '@angular/compiler';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService, UserRole } from './auth.service';
import { adminGuard, cashierGuard } from './auth.guards';

describe('auth guards', () => {
  let loggedIn: boolean;
  let role: WritableSignal<UserRole | null>;

  beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => TestBed.resetTestEnvironment());

  beforeEach(() => {
    loggedIn = false;
    role = signal<UserRole | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => loggedIn,
            role,
          },
        },
      ],
    });
  });

  const checkGuard = (guard: typeof adminGuard | typeof cashierGuard, url: string) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

  it('csak admin szerepkörrel engedi az admin útvonalat', () => {
    loggedIn = true;
    role.set('admin');
    expect(checkGuard(adminGuard, '/admin/users')).toBe(true);

    role.set('cashier');
    const result = checkGuard(adminGuard, '/admin/users');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).queryParams['returnUrl']).toBe('/admin/users');
  });

  it('a pénztárost és az admint is beengedi a pénztárba, másokat visszairányít', () => {
    loggedIn = true;
    role.set('cashier');
    expect(checkGuard(cashierGuard, '/box-office')).toBe(true);
    role.set('admin');
    expect(checkGuard(cashierGuard, '/box-office')).toBe(true);

    loggedIn = false;
    const result = checkGuard(cashierGuard, '/box-office/reservations');
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toContain('returnUrl=%2Fbox-office%2Freservations');
  });
});
