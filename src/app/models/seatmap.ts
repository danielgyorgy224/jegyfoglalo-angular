import { Hall, Venue } from './venue';
import { Movie } from './movie';
import { Screening } from './screening';

/** A szék állapota. Szín mellett felirat / jelölés is jelzi (lásd seat-status.ts). */
export type SeatStatus = 'free' | 'reserved' | 'sold' | 'disabled' | 'locked';

export interface Sector {
  id: number;
  hallId: number;
  name: string;
  /** a sorok sorrendben, pl. ["A","B","C"] */
  rows: string[];
}

export interface SeatmapSeat {
  id: number;
  sectorId: number;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
}

/** seatId → érvényes ár (székár → szektorár → alapár; a szerver számolja). */
export type PriceMap = Record<number, number>;

/** GET /screenings/:id/seatmap */
export interface Seatmap {
  screening: Screening;
  movie: Movie;
  hall: Hall;
  venue: Venue;
  bookable: boolean;
  bookableReason: string | null;
  maxSeats: number;
  sectors: Sector[];
  seats: SeatmapSeat[];
  prices: PriceMap;
  generatedAt: string;
}
