import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'program',
    title: 'Adminisztráció – Kisújszállási Vigadó',
  },
  {
    path: 'program',
    title: 'Filmek és események – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./movies-admin-page.component').then((module) => module.MoviesAdminPageComponent),
  },
  {
    path: 'screenings',
    title: 'Előadások – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./screenings-admin-page.component').then((module) => module.ScreeningsAdminPageComponent),
  },
  {
    path: 'venues',
    title: 'Helyszínek és termek – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./venues-admin-page.component').then((module) => module.VenuesAdminPageComponent),
  },
  {
    path: 'seats',
    title: 'Szektorok és székek – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./seating-admin-page.component').then((module) => module.SeatingAdminPageComponent),
  },
  {
    path: 'prices',
    title: 'Árak – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./pricing-admin-page.component').then((module) => module.PricingAdminPageComponent),
  },
  {
    path: 'users',
    title: 'Felhasználók – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./users-admin-page.component').then((module) => module.UsersAdminPageComponent),
  },
  {
    path: 'reservations',
    title: 'Foglalások – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./reservations-admin-page.component').then((module) => module.ReservationsAdminPageComponent),
  },
  {
    path: 'sales',
    title: 'Eladások – Admin | Kisújszállási Vigadó',
    loadComponent: () => import('./sales-admin-page.component').then((module) => module.SalesAdminPageComponent),
  },
];
