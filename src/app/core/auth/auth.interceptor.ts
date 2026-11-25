import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../services/api-config';
import { AuthService } from './auth.service';

function isApiRequest(url: string): boolean {
  const baseUrl = API_BASE_URL.replace(/\/$/, '');
  return url === baseUrl || url.startsWith(`${baseUrl}/`) || url.startsWith(`${baseUrl}?`);
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url)) return next(request);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const apiRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(apiRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.logout();
        if (router.url.split('?')[0] !== '/login') {
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        }
      }
      return throwError(() => error);
    }),
  );
};
