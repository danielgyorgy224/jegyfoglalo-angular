import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { Movie } from '../../models/movie';
import { ProgramEntry, ProgramScreening, Screening } from '../../models/screening';
import { Hall, Venue } from '../../models/venue';
import { MovieService } from './movie.service';
import { ScreeningService } from './screening.service';
import { VenueService } from './venue.service';

/**
 * Nyilvános műsor: filmek / előadások, mindegyikhez a jövőbeli időpontok teremmel és helyszínnel.
 * Nem végez saját HTTP-hívást, a többi service eredményét rakja össze.
 */
@Injectable({ providedIn: 'root' })
export class ProgramService {
  private readonly movies = inject(MovieService);
  private readonly screenings = inject(ScreeningService);
  private readonly venues = inject(VenueService);

  /** Az egész műsor (csak a még el nem kezdődött előadásokkal rendelkező filmek). */
  loadProgram(now = new Date()): Observable<ProgramEntry[]> {
    return forkJoin({
      movies: this.movies.list(),
      screenings: this.screenings.listActive(),
      halls: this.venues.listHalls(),
      venues: this.venues.listVenues(),
    }).pipe(
      map(({ movies, screenings, halls, venues }) =>
        movies
          .map((movie) => ({
            movie,
            screenings: this.join(
              screenings.filter((s) => s.movieId === movie.id),
              halls,
              venues,
              now,
            ),
          }))
          .filter((entry) => entry.screenings.length > 0),
      ),
    );
  }

  /** Egy film / előadás az összes (jövőbeli) időpontjával. */
  loadMovie(movieId: number, now = new Date()): Observable<ProgramEntry> {
    return forkJoin({
      movie: this.movies.getById(movieId),
      screenings: this.screenings.listActive(movieId),
      halls: this.venues.listHalls(),
      venues: this.venues.listVenues(),
    }).pipe(
      map(({ movie, screenings, halls, venues }) => ({
        movie: movie as Movie,
        screenings: this.join(screenings, halls, venues, now),
      })),
    );
  }

  private join(screenings: Screening[], halls: Hall[], venues: Venue[], now: Date): ProgramScreening[] {
    const result: ProgramScreening[] = [];
    for (const s of screenings) {
      if (new Date(s.startsAt) <= now) continue;
      const hall = halls.find((h) => h.id === s.hallId);
      const venue = hall && venues.find((v) => v.id === hall.venueId);
      if (hall && venue) result.push({ ...s, hall, venue });
    }
    return result;
  }
}
