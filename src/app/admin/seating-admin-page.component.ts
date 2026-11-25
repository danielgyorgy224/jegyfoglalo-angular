import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AdminDataService, AdminSeat } from '../core/services/admin-data.service';
import { toProblem } from '../core/util/api-error';
import { Screening } from '../models/screening';
import { Seatmap, Sector } from '../models/seatmap';
import { Hall } from '../models/venue';
import { SeatMapComponent } from '../shared/seat-map/seat-map.component';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-seating-admin-page',
  imports: [ReactiveFormsModule, SeatMapComponent, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Szektorok és székek</h1>
      </header>

      @if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else if (loading()) {
        <app-status-message kind="loading" />
      } @else {
        @if (notice()) {
          <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ notice() }}</p>
        }
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <section class="card space-y-4 p-5">
          <h2 class="text-2xl">Terem kiválasztása</h2>
          @if (halls().length === 0) {
            <p class="text-ink-soft">Először hozz létre termet a Helyszínek és termek oldalon.</p>
          } @else {
            <label for="selected-hall" class="block font-semibold">Terem</label>
            <select id="selected-hall" class="field max-w-xl" [value]="selectedHallId() ?? ''" (change)="changeHall($event)">
              @for (hall of halls(); track hall.id) {
                <option [value]="hall.id">{{ hall.name }}</option>
              }
            </select>
          }
        </section>

        @if (selectedHallId() !== null) {
          <section class="grid gap-6 xl:grid-cols-2">
            <div class="card p-5">
              <h2 class="text-2xl">Szektor szerkesztése</h2>
              <form class="mt-4 space-y-3" [formGroup]="sectorForm" (ngSubmit)="saveSector()">
                <div>
                  <label for="sector-name" class="mb-1 block font-semibold">Szektornév</label>
                  <input id="sector-name" class="field" formControlName="name" required />
                  @if (sectorForm.controls.name.touched && sectorForm.controls.name.invalid) {
                    <p class="mt-1 text-sm text-brick">A szektornév megadása kötelező.</p>
                  }
                </div>
                <div>
                  <label for="sector-rows" class="mb-1 block font-semibold">Sorok (vesszővel elválasztva)</label>
                  <input id="sector-rows" class="field" formControlName="rows" placeholder="A, B, C" required />
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-primary" type="submit" [disabled]="saving()">
                    {{ saving() ? 'Mentés…' : editingSectorId() ? 'Módosítás mentése' : 'Szektor létrehozása' }}
                  </button>
                  @if (editingSectorId()) {
                    <button class="btn btn-outline" type="button" (click)="resetSectorForm()">Mégse</button>
                  }
                </div>
              </form>

              <h3 class="mt-7 text-xl">Szektorok</h3>
              @if (hallSectors().length === 0) {
                <p class="mt-3 text-ink-soft">Ehhez a teremhez még nincs szektor.</p>
              } @else {
                <ul class="mt-3 divide-y divide-line">
                  @for (sector of hallSectors(); track sector.id) {
                    <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span>
                        <span class="font-semibold">{{ sector.name }}</span>
                        <span class="text-ink-soft"> · {{ sector.rows.join(', ') }}</span>
                      </span>
                      <div class="flex gap-2">
                        <button type="button" class="btn btn-outline" (click)="editSector(sector)">Szerkesztés</button>
                        <button type="button" class="btn btn-outline" (click)="deleteSector(sector)">Törlés</button>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="card p-5">
              <h2 class="text-2xl">Ülésrács generálása</h2>
              <p class="mt-2 text-ink-soft">Csak üres teremhez készíthető új rács; a művelet a terem összes sorát és székét létrehozza.</p>
              <form class="mt-4 space-y-3" [formGroup]="generatorForm" (ngSubmit)="generate()">
                <div>
                  <label for="grid-sector-name" class="mb-1 block font-semibold">Szektornév</label>
                  <input id="grid-sector-name" class="field" formControlName="name" required />
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label for="grid-row-count" class="mb-1 block font-semibold">Sorok száma</label>
                    <input id="grid-row-count" class="field" type="number" min="1" max="100" formControlName="rowCount" required />
                  </div>
                  <div>
                    <label for="grid-seats-count" class="mb-1 block font-semibold">Szék soronként</label>
                    <input id="grid-seats-count" class="field" type="number" min="1" max="100" formControlName="seatsPerRow" required />
                  </div>
                </div>
                <div class="rounded bg-paper-deep p-3">
                  <p class="font-semibold">Előnézet</p>
                  <p>{{ rowPreview() }} sor · {{ generatorForm.controls.seatsPerRow.value }} szék / sor</p>
                  <p class="text-sm text-ink-soft">Összesen: {{ previewSeatCount() }} szék (legfeljebb 5000)</p>
                </div>
                <button class="btn btn-primary" type="submit" [disabled]="saving() || generatorForm.invalid">
                  {{ saving() ? 'Létrehozás…' : 'Ülésrács létrehozása' }}
                </button>
              </form>
            </div>
          </section>

          <section class="card p-5">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 class="text-2xl">Teremnézet és székleltás</h2>
                <p class="mt-1 text-ink-soft">A letiltás jövőbeli foglalás vagy eladott jegy esetén nem engedélyezett.</p>
              </div>
              @if (hallScreenings().length > 0) {
                <div class="w-full max-w-md">
                  <label for="map-screening" class="mb-1 block font-semibold">Előadás a teremnézethez</label>
                  <select id="map-screening" class="field" [value]="selectedScreeningId() ?? ''" (change)="changeScreening($event)">
                    @for (screening of hallScreenings(); track screening.id) {
                      <option [value]="screening.id">{{ screening.startsAt }}</option>
                    }
                  </select>
                </div>
              }
            </div>

            @if (mapError()) {
              <app-status-message class="mt-4 block" kind="error" [message]="mapError()" (retry)="loadMap()" />
            } @else if (mapLoading()) {
              <app-status-message class="mt-4 block" kind="loading" />
            } @else if (seatmap()) {
              <div class="mt-5">
                <app-seat-map
                  [seats]="seatmap()!.seats"
                  [prices]="seatmap()!.prices"
                  [sectors]="seatmap()!.sectors"
                  [readonly]="true"
                />
              </div>
            } @else {
              <p class="mt-4 text-ink-soft">Ehhez a teremhez még nincs előadás. A székek az alábbi listában kezelhetők.</p>
            }

            @if (hallSeats().length === 0) {
              <p class="mt-4 text-ink-soft">Ehhez a teremhez még nincsenek székek.</p>
            } @else {
              <div class="mt-6 overflow-x-auto">
                <table class="w-full min-w-xl border-collapse text-left">
                  <thead>
                    <tr class="border-b-2 border-line">
                      <th class="p-2">Szék</th>
                      <th class="p-2">Állapot</th>
                      <th class="p-2">Letiltás indoka</th>
                      <th class="p-2">Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (seat of hallSeats(); track seat.id) {
                      <tr class="border-b border-line">
                        <td class="p-2 font-semibold">{{ seat.label }}</td>
                        <td class="p-2">{{ seat.disabled ? 'Letiltva' : 'Engedélyezve' }}</td>
                        <td class="p-2">{{ seat.disabledReason || '–' }}</td>
                        <td class="p-2">
                          @if (seat.disabled) {
                            <button type="button" class="btn btn-outline" [disabled]="saving()" (click)="enableSeat(seat)">Feloldás</button>
                          } @else {
                            <button type="button" class="btn btn-outline" [disabled]="saving()" (click)="startDisable(seat)">Letiltás</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (seatToDisable()) {
              <form class="mt-5 max-w-xl space-y-3 border-t border-line pt-4" [formGroup]="disableForm" (ngSubmit)="disableSeat()">
                <h3 class="text-xl">Szék letiltása: {{ seatToDisable()!.label }}</h3>
                <label for="disable-reason" class="block font-semibold">Letiltás indoka</label>
                <input id="disable-reason" class="field" formControlName="reason" maxlength="500" required />
                @if (disableForm.controls.reason.touched && disableForm.controls.reason.invalid) {
                  <p class="text-sm text-brick">Az indok megadása kötelező, legfeljebb 500 karakterben.</p>
                }
                <div class="flex gap-2">
                  <button class="btn btn-primary" type="submit" [disabled]="saving()">Letiltás megerősítése</button>
                  <button class="btn btn-outline" type="button" (click)="seatToDisable.set(null)">Mégse</button>
                </div>
              </form>
            }
          </section>
        }
      }
    </div>
  `,
})
export class SeatingAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);

  protected readonly halls = signal<Hall[]>([]);
  protected readonly sectors = signal<Sector[]>([]);
  protected readonly seats = signal<AdminSeat[]>([]);
  protected readonly screenings = signal<Screening[]>([]);
  protected readonly selectedHallId = signal<number | null>(null);
  protected readonly selectedScreeningId = signal<number | null>(null);
  protected readonly seatmap = signal<Seatmap | null>(null);
  protected readonly seatToDisable = signal<AdminSeat | null>(null);
  protected readonly loading = signal(true);
  protected readonly mapLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly mapError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly editingSectorId = signal<number | null>(null);

  protected readonly sectorForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    rows: ['', Validators.required],
  });
  protected readonly generatorForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    rowCount: [3, [Validators.required, Validators.min(1), Validators.max(100)]],
    seatsPerRow: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
  });
  protected readonly disableForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  constructor() {
    this.load();
  }

  protected hallSectors(): Sector[] {
    return this.sectors().filter((sector) => sector.hallId === this.selectedHallId());
  }

  protected hallSeats(): AdminSeat[] {
    return this.seats().filter((seat) => seat.hallId === this.selectedHallId());
  }

  protected hallScreenings(): Screening[] {
    return this.screenings().filter((screening) => screening.hallId === this.selectedHallId());
  }

  protected rowPreview(): string {
    const count = this.generatorForm.controls.rowCount.value;
    return this.rowLabels(Number.isFinite(count) ? count : 0).join(', ') || '–';
  }

  protected previewSeatCount(): number {
    return Number(this.generatorForm.controls.rowCount.value || 0)
      * Number(this.generatorForm.controls.seatsPerRow.value || 0);
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      halls: this.admin.list<Hall>('halls'),
      sectors: this.admin.list<Sector>('sectors'),
      seats: this.admin.list<AdminSeat>('seats'),
      screenings: this.admin.list<Screening>('screenings'),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ halls, sectors, seats, screenings }) => {
        this.halls.set(halls);
        this.sectors.set(sectors);
        this.seats.set(seats);
        this.screenings.set(screenings);
        if (this.selectedHallId() === null && halls.length) this.selectHall(halls[0].id);
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected changeHall(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectHall(Number.isSafeInteger(id) && id > 0 ? id : null);
  }

  protected changeScreening(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedScreeningId.set(Number.isSafeInteger(id) && id > 0 ? id : null);
    this.loadMap();
  }

  protected loadMap(): void {
    const screeningId = this.selectedScreeningId();
    if (screeningId === null) {
      this.seatmap.set(null);
      return;
    }
    this.mapLoading.set(true);
    this.mapError.set('');
    this.admin.loadSeatmap(screeningId).pipe(finalize(() => this.mapLoading.set(false))).subscribe({
      next: (seatmap) => this.seatmap.set(seatmap),
      error: (error: unknown) => {
        this.seatmap.set(null);
        this.mapError.set(toProblem(error).message);
      },
    });
  }

  protected editSector(sector: Sector): void {
    this.editingSectorId.set(sector.id);
    this.sectorForm.setValue({ name: sector.name, rows: sector.rows.join(', ') });
    this.error.set('');
    this.notice.set('');
  }

  protected resetSectorForm(): void {
    this.editingSectorId.set(null);
    this.sectorForm.reset({ name: '', rows: '' });
  }

  protected saveSector(): void {
    this.error.set('');
    this.notice.set('');
    if (this.sectorForm.invalid || this.selectedHallId() === null) {
      this.sectorForm.markAllAsTouched();
      return;
    }
    const rows = this.sectorForm.controls.rows.value.split(',').map((row) => row.trim()).filter(Boolean);
    if (!rows.length || new Set(rows).size !== rows.length || rows.some((row) => row.length > 10)) {
      this.error.set('A sorok legyenek egyediek, 1–10 karakteresek, vesszővel elválasztva.');
      return;
    }
    const id = this.editingSectorId();
    const value = { hallId: this.selectedHallId()!, name: this.sectorForm.controls.name.value.trim(), rows };
    const request = id
      ? this.admin.update<Sector>('sectors', id, value)
      : this.admin.create<Sector>('sectors', value);
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (sector) => {
        this.sectors.update((items) => id ? items.map((item) => item.id === id ? sector : item) : [...items, sector]);
        this.resetSectorForm();
        this.notice.set(id ? 'A szektor adatai frissültek.' : 'A szektor létrejött.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected deleteSector(sector: Sector): void {
    if (!window.confirm(`Biztosan törlöd a(z) „${sector.name}” szektort?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.admin.delete('sectors', sector.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.sectors.update((items) => items.filter((item) => item.id !== sector.id));
        if (this.editingSectorId() === sector.id) this.resetSectorForm();
        this.notice.set('A szektor törölve.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected generate(): void {
    this.error.set('');
    this.notice.set('');
    if (this.generatorForm.invalid || this.selectedHallId() === null) {
      this.generatorForm.markAllAsTouched();
      return;
    }
    const rows = this.rowLabels(this.generatorForm.controls.rowCount.value);
    const seatsPerRow = this.generatorForm.controls.seatsPerRow.value;
    if (!rows.length || rows.length * seatsPerRow > 5000) {
      this.error.set('Legfeljebb 5000 szék generálható egy művelettel.');
      return;
    }
    this.saving.set(true);
    this.admin.generateSeats(this.selectedHallId()!, [{
      name: this.generatorForm.controls.name.value.trim(),
      rows,
      seatsPerRow,
    }]).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (result) => {
        this.sectors.update((items) => [...items, ...result.sectors]);
        this.seats.update((items) => [...items, ...result.seats]);
        this.notice.set(`${result.seats.length} szék létrejött.`);
        this.generatorForm.controls.name.reset('');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected startDisable(seat: AdminSeat): void {
    this.seatToDisable.set(seat);
    this.disableForm.reset({ reason: '' });
    this.error.set('');
  }

  protected disableSeat(): void {
    const seat = this.seatToDisable();
    if (!seat || this.disableForm.invalid) {
      this.disableForm.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.admin.disableSeat(seat.id, this.disableForm.controls.reason.value.trim())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.replaceSeat(updated);
          this.seatToDisable.set(null);
          this.notice.set('A szék letiltva.');
          this.loadMap();
        },
        error: (error: unknown) => this.error.set(toProblem(error).message),
      });
  }

  protected enableSeat(seat: AdminSeat): void {
    this.error.set('');
    this.saving.set(true);
    this.admin.enableSeat(seat.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (updated) => {
        this.replaceSeat(updated);
        this.notice.set('A szék újra használható.');
        this.loadMap();
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  private selectHall(id: number | null): void {
    this.selectedHallId.set(id);
    this.resetSectorForm();
    this.seatToDisable.set(null);
    const nextScreening = this.screenings().find((screening) => screening.hallId === id);
    this.selectedScreeningId.set(nextScreening?.id ?? null);
    this.loadMap();
  }

  private replaceSeat(updated: AdminSeat): void {
    this.seats.update((items) => items.map((seat) => seat.id === updated.id ? updated : seat));
  }

  private rowLabels(count: number): string[] {
    if (!Number.isInteger(count) || count < 1 || count > 100) return [];
    return Array.from({ length: count }, (_value, index) => {
      let value = index + 1;
      let label = '';
      while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + value % 26) + label;
        value = Math.floor(value / 26);
      }
      return label;
    });
  }
}
