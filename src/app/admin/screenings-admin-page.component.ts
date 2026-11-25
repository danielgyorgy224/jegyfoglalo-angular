import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AdminDataService } from '../core/services/admin-data.service';
import { toProblem } from '../core/util/api-error';
import { Movie } from '../models/movie';
import { Screening } from '../models/screening';
import { Hall } from '../models/venue';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-screenings-admin-page',
  imports: [DatePipe, ReactiveFormsModule, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Előadások</h1>
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

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
          <div class="card p-5">
            <h2 class="text-2xl">Műsor</h2>
            @if (screenings().length === 0) {
              <p class="mt-4 text-ink-soft">Még nincs előadás rögzítve.</p>
            } @else {
              <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-2xl border-collapse text-left">
                  <thead>
                    <tr class="border-b-2 border-line">
                      <th class="p-2">Film / esemény</th>
                      <th class="p-2">Terem</th>
                      <th class="p-2">Időpont</th>
                      <th class="p-2">Állapot</th>
                      <th class="p-2">Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (screening of screenings(); track screening.id) {
                      <tr class="border-b border-line">
                        <td class="p-2 font-semibold">{{ movieName(screening.movieId) }}</td>
                        <td class="p-2">{{ hallName(screening.hallId) }}</td>
                        <td class="p-2">{{ screening.startsAt | date:'yyyy. MM. dd. HH:mm' }}</td>
                        <td class="p-2">{{ statusLabel(screening.status) }}</td>
                        <td class="p-2">
                          <div class="flex gap-2">
                            <button type="button" class="btn btn-outline" (click)="editScreening(screening)">Szerkesztés</button>
                            <button type="button" class="btn btn-outline" (click)="deleteScreening(screening)">Törlés</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div class="card p-5">
            <h2 class="text-2xl">{{ editingScreeningId() ? 'Előadás szerkesztése' : 'Új előadás' }}</h2>
            <form class="mt-4 space-y-3" [formGroup]="screeningForm" (ngSubmit)="saveScreening()">
              <div>
                <label for="screening-movie" class="mb-1 block font-semibold">Film vagy esemény</label>
                <select id="screening-movie" class="field" formControlName="movieId" required>
                  <option [ngValue]="null">Válassz címet</option>
                  @for (movie of movies(); track movie.id) {
                    <option [ngValue]="movie.id">{{ movie.title }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="screening-hall" class="mb-1 block font-semibold">Terem</label>
                <select id="screening-hall" class="field" formControlName="hallId" required>
                  <option [ngValue]="null">Válassz termet</option>
                  @for (hall of halls(); track hall.id) {
                    <option [ngValue]="hall.id">{{ hall.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="screening-start" class="mb-1 block font-semibold">Kezdés időpontja</label>
                <input id="screening-start" class="field" type="datetime-local" formControlName="startsAt" required />
              </div>
              <div>
                <label for="screening-price" class="mb-1 block font-semibold">Alapár (Ft)</label>
                <input id="screening-price" class="field" type="number" min="0" step="1" formControlName="basePrice" required />
              </div>
              <div>
                <label for="screening-status" class="mb-1 block font-semibold">Állapot</label>
                <select id="screening-status" class="field" formControlName="status">
                  <option value="active">Műsoron</option>
                  <option value="cancelled">Lemondva</option>
                </select>
              </div>

              @if (timeConflicts().length > 0) {
                <div class="rounded border-2 border-brass bg-brass-soft p-3" role="status">
                  <p class="font-semibold">Figyelem: időpont-ütközés ebben a teremben.</p>
                  <ul class="mt-1 list-inside list-disc">
                    @for (conflict of timeConflicts(); track conflict.id) {
                      <li>{{ movieName(conflict.movieId) }} – {{ conflict.startsAt | date:'yyyy. MM. dd. HH:mm' }}</li>
                    }
                  </ul>
                </div>
              }

              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" [disabled]="saving() || movies().length === 0 || halls().length === 0">
                  {{ saving() ? 'Mentés…' : editingScreeningId() ? 'Módosítás mentése' : 'Előadás létrehozása' }}
                </button>
                @if (editingScreeningId()) {
                  <button class="btn btn-outline" type="button" (click)="resetForm()">Mégse</button>
                }
              </div>
            </form>
          </div>
        </section>
      }
    </div>
  `,
})
export class ScreeningsAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);

  protected readonly movies = signal<Movie[]>([]);
  protected readonly halls = signal<Hall[]>([]);
  protected readonly screenings = signal<Screening[]>([]);
  protected readonly editingScreeningId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly screeningForm = this.fb.group({
    movieId: this.fb.control<number | null>(null, Validators.required),
    hallId: this.fb.control<number | null>(null, Validators.required),
    startsAt: this.fb.nonNullable.control('', Validators.required),
    basePrice: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0)]),
    status: this.fb.nonNullable.control('active', Validators.required),
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      movies: this.admin.list<Movie>('movies'),
      halls: this.admin.list<Hall>('halls'),
      screenings: this.admin.list<Screening>('screenings'),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ movies, halls, screenings }) => {
        this.movies.set(movies);
        this.halls.set(halls);
        this.screenings.set(screenings);
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected movieName(movieId: number): string {
    return this.movies().find((movie) => movie.id === movieId)?.title ?? 'Ismeretlen cím';
  }

  protected hallName(hallId: number): string {
    return this.halls().find((hall) => hall.id === hallId)?.name ?? 'Ismeretlen terem';
  }

  protected statusLabel(status: string): string {
    return status === 'active' ? 'Műsoron' : status === 'cancelled' ? 'Lemondva' : status;
  }

  protected timeConflicts(): Screening[] {
    const value = this.screeningForm.getRawValue();
    const movieId = value.movieId;
    const hallId = value.hallId;
    const start = new Date(value.startsAt).getTime();
    const duration = this.movies().find((movie) => movie.id === movieId)?.durationMin ?? 120;
    if (hallId === null || !Number.isFinite(start)) return [];
    const end = start + duration * 60_000;
    return this.screenings().filter((screening) => {
      if (screening.hallId !== hallId || screening.id === this.editingScreeningId() || screening.status !== 'active') return false;
      const existingStart = new Date(screening.startsAt).getTime();
      if (!Number.isFinite(existingStart)) return false;
      const existingDuration = this.movies().find((movie) => movie.id === screening.movieId)?.durationMin ?? 120;
      return start < existingStart + existingDuration * 60_000 && end > existingStart;
    });
  }

  protected editScreening(screening: Screening): void {
    this.editingScreeningId.set(screening.id);
    this.screeningForm.setValue({
      movieId: screening.movieId,
      hallId: screening.hallId,
      startsAt: this.toLocalDateTime(screening.startsAt),
      basePrice: screening.basePrice,
      status: screening.status,
    });
    this.error.set('');
    this.notice.set('');
  }

  protected resetForm(): void {
    this.editingScreeningId.set(null);
    this.screeningForm.reset({
      movieId: null,
      hallId: null,
      startsAt: '',
      basePrice: 0,
      status: 'active',
    });
  }

  protected saveScreening(): void {
    this.error.set('');
    this.notice.set('');
    if (this.screeningForm.invalid || !Number.isSafeInteger(this.screeningForm.controls.basePrice.value)) {
      this.screeningForm.markAllAsTouched();
      this.error.set('Ellenőrizd a kötelező mezőket és azt, hogy az alapár nem negatív egész szám.');
      return;
    }
    const value = this.screeningForm.getRawValue();
    const startsAt = new Date(value.startsAt);
    if (!Number.isFinite(startsAt.getTime())) {
      this.error.set('Adj meg érvényes kezdési időpontot.');
      return;
    }
    const payload = {
      movieId: value.movieId!,
      hallId: value.hallId!,
      startsAt: startsAt.toISOString(),
      basePrice: value.basePrice,
      status: value.status,
    };
    const id = this.editingScreeningId();
    const request = id
      ? this.admin.update<Screening>('screenings', id, payload)
      : this.admin.create<Screening>('screenings', payload);
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (screening) => {
        this.screenings.update((items) => id
          ? items.map((item) => item.id === id ? screening : item)
          : [...items, screening]);
        this.resetForm();
        this.notice.set(id ? 'Az előadás adatai frissültek.' : 'Az előadás létrejött.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected deleteScreening(screening: Screening): void {
    if (!window.confirm(`Biztosan törlöd a(z) „${this.movieName(screening.movieId)}” előadást?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.admin.delete('screenings', screening.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.screenings.update((items) => items.filter((item) => item.id !== screening.id));
        if (this.editingScreeningId() === screening.id) this.resetForm();
        this.notice.set('Az előadás törölve.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  private toLocalDateTime(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }
}
