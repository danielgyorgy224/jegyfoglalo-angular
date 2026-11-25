import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AdminDataService, PriceOverride, PriceUpdate } from '../core/services/admin-data.service';
import { toProblem } from '../core/util/api-error';
import { Movie } from '../models/movie';
import { Screening } from '../models/screening';
import { PriceMap, Seatmap, SeatmapSeat, Sector } from '../models/seatmap';
import { SeatMapComponent } from '../shared/seat-map/seat-map.component';
import { StatusMessageComponent } from '../shared/status-message.component';

interface SectorPriceRow {
  sector: Sector;
  control: FormControl<number | null>;
}

@Component({
  selector: 'app-pricing-admin-page',
  imports: [ReactiveFormsModule, SeatMapComponent, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Árazás</h1>
      </header>

      @if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else if (loading()) {
        <app-status-message kind="loading" />
      } @else if (screenings().length === 0) {
        <p class="card p-5 text-ink-soft">Még nincs előadás, amelyhez árakat lehetne beállítani.</p>
      } @else {
        @if (notice()) {
          <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ notice() }}</p>
        }
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <section class="card space-y-4 p-5">
          <div class="max-w-2xl">
            <label for="price-screening" class="mb-1 block font-semibold">Előadás</label>
            <select id="price-screening" class="field" [value]="selectedScreeningId() ?? ''" (change)="changeScreening($event)">
              @for (screening of screenings(); track screening.id) {
                <option [value]="screening.id">{{ movieName(screening.movieId) }} · {{ screening.startsAt }}</option>
              }
            </select>
          </div>
        </section>

        @if (detailError()) {
          <app-status-message kind="error" [message]="detailError()" (retry)="loadSelected()" />
        } @else if (detailLoading()) {
          <app-status-message kind="loading" />
        } @else if (seatmap()) {
          <section class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
            <div class="card p-5">
              <h2 class="text-2xl">Alapár és szektorárak</h2>
              <form class="mt-4 space-y-4" [formGroup]="basePriceForm">
                <div class="max-w-sm">
                  <label for="base-price" class="mb-1 block font-semibold">Alapár (Ft)</label>
                  <input id="base-price" class="field" type="number" min="0" step="1" formControlName="basePrice" />
                </div>
                @if (sectorRows().length === 0) {
                  <p class="text-ink-soft">Ehhez az előadáshoz nincs szektor.</p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full min-w-md border-collapse text-left">
                      <thead>
                        <tr class="border-b-2 border-line">
                          <th class="p-2">Szektor</th>
                          <th class="p-2">Egyedi ár (üres = alapár)</th>
                          <th class="p-2">Érvényes szektorár</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of sectorRows(); track row.sector.id) {
                          <tr class="border-b border-line">
                            <td class="p-2 font-semibold">{{ row.sector.name }}</td>
                            <td class="p-2">
                              <input class="field min-w-32" type="number" min="0" step="1" [formControl]="row.control" [attr.aria-label]="row.sector.name + ' egyedi ára'" />
                            </td>
                            <td class="p-2">{{ effectiveSectorPrice(row) }} Ft</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </form>
            </div>

            <div class="card p-5">
              <h2 class="text-2xl">Székár beállítása</h2>
              <p class="mt-2 text-ink-soft">Válassz ki egy széket a teremnézeten. Az üres ár örökli a szektor- vagy alapárat.</p>
              @if (selectedSeat()) {
                <form class="mt-4 space-y-3" [formGroup]="seatPriceForm">
                  <p class="font-semibold">{{ selectedSeat()!.label }}</p>
                  <label for="seat-price" class="block font-semibold">Egyedi ár (Ft)</label>
                  <input id="seat-price" class="field" type="number" min="0" step="1" formControlName="price" />
                  <p>Érvényes ár: <strong>{{ selectedSeatPrice() }} Ft</strong></p>
                  <button type="button" class="btn btn-outline" (click)="removeSeatOverride()">Székár törlése</button>
                </form>
              } @else {
                <p class="mt-4 text-ink-soft">Válassz egy széket a lenti térképen.</p>
              }
            </div>
          </section>

          <section class="card p-5">
            <h2 class="text-2xl">Teremnézet</h2>
            <div class="mt-4">
              <app-seat-map
                [seats]="mapSeats()"
                [prices]="previewPrices()"
                [sectors]="seatmap()!.sectors"
                [selected]="selectedSeatIds()"
                [maxSelect]="1"
                (selectionChange)="selectSeat($event)"
              />
            </div>
            <button type="button" class="btn btn-primary mt-6" [disabled]="saving()" (click)="savePrices()">
              {{ saving() ? 'Mentés…' : 'Árak mentése' }}
            </button>
          </section>
        }
      }
    </div>
  `,
})
export class PricingAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);
  private overrides: PriceOverride[] = [];

  protected readonly movies = signal<Movie[]>([]);
  protected readonly screenings = signal<Screening[]>([]);
  protected readonly selectedScreeningId = signal<number | null>(null);
  protected readonly seatmap = signal<Seatmap | null>(null);
  protected readonly sectorRows = signal<SectorPriceRow[]>([]);
  protected readonly selectedSeatIds = signal<number[]>([]);
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly detailError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly basePriceForm = this.fb.nonNullable.group({
    basePrice: [0, [Validators.required, Validators.min(0)]],
  });
  protected readonly seatPriceForm = this.fb.group({
    price: this.fb.control<number | null>(null, Validators.min(0)),
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      movies: this.admin.list<Movie>('movies'),
      screenings: this.admin.list<Screening>('screenings'),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ movies, screenings }) => {
        this.movies.set(movies);
        this.screenings.set(screenings);
        if (screenings.length) {
          const currentId = this.selectedScreeningId();
          const nextId = currentId !== null && screenings.some((screening) => screening.id === currentId)
            ? currentId
            : screenings[0].id;
          this.selectedScreeningId.set(nextId);
          this.loadSelected();
        }
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected movieName(movieId: number): string {
    return this.movies().find((movie) => movie.id === movieId)?.title ?? 'Ismeretlen cím';
  }

  protected changeScreening(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedScreeningId.set(Number.isSafeInteger(id) && id > 0 ? id : null);
    this.loadSelected();
  }

  protected loadSelected(): void {
    const screeningId = this.selectedScreeningId();
    if (screeningId === null) return;
    this.detailLoading.set(true);
    this.detailError.set('');
    this.error.set('');
    forkJoin({
      seatmap: this.admin.loadSeatmap(screeningId),
      overrides: this.admin.list<PriceOverride>('priceOverrides'),
    }).pipe(finalize(() => this.detailLoading.set(false))).subscribe({
      next: ({ seatmap, overrides }) => {
        this.seatmap.set(seatmap);
        this.overrides = overrides.filter((override) => override.screeningId === screeningId);
        this.initializePrices(seatmap);
      },
      error: (error: unknown) => this.detailError.set(toProblem(error).message),
    });
  }

  protected mapSeats(): SeatmapSeat[] {
    return (this.seatmap()?.seats ?? []).map((seat) => ({
      ...seat,
      status: seat.status === 'disabled' ? 'disabled' : 'free',
    }));
  }

  protected selectedSeat(): SeatmapSeat | null {
    const id = this.selectedSeatIds()[0];
    return id === undefined ? null : this.seatmap()?.seats.find((seat) => seat.id === id) ?? null;
  }

  protected selectSeat(ids: number[]): void {
    const previousId = this.selectedSeatIds()[0];
    const nextId = ids[0];
    if (this.seatPriceForm.controls.price?.dirty && previousId !== undefined && nextId !== previousId) {
      if (!window.confirm('A módosítatlanul hagyott székár elveszik. Folytatod?')) return;
    }
    this.selectedSeatIds.set(ids.slice(0, 1));
    const override = nextId === undefined
      ? undefined
      : this.overrides.find((item) => item.scope === 'seat' && item.targetId === nextId);
    this.seatPriceForm.controls.price?.setValue(override?.price ?? null);
    this.seatPriceForm.controls.price?.markAsPristine();
  }

  protected removeSeatOverride(): void {
    this.seatPriceForm.controls.price?.setValue(null);
    this.seatPriceForm.controls.price?.markAsDirty();
  }

  protected effectiveSectorPrice(row: SectorPriceRow): number {
    return row.control.value ?? this.basePriceForm.controls.basePrice.value;
  }

  protected selectedSeatPrice(): number {
    const seat = this.selectedSeat();
    if (!seat) return 0;
    const explicit = this.seatPriceForm.controls.price?.value;
    if (explicit !== null && explicit !== undefined) return explicit;
    return this.sectorRows().find((row) => row.sector.id === seat.sectorId)?.control.value
      ?? this.basePriceForm.controls.basePrice.value;
  }

  protected previewPrices(): PriceMap {
    const seatmap = this.seatmap();
    if (!seatmap) return {};
    const sectorPrices = new Map(this.sectorRows().map((row) => [row.sector.id, row.control.value]));
    const selectedSeatId = this.selectedSeatIds()[0];
    const selectedSeatPrice = this.seatPriceForm.controls.price?.value;
    const result: PriceMap = {};
    for (const seat of seatmap.seats) {
      const currentSeatOverride = this.overrides.find((override) =>
        override.scope === 'seat' && override.targetId === seat.id);
      const seatOverride = seat.id === selectedSeatId && this.seatPriceForm.controls.price?.dirty
        ? selectedSeatPrice
        : currentSeatOverride?.price;
      const sectorOverride = sectorPrices.get(seat.sectorId);
      result[seat.id] = seatOverride ?? sectorOverride
        ?? this.basePriceForm.controls.basePrice.value;
    }
    return result;
  }

  protected savePrices(): void {
    const screeningId = this.selectedScreeningId();
    if (screeningId === null || this.basePriceForm.invalid || this.seatPriceForm.invalid) {
      this.basePriceForm.markAllAsTouched();
      this.seatPriceForm.markAllAsTouched();
      this.error.set('Ellenőrizd, hogy minden megadott ár nem negatív egész szám legyen.');
      return;
    }
    const basePrice = this.basePriceForm.controls.basePrice.value;
    if (!Number.isSafeInteger(basePrice)) {
      this.error.set('Az alapár nem negatív egész szám legyen.');
      return;
    }
    const sectors: Record<number, number | null> = {};
    for (const row of this.sectorRows()) {
      if (!row.control.dirty) continue;
      const price = row.control.value;
      if (price !== null && !Number.isSafeInteger(price)) {
        this.error.set(`A(z) „${row.sector.name}” szektor ára nem egész szám.`);
        return;
      }
      sectors[row.sector.id] = price;
    }
    const seats: Record<number, number | null> = {};
    const selectedSeatId = this.selectedSeatIds()[0];
    const seatPrice = this.seatPriceForm.controls.price?.value;
    if (selectedSeatId !== undefined && this.seatPriceForm.controls.price?.dirty) {
      if (seatPrice !== null && seatPrice !== undefined && !Number.isSafeInteger(seatPrice)) {
        this.error.set('A szék ára nem negatív egész szám legyen.');
        return;
      }
      seats[selectedSeatId] = seatPrice ?? null;
    }
    const payload: PriceUpdate = { basePrice, sectors, seats };
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.admin.updatePrices(screeningId, payload).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.notice.set('Az árak elmentve.');
        this.loadSelected();
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  private initializePrices(seatmap: Seatmap): void {
    const basePrice = seatmap.screening.basePrice;
    const sectorRows = seatmap.sectors.map((sector) => {
      const override = this.overrides.find((item) => item.scope === 'sector' && item.targetId === sector.id);
      return {
        sector,
        control: new FormControl<number | null>(override?.price ?? null, Validators.min(0)),
      };
    });
    this.sectorRows.set(sectorRows);
    this.basePriceForm.reset({ basePrice });
    this.basePriceForm.markAsPristine();
    this.selectedSeatIds.set([]);
    this.seatPriceForm.reset({ price: null });
  }
}
