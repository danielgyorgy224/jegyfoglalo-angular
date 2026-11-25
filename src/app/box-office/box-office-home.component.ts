import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { toProblem } from '../core/util/api-error';
import { BookingRequest } from '../models/booking';
import { Movie } from '../models/movie';
import { Screening } from '../models/screening';
import { Seatmap, SeatmapSeat } from '../models/seatmap';
import { Hall, Venue } from '../models/venue';
import { SeatMapComponent } from '../shared/seat-map/seat-map.component';
import { StatusMessageComponent } from '../shared/status-message.component';
import { BoxOfficeApiService, CashierSale } from './box-office-api.service';
import { CashierReceipt, CashierReceiptComponent } from './cashier-receipt.component';

@Component({
  selector: 'app-box-office-home',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, SeatMapComponent, StatusMessageComponent, CashierReceiptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Pénztár</p>
          <h1 class="mt-2 text-3xl">Jegyeladás és helyszíni foglalás</h1>
        </div>
        <a routerLink="/box-office/reservations" class="btn btn-outline">Foglalások keresése és kezelése</a>
      </header>

      @if (loading()) {
        <app-status-message kind="loading" />
      } @else if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else if (venues().length === 0) {
        <p class="card p-5 text-ink-soft">Nincs elérhető helyszín.</p>
      } @else {
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ notice() }}</p>
        }

        <section class="card p-5">
          <h2 class="text-2xl">Előadás kiválasztása</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label for="cashier-venue" class="mb-1 block font-semibold">1. Helyszín</label>
              <select id="cashier-venue" class="field" [value]="selectedVenueId() ?? ''" [disabled]="saving()" (change)="changeVenue($event)">
                <option value="">Válassz helyszínt</option>
                @for (venue of venues(); track venue.id) {
                  <option [value]="venue.id">{{ venue.name }}</option>
                }
              </select>
            </div>
            <div>
              <label for="cashier-hall" class="mb-1 block font-semibold">2. Terem</label>
              <select id="cashier-hall" class="field" [value]="selectedHallId() ?? ''" [disabled]="selectedVenueId() === null || saving()" (change)="changeHall($event)">
                <option value="">Válassz termet</option>
                @for (hall of availableHalls(); track hall.id) {
                  <option [value]="hall.id">{{ hall.name }}</option>
                }
              </select>
            </div>
            <div>
              <label for="cashier-movie" class="mb-1 block font-semibold">3. Film vagy esemény</label>
              <select id="cashier-movie" class="field" [value]="selectedMovieId() ?? ''" [disabled]="selectedHallId() === null || saving()" (change)="changeMovie($event)">
                <option value="">Válassz műsort</option>
                @for (movie of availableMovies(); track movie.id) {
                  <option [value]="movie.id">{{ movie.title }}</option>
                }
              </select>
            </div>
            <div>
              <label for="cashier-screening" class="mb-1 block font-semibold">4. Időpont</label>
              <select id="cashier-screening" class="field" [value]="selectedScreeningId() ?? ''" [disabled]="selectedMovieId() === null || saving()" (change)="changeScreening($event)">
                <option value="">Válassz időpontot</option>
                @for (screening of availableScreenings(); track screening.id) {
                  <option [value]="screening.id">{{ screening.startsAt | date:'yyyy. MM. dd. HH:mm' }}</option>
                }
              </select>
            </div>
          </div>
          @if (selectedMovieId() !== null && availableScreenings().length === 0) {
            <p class="mt-4 text-ink-soft">Ehhez a teremhez és műsorhoz nincs aktív, jövőbeli előadás.</p>
          }
        </section>

        @if (selectedScreeningId() !== null) {
          @if (mapError()) {
            <app-status-message kind="error" [message]="mapError()" (retry)="loadSeatmap()" />
          } @else if (mapLoading()) {
            <app-status-message kind="loading" />
          } @else if (seatmap()) {
            @if (!seatmap()!.bookable) {
              <p class="rounded border-2 border-brass bg-brass-soft p-3" role="status">
                {{ seatmap()!.bookableReason || 'Erre az előadásra nem lehet jegyet váltani.' }}
              </p>
            }
            <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.7fr)]">
              <section class="card min-w-0 p-4 sm:p-5">
                <h2 class="text-2xl">5. Székek kiválasztása</h2>
                <p class="mt-1 text-ink-soft">{{ seatmap()!.movie.title }} · {{ seatmap()!.venue.name }} · {{ seatmap()!.hall.name }}</p>
                <div class="mt-5">
                  <app-seat-map
                    [seats]="seatmap()!.seats"
                    [prices]="seatmap()!.prices"
                    [sectors]="seatmap()!.sectors"
                    [selected]="selectedSeatIds()"
                    [maxSelect]="seatmap()!.maxSeats"
                    [readonly]="!seatmap()!.bookable || saving()"
                    (selectionChange)="selectSeats($event)"
                  />
                </div>
              </section>

              <aside class="card p-5 xl:sticky xl:top-4">
                <h2 class="text-2xl">Összesítő</h2>
                @if (selectedSeats().length === 0) {
                  <p class="mt-3 text-ink-soft">Nincs kiválasztott szék.</p>
                } @else {
                  <ul class="mt-3 divide-y divide-line">
                    @for (seat of selectedSeats(); track seat.id) {
                      <li class="flex justify-between gap-3 py-2">
                        <span>{{ seat.label }}</span><span>{{ seatmap()!.prices[seat.id] }} Ft</span>
                      </li>
                    }
                  </ul>
                  <p class="mt-4 flex justify-between border-t-2 border-ink pt-3 text-lg font-bold">
                    <span>VÉGÖSSZEG (tájékoztató)</span><span>{{ estimatedTotal() }} Ft</span>
                  </p>
                  <p class="mt-2 text-sm text-ink-soft">A végleges árat és a szabad helyeket a szerver ellenőrzi.</p>
                }

                <form class="mt-5 space-y-3" [formGroup]="customerForm" (ngSubmit)="reserveSeats()">
                  <h3 class="text-xl">Helyszíni foglalás</h3>
                  <div>
                    <label for="cashier-customer-name" class="mb-1 block font-semibold">Név</label>
                    <input id="cashier-customer-name" class="field" formControlName="customerName" maxlength="100" />
                    @if (customerForm.controls.customerName.touched && customerForm.controls.customerName.invalid) {
                      <p class="mt-1 text-sm text-brick">Legalább 2 karakteres nevet adj meg.</p>
                    }
                  </div>
                  <div>
                    <label for="cashier-customer-contact" class="mb-1 block font-semibold">Elérhetőség (telefon vagy e-mail)</label>
                    <input id="cashier-customer-contact" class="field" formControlName="customerContact" maxlength="120" />
                    @if (customerForm.controls.customerContact.touched && customerForm.controls.customerContact.invalid) {
                      <p class="mt-1 text-sm text-brick">Legalább 3 karakteres elérhetőség szükséges.</p>
                    }
                  </div>
                  <button class="btn btn-outline w-full" type="submit" [disabled]="saving() || selectedSeatIds().length === 0 || !seatmap()!.bookable">
                    {{ saving() ? 'Feldolgozás…' : 'Helyszíni foglalás' }}
                  </button>
                </form>

                <form class="mt-5 space-y-3 border-t border-line pt-5" [formGroup]="paymentForm" (ngSubmit)="sellSeats()">
                  <h3 class="text-xl">Jegy eladása</h3>
                  <div>
                    <label for="cashier-payment" class="mb-1 block font-semibold">Fizetési mód</label>
                    <select id="cashier-payment" class="field" formControlName="paymentMethod">
                      <option value="cash">Készpénz</option>
                      <option value="card">Bankkártya</option>
                    </select>
                  </div>
                  <button class="btn btn-primary w-full" type="submit" [disabled]="saving() || selectedSeatIds().length === 0 || !seatmap()!.bookable">
                    {{ saving() ? 'Feldolgozás…' : 'Jegy eladása' }}
                  </button>
                </form>
              </aside>
            </div>
          }
        }

        @if (receipt()) {
          <app-cashier-receipt [receipt]="receipt()!" />
        }
      }
    </div>
  `,
})
export class BoxOfficeHomeComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BoxOfficeApiService);

  protected readonly venues = signal<Venue[]>([]);
  protected readonly halls = signal<Hall[]>([]);
  protected readonly movies = signal<Movie[]>([]);
  protected readonly screenings = signal<Screening[]>([]);
  protected readonly selectedVenueId = signal<number | null>(null);
  protected readonly selectedHallId = signal<number | null>(null);
  protected readonly selectedMovieId = signal<number | null>(null);
  protected readonly selectedScreeningId = signal<number | null>(null);
  protected readonly seatmap = signal<Seatmap | null>(null);
  protected readonly selectedSeatIds = signal<number[]>([]);
  protected readonly receipt = signal<CashierReceipt | null>(null);
  protected readonly loading = signal(true);
  protected readonly mapLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly mapError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');
  private mapRequestId = 0;

  protected readonly customerForm = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    customerContact: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
  });
  protected readonly paymentForm = this.fb.nonNullable.group({
    paymentMethod: ['cash' as 'cash' | 'card', Validators.required],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      venues: this.api.venues(),
      halls: this.api.halls(),
      movies: this.api.movies(),
      screenings: this.api.screenings(),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ venues, halls, movies, screenings }) => {
        this.venues.set(venues);
        this.halls.set(halls);
        this.movies.set(movies);
        this.screenings.set(screenings);
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected availableHalls(): Hall[] {
    return this.halls().filter((hall) => hall.venueId === this.selectedVenueId());
  }

  protected availableMovies(): Movie[] {
    const hallId = this.selectedHallId();
    const movieIds = new Set(this.futureScreenings()
      .filter((screening) => screening.hallId === hallId)
      .map((screening) => screening.movieId));
    return this.movies().filter((movie) => movieIds.has(movie.id));
  }

  protected availableScreenings(): Screening[] {
    return this.futureScreenings().filter((screening) =>
      screening.hallId === this.selectedHallId() && screening.movieId === this.selectedMovieId());
  }

  protected selectedSeats(): SeatmapSeat[] {
    const selected = new Set(this.selectedSeatIds());
    return (this.seatmap()?.seats ?? []).filter((seat) => selected.has(seat.id));
  }

  protected estimatedTotal(): number {
    const prices = this.seatmap()?.prices ?? {};
    return this.selectedSeatIds().reduce((total, id) => total + (prices[id] ?? 0), 0);
  }

  protected changeVenue(event: Event): void {
    const id = this.readId(event);
    this.selectedVenueId.set(id);
    this.selectedHallId.set(null);
    this.selectedMovieId.set(null);
    this.selectScreening(null);
  }

  protected changeHall(event: Event): void {
    this.selectedHallId.set(this.readId(event));
    this.selectedMovieId.set(null);
    this.selectScreening(null);
  }

  protected changeMovie(event: Event): void {
    this.selectedMovieId.set(this.readId(event));
    this.selectScreening(null);
  }

  protected changeScreening(event: Event): void {
    this.selectScreening(this.readId(event));
  }

  protected selectSeats(ids: number[]): void {
    this.selectedSeatIds.set(ids);
    this.receipt.set(null);
    this.error.set('');
  }

  protected loadSeatmap(): void {
    const screeningId = this.selectedScreeningId();
    if (screeningId === null) return;
    const requestId = ++this.mapRequestId;
    this.mapLoading.set(true);
    this.mapError.set('');
    this.api.seatmap(screeningId).pipe(finalize(() => {
      if (requestId === this.mapRequestId) this.mapLoading.set(false);
    })).subscribe({
      next: (seatmap) => {
        if (requestId !== this.mapRequestId || screeningId !== this.selectedScreeningId()) return;
        this.seatmap.set(seatmap);
        if (!seatmap.bookable) this.selectedSeatIds.set([]);
      },
      error: (error: unknown) => {
        if (requestId !== this.mapRequestId || screeningId !== this.selectedScreeningId()) return;
        this.seatmap.set(null);
        this.mapError.set(toProblem(error).message);
      },
    });
  }

  protected reserveSeats(): void {
    if (this.customerForm.invalid || !this.canSubmitSeats()) {
      this.customerForm.markAllAsTouched();
      return;
    }
    const request: BookingRequest = {
      screeningId: this.selectedScreeningId()!,
      seatIds: this.selectedSeatIds(),
      ...this.customerForm.getRawValue(),
    };
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.api.createReservation(request).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (reservation) => {
        this.receipt.set({
          kind: 'reservation',
          code: reservation.code,
          movieTitle: reservation.movieTitle,
          venueName: reservation.venueName,
          hallName: reservation.hallName,
          startsAt: reservation.startsAt,
          customerName: reservation.customerName,
          total: reservation.total,
          seats: reservation.seats.map((seat) => ({ label: seat.label, price: seat.price })),
        });
        this.selectedSeatIds.set([]);
        this.customerForm.reset({ customerName: '', customerContact: '' });
        this.notice.set(`A foglalás elkészült. Kód: ${reservation.code}`);
        this.loadSeatmap();
      },
      error: (error: unknown) => this.handleActionError(error),
    });
  }

  protected sellSeats(): void {
    if (!this.canSubmitSeats()) return;
    const seatmap = this.seatmap()!;
    const selected = this.selectedSeats();
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.api.createSale({
      screeningId: this.selectedScreeningId()!,
      seatIds: this.selectedSeatIds(),
      paymentMethod: this.paymentForm.controls.paymentMethod.value,
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (sale) => {
        this.receipt.set(this.saleReceipt(sale, seatmap, selected));
        this.selectedSeatIds.set([]);
        this.notice.set(`Az eladás sikeres. ${sale.tickets.length} jegy kiállítva.`);
        this.loadSeatmap();
      },
      error: (error: unknown) => this.handleActionError(error),
    });
  }

  private futureScreenings(): Screening[] {
    const now = Date.now();
    return this.screenings().filter((screening) =>
      screening.status === 'active' && new Date(screening.startsAt).getTime() > now);
  }

  private readId(event: Event): number | null {
    const value = (event.target as HTMLSelectElement).value;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  private selectScreening(id: number | null): void {
    this.selectedScreeningId.set(id);
    this.selectedSeatIds.set([]);
    this.seatmap.set(null);
    this.receipt.set(null);
    this.error.set('');
    this.notice.set('');
    this.mapError.set('');
    if (id !== null) {
      this.loadSeatmap();
    } else {
      this.mapRequestId += 1;
      this.mapLoading.set(false);
    }
  }

  private canSubmitSeats(): boolean {
    return this.selectedScreeningId() !== null
      && this.selectedSeatIds().length > 0
      && this.seatmap()?.bookable === true;
  }

  private handleActionError(error: unknown): void {
    const problem = toProblem(error);
    if (problem.code === 'SEAT_UNAVAILABLE') {
      const labels = (problem.seatIds ?? [])
        .map((id) => this.seatmap()?.seats.find((seat) => seat.id === id)?.label ?? String(id));
      const conflictText = labels.length
        ? ` Lefoglalt szék(ek): ${labels.join(', ')}.`
        : '';
      this.error.set(`${problem.message}${conflictText} Frissítettem a székkiosztást.`);
      const unavailable = new Set(problem.seatIds ?? []);
      this.selectedSeatIds.update((ids) => ids.filter((id) => !unavailable.has(id)));
      this.loadSeatmap();
      return;
    }
    this.error.set(problem.message);
  }

  private saleReceipt(sale: CashierSale, seatmap: Seatmap, seats: SeatmapSeat[]): CashierReceipt {
    const labels = new Map(seats.map((seat) => [seat.id, seat.label]));
    return {
      kind: 'sale',
      code: `#${sale.id}`,
      movieTitle: seatmap.movie.title,
      venueName: seatmap.venue.name,
      hallName: seatmap.hall.name,
      startsAt: seatmap.screening.startsAt,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      seats: sale.tickets.map((ticket) => ({
        label: labels.get(ticket.seatId) ?? String(ticket.seatId),
        price: ticket.price,
        ticketCode: ticket.ticketCode,
      })),
    };
  }
}
