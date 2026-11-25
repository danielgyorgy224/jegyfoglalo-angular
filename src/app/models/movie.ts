export type MovieType = 'film' | 'event';

export interface Movie {
  id: number;
  title: string;
  type: MovieType;
  genre: string;
  durationMin: number;
  ageRating: string;
  description: string;
  /** URL vagy data URI; a plakát cseréjét az admin végzi. */
  posterUrl: string;
}
