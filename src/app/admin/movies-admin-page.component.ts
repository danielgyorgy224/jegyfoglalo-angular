import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AdminDataService } from '../core/services/admin-data.service';
import { toProblem } from '../core/util/api-error';
import { Movie, MovieType } from '../models/movie';
import { StatusMessageComponent } from '../shared/status-message.component';

const MAX_POSTER_BYTES = 1024 * 1024;
const POSTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-movies-admin-page',
  imports: [ReactiveFormsModule, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Filmek és események</h1>
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

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div class="card p-5">
            <h2 class="text-2xl">{{ editingMovieId() ? 'Film vagy esemény szerkesztése' : 'Új film vagy esemény' }}</h2>
            <form class="mt-4 space-y-3" [formGroup]="movieForm" (ngSubmit)="saveMovie()">
              <div>
                <label for="movie-title" class="mb-1 block font-semibold">Cím</label>
                <input id="movie-title" class="field" formControlName="title" required maxlength="160" />
                @if (movieForm.controls.title.touched && movieForm.controls.title.invalid) {
                  <p class="mt-1 text-sm text-brick">A cím megadása kötelező.</p>
                }
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label for="movie-type" class="mb-1 block font-semibold">Típus</label>
                  <select id="movie-type" class="field" formControlName="type">
                    <option value="film">Film</option>
                    <option value="event">Esemény</option>
                  </select>
                </div>
                <div>
                  <label for="movie-genre" class="mb-1 block font-semibold">Műfaj</label>
                  <input id="movie-genre" class="field" formControlName="genre" required />
                </div>
                <div>
                  <label for="movie-duration" class="mb-1 block font-semibold">Időtartam (perc)</label>
                  <input id="movie-duration" class="field" type="number" min="1" formControlName="durationMin" required />
                </div>
                <div>
                  <label for="movie-age" class="mb-1 block font-semibold">Korhatár</label>
                  <input id="movie-age" class="field" formControlName="ageRating" required placeholder="pl. 12+" />
                </div>
              </div>
              <div>
                <label for="movie-description" class="mb-1 block font-semibold">Leírás</label>
                <textarea id="movie-description" class="field min-h-28" formControlName="description" required></textarea>
              </div>
              <div>
                <label for="movie-poster" class="mb-1 block font-semibold">Plakát (PNG, JPEG vagy WebP; legfeljebb 1 MB)</label>
                <input
                  id="movie-poster"
                  #posterInput
                  class="field"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  (change)="choosePoster($event)"
                />
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" [disabled]="saving()">
                  {{ saving() ? 'Mentés…' : editingMovieId() ? 'Módosítás mentése' : 'Létrehozás' }}
                </button>
                @if (editingMovieId()) {
                  <button class="btn btn-outline" type="button" (click)="resetForm()">Mégse</button>
                }
                @if (pendingPoster()) {
                  <button class="btn btn-outline" type="button" (click)="clearPoster()">Plakát elvetése</button>
                }
              </div>
            </form>

            @if (posterPreview()) {
              <div class="mt-5 max-w-xs">
                <p class="mb-2 font-semibold">Plakát előnézete</p>
                <img class="max-h-72 w-full border border-line object-contain" [src]="posterPreview()" alt="A kiválasztott plakát előnézete" />
              </div>
            }
          </div>

          <div class="card p-5">
            <h2 class="text-2xl">Rögzített címek</h2>
            @if (movies().length === 0) {
              <p class="mt-4 text-ink-soft">Még nincs film vagy esemény.</p>
            } @else {
              <ul class="mt-4 divide-y divide-line">
                @for (movie of movies(); track movie.id) {
                  <li class="flex gap-4 py-4">
                    @if (movie.posterUrl) {
                      <img class="h-24 w-16 shrink-0 border border-line object-cover" [src]="movie.posterUrl" [alt]="movie.title + ' plakátja'" />
                    }
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold">{{ movie.title }}</p>
                      <p class="text-sm text-ink-soft">{{ movie.type === 'film' ? 'Film' : 'Esemény' }} · {{ movie.genre }} · {{ movie.durationMin }} perc</p>
                      <div class="mt-2 flex flex-wrap gap-2">
                        <button type="button" class="btn btn-outline" (click)="editMovie(movie)">Szerkesztés</button>
                        <button type="button" class="btn btn-outline" (click)="deleteMovie(movie)">Törlés</button>
                      </div>
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
export class MoviesAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);
  @ViewChild('posterInput') private posterInput?: ElementRef<HTMLInputElement>;

  protected readonly movies = signal<Movie[]>([]);
  protected readonly editingMovieId = signal<number | null>(null);
  protected readonly pendingPoster = signal<string | null>(null);
  protected readonly posterPreview = computed(() => {
    const pending = this.pendingPoster();
    if (pending) return pending;
    const movieId = this.editingMovieId();
    return movieId === null ? null : this.movies().find((movie) => movie.id === movieId)?.posterUrl || null;
  });
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly movieForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    type: ['film' as MovieType, Validators.required],
    genre: ['', [Validators.required, Validators.maxLength(100)]],
    durationMin: [90, [Validators.required, Validators.min(1), Validators.max(1000)]],
    ageRating: ['', [Validators.required, Validators.maxLength(20)]],
    description: ['', [Validators.required, Validators.maxLength(5000)]],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.admin.list<Movie>('movies').pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (movies) => this.movies.set(movies),
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected editMovie(movie: Movie): void {
    this.editingMovieId.set(movie.id);
    this.pendingPoster.set(null);
    this.movieForm.setValue({
      title: movie.title,
      type: movie.type,
      genre: movie.genre,
      durationMin: movie.durationMin,
      ageRating: movie.ageRating,
      description: movie.description,
    });
    this.error.set('');
    this.notice.set('');
  }

  protected resetForm(): void {
    this.editingMovieId.set(null);
    this.pendingPoster.set(null);
    if (this.posterInput) this.posterInput.nativeElement.value = '';
    this.movieForm.reset({
      title: '',
      type: 'film',
      genre: '',
      durationMin: 90,
      ageRating: '',
      description: '',
    });
  }

  protected choosePoster(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.notice.set('');
    if (!file) return;
    this.pendingPoster.set(null);
    if (!POSTER_TYPES.includes(file.type)) {
      this.error.set('Csak PNG, JPEG vagy WebP formátumú plakát választható.');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > MAX_POSTER_BYTES) {
      this.error.set('A plakát mérete legyen nagyobb 0 bájtnál és legfeljebb 1 MB.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith(`data:${file.type};base64,`)) {
        this.error.set('A kiválasztott plakát nem olvasható be.');
        return;
      }
      this.pendingPoster.set(reader.result);
    };
    reader.onerror = () => this.error.set('A plakát beolvasása nem sikerült.');
    reader.readAsDataURL(file);
  }

  protected clearPoster(): void {
    this.pendingPoster.set(null);
    if (this.posterInput) this.posterInput.nativeElement.value = '';
  }

  protected saveMovie(): void {
    this.error.set('');
    this.notice.set('');
    if (this.movieForm.invalid) {
      this.movieForm.markAllAsTouched();
      return;
    }
    const id = this.editingMovieId();
    const request = id
      ? this.admin.update<Movie>('movies', id, this.movieForm.getRawValue())
      : this.admin.create<Movie>('movies', { ...this.movieForm.getRawValue(), posterUrl: '' });
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (movie) => {
        this.movies.update((items) => id
          ? items.map((item) => item.id === movie.id ? movie : item)
          : [...items, movie]);
        const poster = this.pendingPoster();
        if (poster) {
          this.uploadPoster(movie.id, poster);
        } else {
          this.finishSave(id ? 'A cím adatai frissültek.' : 'A cím létrejött.');
        }
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected deleteMovie(movie: Movie): void {
    if (!window.confirm(`Biztosan törlöd a(z) „${movie.title}” címet?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.admin.delete('movies', movie.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.movies.update((items) => items.filter((item) => item.id !== movie.id));
        if (this.editingMovieId() === movie.id) this.resetForm();
        this.notice.set('A film vagy esemény törölve.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  private uploadPoster(movieId: number, dataUrl: string): void {
    this.saving.set(true);
    this.admin.uploadPoster(movieId, dataUrl).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ posterUrl }) => {
        this.movies.update((items) => items.map((movie) => movie.id === movieId ? { ...movie, posterUrl } : movie));
        this.finishSave('A film adatai és plakátja elmentve.');
      },
      error: (error: unknown) => {
        this.editingMovieId.set(movieId);
        this.error.set(`A cím adatai elmentődtek, de a plakát feltöltése nem sikerült: ${toProblem(error).message}`);
      },
    });
  }

  private finishSave(successMessage: string): void {
    this.resetForm();
    this.notice.set(successMessage);
  }
}
