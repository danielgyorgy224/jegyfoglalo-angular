import { Routes } from '@angular/router';
import { adminGuard, cashierGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Belépés – Kisújszállási Vigadó',
    loadComponent: () => import('./core/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: '',
    title: 'Műsor – Kisújszállási Vigadó',
    loadComponent: () => import('./features/program/program-page.component').then((m) => m.ProgramPageComponent),
  },
  {
    path: 'movies/:id',
    title: 'Előadás – Kisújszállási Vigadó',
    loadComponent: () => import('./features/movie/movie-page.component').then((m) => m.MoviePageComponent),
  },
  {
    path: 'screenings/:id',
    title: 'Székválasztás – Kisújszállási Vigadó',
    loadComponent: () => import('./features/booking/booking-page.component').then((m) => m.BookingPageComponent),
  },
  {
    path: 'reservation/:code',
    title: 'Foglalás visszaigazolása – Kisújszállási Vigadó',
    loadComponent: () =>
      import('./features/booking/reservation-page.component').then((m) => m.ReservationPageComponent),
  },
  {
    path: 'payment/mock',
    title: 'Fizetés (demo) – Kisújszállási Vigadó',
    loadComponent: () => import('./features/payment/mock-payment-page.component').then((m) => m.MockPaymentPageComponent),
  },
  {
    path: 'payment/result',
    title: 'Fizetés eredménye – Kisújszállási Vigadó',
    loadComponent: () =>
      import('./features/payment/payment-result-page.component').then((m) => m.PaymentResultPageComponent),
  },
  {
    path: 'admin',
    title: 'Adminisztráció – Kisújszállási Vigadó',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-shell.component').then((m) => m.AdminShellComponent),
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'box-office',
    title: 'Pénztár – Kisújszállási Vigadó',
    canActivate: [cashierGuard],
    loadComponent: () => import('./box-office/box-office-shell.component').then((m) => m.BoxOfficeShellComponent),
    loadChildren: () => import('./box-office/box-office.routes').then((m) => m.BOX_OFFICE_ROUTES),
  },
  {
    path: '**',
    title: 'Nem található – Kisújszállási Vigadó',
    loadComponent: () => import('./features/not-found.component').then((m) => m.NotFoundComponent),
  },
];
