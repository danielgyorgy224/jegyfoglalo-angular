import { Routes } from '@angular/router';

export const BOX_OFFICE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Jegyeladás – Pénztár | Kisújszállási Vigadó',
    loadComponent: () => import('./box-office-home.component').then((module) => module.BoxOfficeHomeComponent),
  },
  {
    path: 'reservations',
    title: 'Foglalások – Pénztár | Kisújszállási Vigadó',
    loadComponent: () => import('./box-office-reservations.component').then((module) => module.BoxOfficeReservationsComponent),
  },
];
