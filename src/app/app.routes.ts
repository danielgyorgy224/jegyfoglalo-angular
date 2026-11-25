import { Routes } from '@angular/router';

export const routes: Routes = [
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
    path: '**',
    title: 'Nem található – Kisújszállási Vigadó',
    loadComponent: () => import('./features/not-found.component').then((m) => m.NotFoundComponent),
  },
];
