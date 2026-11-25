import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { toProblem } from '../core/util/api-error';
import { AdminDataService } from '../core/services/admin-data.service';
import { Hall, Venue } from '../models/venue';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-venues-admin-page',
  imports: [ReactiveFormsModule, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Helyszínek és termek</h1>
      </header>

      @if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else if (loading()) {
        <app-status-message kind="loading" />
      } @else {
        @if (message()) {
          <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ message() }}</p>
        }
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <section class="grid gap-6 xl:grid-cols-2">
          <div class="card p-5">
            <h2 class="text-2xl">{{ editingVenueId() ? 'Helyszín szerkesztése' : 'Új helyszín' }}</h2>
            <form class="mt-4 space-y-3" [formGroup]="venueForm" (ngSubmit)="saveVenue()">
              <div>
                <label for="venue-name" class="mb-1 block font-semibold">Helyszín neve</label>
                <input id="venue-name" class="field" formControlName="name" required />
                @if (venueForm.controls.name.touched && venueForm.controls.name.invalid) {
                  <p class="mt-1 text-sm text-brick">Adj meg legfeljebb 100 karakteres nevet.</p>
                }
              </div>
              <div>
                <label for="venue-city" class="mb-1 block font-semibold">Település</label>
                <input id="venue-city" class="field" formControlName="city" required />
                @if (venueForm.controls.city.touched && venueForm.controls.city.invalid) {
                  <p class="mt-1 text-sm text-brick">A település megadása kötelező.</p>
                }
              </div>
              <div>
                <label for="venue-address" class="mb-1 block font-semibold">Cím</label>
                <input id="venue-address" class="field" formControlName="address" required />
                @if (venueForm.controls.address.touched && venueForm.controls.address.invalid) {
                  <p class="mt-1 text-sm text-brick">A cím megadása kötelező.</p>
                }
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" [disabled]="saving()">
                  {{ saving() ? 'Mentés…' : editingVenueId() ? 'Módosítás mentése' : 'Helyszín létrehozása' }}
                </button>
                @if (editingVenueId()) {
                  <button class="btn btn-outline" type="button" (click)="resetVenueForm()">Mégse</button>
                }
              </div>
            </form>

            <h3 class="mt-7 text-xl">Helyszínek</h3>
            @if (venues().length === 0) {
              <p class="mt-3 text-ink-soft">Még nincs rögzített helyszín.</p>
            } @else {
              <ul class="mt-3 divide-y divide-line">
                @for (venue of venues(); track venue.id) {
                  <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      class="text-left font-semibold underline decoration-transparent underline-offset-4 hover:decoration-current"
                      [attr.aria-pressed]="selectedVenueId() === venue.id"
                      (click)="selectVenue(venue)"
                    >
                      {{ venue.name }} <span class="font-normal text-ink-soft">· {{ venue.city }}</span>
                    </button>
                    <div class="flex gap-2">
                      <button type="button" class="btn btn-outline" (click)="editVenue(venue)">Szerkesztés</button>
                      <button type="button" class="btn btn-outline" (click)="deleteVenue(venue)">Törlés</button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>

          <div class="card p-5">
            <h2 class="text-2xl">{{ editingHallId() ? 'Terem szerkesztése' : 'Új terem' }}</h2>
            <form class="mt-4 space-y-3" [formGroup]="hallForm" (ngSubmit)="saveHall()">
              <div>
                <label for="hall-venue" class="mb-1 block font-semibold">Helyszín</label>
                <select id="hall-venue" class="field" formControlName="venueId" required>
                  <option [ngValue]="null">Válassz helyszínt</option>
                  @for (venue of venues(); track venue.id) {
                    <option [ngValue]="venue.id">{{ venue.name }}</option>
                  }
                </select>
                @if (hallForm.controls.venueId.touched && hallForm.controls.venueId.invalid) {
                  <p class="mt-1 text-sm text-brick">Válassz helyszínt.</p>
                }
              </div>
              <div>
                <label for="hall-name" class="mb-1 block font-semibold">Terem neve</label>
                <input id="hall-name" class="field" formControlName="name" required />
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" [disabled]="saving() || venues().length === 0">
                  {{ saving() ? 'Mentés…' : editingHallId() ? 'Módosítás mentése' : 'Terem létrehozása' }}
                </button>
                @if (editingHallId()) {
                  <button class="btn btn-outline" type="button" (click)="resetHallForm()">Mégse</button>
                }
              </div>
            </form>

            <h3 class="mt-7 text-xl">Termek</h3>
            @if (venues().length === 0) {
              <p class="mt-3 text-ink-soft">Terem létrehozása előtt rögzíts egy helyszínt.</p>
            } @else if (hallsForSelectedVenue().length === 0) {
              <p class="mt-3 text-ink-soft">Még nincs rögzített terem.</p>
            } @else {
              <ul class="mt-3 divide-y divide-line">
                @for (hall of hallsForSelectedVenue(); track hall.id) {
                  <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span class="font-semibold">{{ hall.name }}</span>
                      <span class="text-ink-soft"> · {{ venueName(hall.venueId) }}</span>
                    </span>
                    <div class="flex gap-2">
                      <button type="button" class="btn btn-outline" (click)="editHall(hall)">Szerkesztés</button>
                      <button type="button" class="btn btn-outline" (click)="deleteHall(hall)">Törlés</button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class VenuesAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);

  protected readonly venues = signal<Venue[]>([]);
  protected readonly halls = signal<Hall[]>([]);
  protected readonly selectedVenueId = signal<number | null>(null);
  protected readonly editingVenueId = signal<number | null>(null);
  protected readonly editingHallId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');

  protected readonly venueForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    city: ['', [Validators.required, Validators.maxLength(100)]],
    address: ['', [Validators.required, Validators.maxLength(200)]],
  });

  protected readonly hallForm = this.fb.group({
    venueId: this.fb.control<number | null>(null, Validators.required),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]),
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      venues: this.admin.list<Venue>('venues'),
      halls: this.admin.list<Hall>('halls'),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ venues, halls }) => {
        this.venues.set(venues);
        this.halls.set(halls);
        if (this.selectedVenueId() === null && venues.length) {
          this.selectVenue(venues[0]);
        } else if (this.selectedVenueId() !== null && !venues.some((venue) => venue.id === this.selectedVenueId())) {
          this.selectedVenueId.set(null);
        }
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected selectVenue(venue: Venue): void {
    this.selectedVenueId.set(venue.id);
    this.hallForm.controls.venueId.setValue(venue.id);
  }

  protected venueName(venueId: number): string {
    return this.venues().find((venue) => venue.id === venueId)?.name ?? 'Ismeretlen helyszín';
  }

  protected hallsForSelectedVenue(): Hall[] {
    const venueId = this.selectedVenueId();
    return venueId === null ? [] : this.halls().filter((hall) => hall.venueId === venueId);
  }

  protected editVenue(venue: Venue): void {
    this.editingVenueId.set(venue.id);
    this.venueForm.setValue({ name: venue.name, city: venue.city, address: venue.address });
    this.error.set('');
    this.message.set('');
  }

  protected resetVenueForm(): void {
    this.editingVenueId.set(null);
    this.venueForm.reset({ name: '', city: '', address: '' });
  }

  protected saveVenue(): void {
    this.error.set('');
    this.message.set('');
    if (this.venueForm.invalid) {
      this.venueForm.markAllAsTouched();
      return;
    }
    const id = this.editingVenueId();
    const request = id
      ? this.admin.update<Venue>('venues', id, this.venueForm.getRawValue())
      : this.admin.create<Venue>('venues', this.venueForm.getRawValue());
    this.save(request, id ? 'A helyszín adatai frissültek.' : 'A helyszín létrejött.', () => {
      this.resetVenueForm();
    });
  }

  protected deleteVenue(venue: Venue): void {
    if (!window.confirm(`Biztosan törlöd a(z) „${venue.name}” helyszínt?`)) return;
    this.error.set('');
    this.message.set('');
    this.saving.set(true);
    this.admin.delete('venues', venue.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.venues.update((items) => items.filter((item) => item.id !== venue.id));
        if (this.selectedVenueId() === venue.id) this.selectedVenueId.set(null);
        this.message.set('A helyszín törölve.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected editHall(hall: Hall): void {
    this.editingHallId.set(hall.id);
    this.hallForm.setValue({ venueId: hall.venueId, name: hall.name });
    this.selectedVenueId.set(hall.venueId);
    this.error.set('');
    this.message.set('');
  }

  protected resetHallForm(): void {
    this.editingHallId.set(null);
    this.hallForm.reset({ venueId: this.selectedVenueId(), name: '' });
  }

  protected saveHall(): void {
    this.error.set('');
    this.message.set('');
    if (this.hallForm.invalid) {
      this.hallForm.markAllAsTouched();
      return;
    }
    const id = this.editingHallId();
    const value = this.hallForm.getRawValue();
    const request = id
      ? this.admin.update<Hall>('halls', id, { ...value, venueId: Number(value.venueId) })
      : this.admin.create<Hall>('halls', { ...value, venueId: Number(value.venueId) });
    this.save(request, id ? 'A terem adatai frissültek.' : 'A terem létrejött.', () => this.resetHallForm());
  }

  protected deleteHall(hall: Hall): void {
    if (!window.confirm(`Biztosan törlöd a(z) „${hall.name}” termet?`)) return;
    this.error.set('');
    this.message.set('');
    this.saving.set(true);
    this.admin.delete('halls', hall.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.halls.update((items) => items.filter((item) => item.id !== hall.id));
        if (this.editingHallId() === hall.id) this.resetHallForm();
        this.message.set('A terem törölve.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  private save<T>(request: import('rxjs').Observable<T>, successMessage: string, afterSave: () => void): void {
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        afterSave();
        this.message.set(successMessage);
        this.load();
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }
}
