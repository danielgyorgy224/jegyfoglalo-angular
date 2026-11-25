import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, merge, switchMap } from 'rxjs';
import { ReservationService } from '../../core/services/reservation.service';
import { Reservation } from '../../models/booking';
import { FtPipe, HuDatePipe } from '../../shared/format.pipes';
import { LoadState, toLoadState } from '../../shared/load-state';
import { StatusMessageComponent } from '../../shared/status-message.component';

/** Foglalás visszaigazolása: azonosító, az előadás adatai és a kiválasztott székek. */
@Component({
  selector: 'app-reservation-page',
  imports: [RouterLink, FtPipe, HuDatePipe, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('loading') {
        <app-status-message kind="loading" />
      }
      @case ('error') {
        <app-status-message kind="error" [message]="$any(state()).problem.message" (retry)="retry$.next()" />
      }
      @default {
        @let r = $any(state()).data;
        <article class="mx-auto max-w-2xl">
          <p class="inline-block rounded bg-pine px-3 py-1 text-sm font-bold text-white">✓ Foglalásodat rögzítettük</p>
          <h1 class="mt-3 text-3xl sm:text-4xl">Foglalás visszaigazolása</h1>

          <div class="card mt-6 p-6">
            <p class="text-sm font-semibold uppercase tracking-wider text-ink-soft">Foglalási azonosító</p>
            <p class="mt-1 font-mono text-4xl font-bold tracking-widest text-brick" data-testid="reservation-code">{{ r.code }}</p>
            <p class="mt-1 text-sm text-ink-soft">Ezzel az azonosítóval válthatod jegyre a foglalásodat a helyszíni pénztárban.</p>

            <dl class="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-[9rem_1fr]">
              <dt class="font-semibold text-ink-soft">Előadás</dt>
              <dd class="font-bold">{{ r.movieTitle }}</dd>
              <dt class="font-semibold text-ink-soft">Időpont</dt>
              <dd>{{ r.startsAt | huDate: 'full' }}</dd>
              <dt class="font-semibold text-ink-soft">Helyszín</dt>
              <dd>{{ r.venueName }}<br /><span class="text-sm text-ink-soft">{{ r.venueAddress }}</span></dd>
              <dt class="font-semibold text-ink-soft">Terem</dt>
              <dd>{{ r.hallName }}</dd>
              <dt class="font-semibold text-ink-soft">Székek</dt>
              <dd>
                <ul class="flex flex-wrap gap-2">
                  @for (s of r.seats; track s.id) {
                    <li class="rounded border-2 border-ink px-2 py-0.5 font-bold">{{ s.label }} <span class="font-normal text-ink-soft">({{ s.price | ft }})</span></li>
                  }
                </ul>
              </dd>
              <dt class="font-semibold text-ink-soft">Állapot</dt>
              <dd>{{ statusLabel(r.status) }}</dd>
              <dt class="font-semibold text-ink-soft">Fizetendő</dt>
              <dd class="text-lg font-bold">{{ r.total | ft }}</dd>
            </dl>
          </div>

          <div class="mt-6 flex flex-wrap gap-3 print:hidden">
            <button type="button" class="btn btn-outline" (click)="print()">Nyomtatás</button>
            <a routerLink="/" class="btn btn-primary">Vissza a műsorhoz</a>
          </div>
        </article>
      }
    }
  `,
})
export class ReservationPageComponent {
  private readonly reservations = inject(ReservationService);
  protected readonly retry$ = new Subject<void>();

  /** Az útvonal :code paramétere. */
  readonly code = input.required<string>();

  protected readonly state = toSignal(
    merge(toObservable(this.code), this.retry$.pipe(switchMap(() => [this.code()]))).pipe(
      switchMap((code) => toLoadState(this.reservations.getByCode(code))),
    ),
    { initialValue: { status: 'loading' } as LoadState<Reservation> },
  );

  protected statusLabel(status: Reservation['status']): string {
    return { active: 'Érvényes foglalás', cancelled: 'Törölve', converted: 'Jegyre váltva', expired: 'Lejárt' }[status];
  }

  protected print(): void {
    window.print();
  }
}
