import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, merge, switchMap, tap, timer } from 'rxjs';
import { CheckoutService } from '../../core/services/checkout.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ScreeningService } from '../../core/services/screening.service';
import { ApiProblem, toProblem } from '../../core/util/api-error';
import { BookingRequest } from '../../models/booking';
import { Seatmap } from '../../models/seatmap';
import { FtPipe, HuDatePipe } from '../../shared/format.pipes';
import { SeatMapComponent } from '../../shared/seat-map/seat-map.component';
import { StatusMessageComponent } from '../../shared/status-message.component';

/** Ilyen gyakran frissítjük a székállapotokat, hogy más foglalása/vásárlása látszódjon. */
const POLL_MS = 15_000;

@Component({
  selector: 'app-booking-page',
  imports: [ReactiveFormsModule, RouterLink, SeatMapComponent, StatusMessageComponent, FtPipe, HuDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-page.component.html',
})
export class BookingPageComponent {
  private readonly screenings = inject(ScreeningService);
  private readonly reservations = inject(ReservationService);
  private readonly checkout = inject(CheckoutService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  /** Az útvonal :id paramétere (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly seatmap = signal<Seatmap | null>(null);
  protected readonly loadProblem = signal<ApiProblem | null>(null);
  protected readonly selected = signal<number[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    customerContact: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
  });

  /** A kiválasztott székek sorai (felirat + ár) és a végösszeg. */
  protected readonly lines = computed(() => {
    const map = this.seatmap();
    if (!map) return [];
    return this.selected().flatMap((id) => {
      const seat = map.seats.find((s) => s.id === id);
      return seat ? [{ id, label: seat.label, price: map.prices[id] ?? 0 }] : [];
    });
  });
  protected readonly total = computed(() => this.lines().reduce((sum, l) => sum + l.price, 0));

  constructor() {
    // Székállapotok betöltése és időnkénti frissítése; a screening id változására újraindul.
    toObservable(this.id)
      .pipe(
        tap(() => {
          this.seatmap.set(null);
          this.selected.set([]);
          this.loadProblem.set(null);
        }),
        switchMap((id) =>
          merge(timer(0, POLL_MS), this.refresh$).pipe(
            switchMap(() =>
              this.screenings.seatmap(Number(id)).pipe(
                catchError((err) => {
                  this.loadProblem.set(toProblem(err));
                  return EMPTY; // a legutóbbi ismert térkép marad látható
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((map) => this.applySeatmap(map));
  }

  protected onSelectionChange(ids: number[]): void {
    this.selected.set(ids);
    this.problem.set(null);
  }

  protected retry(): void {
    this.loadProblem.set(null);
    this.refresh$.next();
  }

  protected reserve(): void {
    this.submit((req) =>
      this.reservations.create(req).pipe(tap((r) => void this.router.navigate(['/reservation', r.code]))),
    );
  }

  protected pay(): void {
    this.submit((req) =>
      this.checkout.start(req).pipe(
        // a szolgáltató (vagy a demo) oldalára lépünk; a kártyaadatot nem mi kezeljük
        tap((c) => this.document.defaultView?.location.assign(c.checkoutUrl)),
      ),
    );
  }

  private submit(call: (req: BookingRequest) => Observable<unknown>): void {
    const map = this.seatmap();
    if (!map || this.busy()) return;
    if (this.form.invalid || this.selected().length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const req: BookingRequest = { screeningId: map.screening.id, seatIds: this.selected(), ...this.form.getRawValue() };
    call(req).subscribe({
      // siker esetén a busy állapot marad: az oldal továbblép
      error: (err) => {
        this.busy.set(false);
        this.onSubmitError(err);
      },
    });
  }

  private onSubmitError(err: unknown): void {
    const problem = toProblem(err);
    this.problem.set(problem);
    if (problem.seatIds?.length) {
      // a közben elfogyott helyek kikerülnek a választásból, a térkép frissül
      this.selected.update((ids) => ids.filter((id) => !problem.seatIds!.includes(id)));
      this.refresh$.next();
    }
  }

  private applySeatmap(map: Seatmap): void {
    this.seatmap.set(map);
    this.loadProblem.set(null);
    const stillFree = new Set(map.seats.filter((s) => s.status === 'free').map((s) => s.id));
    const lost = this.selected().filter((id) => !stillFree.has(id));
    if (lost.length) {
      const labels = lost.map((id) => map.seats.find((s) => s.id === id)?.label ?? id).join(', ');
      this.selected.update((ids) => ids.filter((id) => stillFree.has(id)));
      this.notice.set(`Közben elfogyott: ${labels}. Kivettük a választásodból.`);
    }
  }
}
