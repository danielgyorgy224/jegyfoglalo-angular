import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toProblem } from '../util/api-error';
import { AuthService, UserRole } from './auth.service';

@Component({
  selector: 'app-login-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-md">
      <a routerLink="/" class="font-semibold text-brick underline underline-offset-4">Vissza a műsorhoz</a>
      <div class="card mt-5 p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Kisújszállási Vigadó</p>
        <h1 class="mt-2 text-3xl">Belépés</h1>
        <p class="mt-2 text-ink-soft">Adminisztrátori vagy pénztárosi fiókkal léphetsz be.</p>

        @if (error()) {
          <p class="mt-5 rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <form class="mt-6 space-y-4" (submit)="submit($event)">
          <div>
            <label for="email" class="mb-1 block font-semibold">E-mail-cím</label>
            <input
              id="email"
              class="field"
              type="email"
              name="email"
              autocomplete="username"
              required
              [value]="email()"
              (input)="setEmail($event)"
            />
          </div>
          <div>
            <label for="password" class="mb-1 block font-semibold">Jelszó</label>
            <input
              id="password"
              class="field"
              type="password"
              name="password"
              autocomplete="current-password"
              required
              [value]="password()"
              (input)="setPassword($event)"
            />
          </div>
          <button class="btn btn-primary w-full" type="submit" [disabled]="pending()">
            {{ pending() ? 'Belépés…' : 'Belépés' }}
          </button>
        </form>
      </div>
    </section>
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal('');

  protected setEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected setPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    if (this.pending()) return;

    this.error.set('');
    this.pending.set(true);
    this.auth.login(this.email().trim(), this.password()).subscribe({
      next: (user) => {
        this.pending.set(false);
        void this.router.navigateByUrl(this.getReturnUrl(user.role));
      },
      error: (error: unknown) => {
        this.pending.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.error.set('Hibás e-mail-cím vagy jelszó.');
        } else if (error instanceof HttpErrorResponse && error.status === 403) {
          this.error.set('A fiók inaktív, ezért nem tudsz belépni.');
        } else {
          this.error.set(toProblem(error).message);
        }
      },
    });
  }

  private getReturnUrl(role: UserRole): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return this.defaultUrl(role);
    }

    const path = returnUrl.split(/[?#]/, 1)[0];
    const isWithin = (base: string) => path === base || path.startsWith(`${base}/`);
    const allowed = role === 'admin'
      ? isWithin('/admin') || isWithin('/box-office')
      : isWithin('/box-office');
    return allowed ? returnUrl : this.defaultUrl(role);
  }

  private defaultUrl(role: UserRole): string {
    return role === 'admin' ? '/admin' : '/box-office';
  }
}
