import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { CheckoutService } from '../../core/services/checkout.service';
import { CheckoutInfo } from '../../models/booking';
import { FtPipe, HuDatePipe } from '../../shared/format.pipes';
import { LoadState, toLoadState } from '../../shared/load-state';
import { StatusMessageComponent } from '../../shared/status-message.component';

/**
 * DEMO fizetési oldal – csak akkor használt, ha a szerveren nincs Stripe kulcs.
 * Szándékosan NINCS kártyamező: nem kérünk és nem tárolunk kártyaadatot, a sikert / elutasítást gombok szimulálják.
 */
@Component({
  selector: 'app-mock-payment-page',
  imports: [RouterLink, FtPipe, HuDatePipe, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-xl">
      <p class="rounded border-2 border-brass bg-brass-soft p-3 text-sm font-semibold" role="note">
        DEMO fizetési oldal – nem történik valódi fizetés. Éles környezetben itt a fizetési szolgáltató (Stripe) oldala jelenik meg.
      </p>

      @switch (state().status) {
        @case ('loading') {
          <app-status-message kind="loading" />
        }
        @case ('error') {
          <div class="mt-6">
            <app-status-message kind="error" [message]="$any(state()).problem.message" [retryable]="false" />
            <a routerLink="/" class="btn btn-primary mt-4">Vissza a műsorhoz</a>
          </div>
        }
        @default {
          @let c = $any(state()).data;
          <h1 class="mt-6 text-3xl">Fizetés</h1>
          <div class="card mt-4 p-6">
            <p class="font-bold">{{ c.movieTitle }}</p>
            <p class="text-sm text-ink-soft">{{ c.startsAt | huDate: 'full' }} · {{ c.venueName }}, {{ c.hallName }}</p>
            <ul class="mt-4 divide-y divide-line">
              @for (s of c.seats; track s.id) {
                <li class="flex justify-between py-2"><span>{{ s.label }} szék</span><span>{{ s.price | ft }}</span></li>
              }
            </ul>
            <p class="mt-3 flex justify-between border-t-2 border-ink pt-3 text-xl font-bold">
              <span>Fizetendő végösszeg</span><span>{{ c.total | ft }}</span>
            </p>
            <p class="mt-3 text-sm" [class.text-brick]="secondsLeft() < 60" role="timer" aria-live="off">
              A helyek zárolva vannak még: <strong>{{ mmss() }}</strong>
            </p>
          </div>

          @if (c.mode !== 'mock') {
            <p class="mt-4 rounded border-2 border-brick bg-alert-soft p-3 font-semibold" role="alert">
              Ez az oldal csak demó módban használható. Éles fizetés a fizetési szolgáltató oldalán történik.
            </p>
          } @else {
            <div class="mt-6 grid gap-3">
              <button type="button" class="btn btn-primary" [disabled]="secondsLeft() === 0" (click)="finish(c, 'success')">
                Sikeres fizetés (teszt kártya)
              </button>
              <button type="button" class="btn btn-outline" [disabled]="secondsLeft() === 0" (click)="finish(c, 'declined')">
                Elutasított kártya szimulálása
              </button>
              <button type="button" class="btn btn-outline" (click)="abort(c)">Mégsem – megszakítom a fizetést</button>
            </div>
          }
        }
      }
    </div>
  `,
})
export class MockPaymentPageComponent {
  private readonly checkout = inject(CheckoutService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** ?ref= query paraméter (withComponentInputBinding). */
  readonly ref = input<string>();

  protected readonly state = toSignal(
    toObservable(this.ref).pipe(
      switchMap((ref) => toLoadState(this.checkout.getCheckout(ref ?? ''))),
    ),
    { initialValue: { status: 'loading' } as LoadState<CheckoutInfo> },
  );

  private readonly now = toSignal(timer(0, 1000).pipe(map(() => Date.now())), { initialValue: Date.now() });

  protected readonly secondsLeft = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') return 0;
    return Math.max(0, Math.floor((new Date(s.data.expiresAt).getTime() - this.now()) / 1000));
  });
  protected readonly mmss = computed(() => {
    const t = this.secondsLeft();
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  });

  /** A böngészőt a szerver /payments/confirm végpontjára irányítjuk, az rögzíti az eredményt. */
  protected finish(c: CheckoutInfo, result: 'success' | 'declined'): void {
    this.document.defaultView?.location.assign(this.checkout.confirmUrl(c.ref, result));
  }

  protected abort(c: CheckoutInfo): void {
    void this.router.navigate(['/payment/result'], {
      queryParams: { status: 'cancelled', ref: c.ref, screening: c.screeningId },
    });
  }
}
