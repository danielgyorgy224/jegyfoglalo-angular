import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Screening } from '../../models/screening';
import { Seatmap, SeatmapSeat, Sector } from '../../models/seatmap';
import { API_BASE_URL } from './api-config';

export type AdminCollection =
  | 'venues'
  | 'halls'
  | 'sectors'
  | 'seats'
  | 'movies'
  | 'screenings'
  | 'users'
  | 'priceOverrides';

export interface AdminSeat extends SeatmapSeat {
  hallId: number;
  disabled: boolean;
  disabledReason?: string | null;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'cashier';
  active: boolean;
  createdAt: string;
}

export interface PriceOverride {
  id: number;
  screeningId: number;
  scope: 'sector' | 'seat';
  targetId: number;
  price: number;
}

export interface GeneratedSector {
  name: string;
  rows: string[];
  seatsPerRow: number;
}

export interface PriceUpdate {
  basePrice: number;
  sectors: Record<number, number | null>;
  seats: Record<number, number | null>;
}

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = API_BASE_URL;

  list<T>(collection: AdminCollection): Observable<T[]> {
    return this.http.get<T[]>(`${this.apiUrl}/${collection}`);
  }

  create<T>(collection: AdminCollection, value: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${collection}`, value);
  }

  update<T>(collection: AdminCollection, id: number, value: object): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/${collection}/${id}`, value);
  }

  delete(collection: AdminCollection, id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${collection}/${id}`);
  }

  loadSeatmap(screeningId: number): Observable<Seatmap> {
    return this.http.get<Seatmap>(`${this.apiUrl}/screenings/${screeningId}/seatmap`);
  }

  generateSeats(hallId: number, sectors: GeneratedSector[]): Observable<{ sectors: Sector[]; seats: AdminSeat[] }> {
    return this.http.post<{ sectors: Sector[]; seats: AdminSeat[] }>(
      `${this.apiUrl}/admin/halls/${hallId}/seats/generate`,
      { sectors },
    );
  }

  disableSeat(seatId: number, disabledReason: string): Observable<AdminSeat> {
    return this.http.patch<AdminSeat>(`${this.apiUrl}/seats/${seatId}/disable`, { disabledReason });
  }

  enableSeat(seatId: number): Observable<AdminSeat> {
    return this.http.patch<AdminSeat>(`${this.apiUrl}/seats/${seatId}/enable`, {});
  }

  uploadPoster(movieId: number, dataUrl: string): Observable<{ id: number; posterUrl: string }> {
    return this.http.put<{ id: number; posterUrl: string }>(
      `${this.apiUrl}/movies/${movieId}/poster`,
      { dataUrl },
    );
  }

  updatePrices(screeningId: number, prices: PriceUpdate): Observable<{
    screening: Screening;
    priceOverrides: PriceOverride[];
  }> {
    return this.http.put<{ screening: Screening; priceOverrides: PriceOverride[] }>(
      `${this.apiUrl}/screenings/${screeningId}/prices`,
      prices,
    );
  }
}
