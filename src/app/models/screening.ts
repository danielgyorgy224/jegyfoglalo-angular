import { Hall, Venue } from './venue';
import { Movie } from './movie';

export interface Screening {
  id: number;
  movieId: number;
  hallId: number;
  /** ISO 8601, időzónával */
  startsAt: string;
  basePrice: number;
  status: string;
}

/** Műsorlistához összeállított nézetmodell: előadás + terem + helyszín. */
export interface ProgramScreening extends Screening {
  hall: Hall;
  venue: Venue;
}

export interface ProgramEntry {
  movie: Movie;
  screenings: ProgramScreening[];
}
