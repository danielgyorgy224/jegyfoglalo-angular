import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { LogoComponent } from '../shared/logo.component';

@Component({
  selector: 'app-box-office-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto min-h-[70vh] max-w-6xl border border-line bg-paper">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink bg-paper-deep px-4 py-4 sm:px-6">
        <a routerLink="/box-office" class="flex items-center gap-3" aria-label="Pénztár kezdőlap">
          <app-logo [size]="38" />
          <span>
            <span class="block font-display text-xl font-semibold">Vigadó pénztár</span>
            <span class="block text-sm text-ink-soft">{{ auth.user()?.name }}</span>
          </span>
        </a>
        <div class="flex flex-wrap items-center gap-3">
          <nav class="flex gap-2" aria-label="Pénztári menü">
            <a
              routerLink="/box-office"
              [routerLinkActiveOptions]="{ exact: true }"
              routerLinkActive="bg-brass-soft font-bold"
              class="rounded px-3 py-2 hover:bg-paper"
            >
              Jegyeladás
            </a>
            <a
              routerLink="/box-office/reservations"
              routerLinkActive="bg-brass-soft font-bold"
              class="rounded px-3 py-2 hover:bg-paper"
            >
              Foglalások
            </a>
          </nav>
          <button type="button" class="btn btn-outline" (click)="logout()">Kijelentkezés</button>
        </div>
      </header>
      <main class="p-4 sm:p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class BoxOfficeShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
