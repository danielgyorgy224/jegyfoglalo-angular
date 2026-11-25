import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { LogoComponent } from '../shared/logo.component';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-[70vh] max-w-7xl flex-col border border-line bg-paper md:flex-row">
      <aside class="w-full shrink-0 border-b-2 border-ink bg-paper-deep p-4 md:w-64 md:border-b-0 md:border-r-2 md:p-5">
        <a routerLink="/admin" class="flex items-center gap-3" aria-label="Adminisztráció kezdőlap">
          <app-logo [size]="38" />
          <span class="font-display text-xl font-semibold">Vigadó admin</span>
        </a>
        <nav class="mt-6 grid grid-cols-2 gap-1 md:grid-cols-1" aria-label="Adminisztrációs menü">
          @for (item of navigation; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-brass-soft font-bold"
              class="rounded px-3 py-2 hover:bg-paper"
            >
              {{ item.label }}
            </a>
          }
          <a
            routerLink="/box-office"
            routerLinkActive="bg-brass-soft font-bold"
            class="rounded px-3 py-2 hover:bg-paper"
          >
            Pénztár
          </a>
        </nav>
      </aside>

      <div class="min-w-0 flex-1">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <p class="font-semibold">{{ auth.user()?.name }}</p>
          <button type="button" class="btn btn-outline" (click)="logout()">Kijelentkezés</button>
        </header>
        <main class="p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly navigation = [
    { path: '/admin/program', label: 'Műsor' },
    { path: '/admin/screenings', label: 'Előadások' },
    { path: '/admin/venues', label: 'Helyszínek és termek' },
    { path: '/admin/seats', label: 'Szektorok és székek' },
    { path: '/admin/prices', label: 'Árak' },
    { path: '/admin/users', label: 'Felhasználók' },
    { path: '/admin/reservations', label: 'Foglalások' },
    { path: '/admin/sales', label: 'Eladások' },
  ];

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
