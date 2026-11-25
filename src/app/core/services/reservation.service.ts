import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BookingRequest, Reservation } from '../../models/booking';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);

  /** Online foglalás. Ütközésnél 409 (SEAT_UNAVAILABLE, seatIds). */
  create(data: BookingRequest): Observable<Reservation> {
    return this.http.post<Reservation>(`${API_BASE_URL}/reservations`, data);
  }

  /** Visszaigazoló oldal adatai a foglalási kód alapján (személyes adat nélkül). */
  getByCode(code: string): Observable<Reservation> {
    return this.http.get<Reservation>(`${API_BASE_URL}/public/reservations/${encodeURIComponent(code)}`);
  }
}
