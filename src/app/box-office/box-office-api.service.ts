import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Movie } from '../models/movie';
import { BookingRequest, SeatLine } from '../models/booking';
import { Screening } from '../models/screening';
import { Hall, Venue } from '../models/venue';
import { Seatmap } from '../models/seatmap';
import { API_BASE_URL } from '../core/services/api-config';

export interface CashierReservation {
  id: number;
  code: string;
  status: 'active' | 'cancelled' | 'converted' | 'expired';
  channel: 'online' | 'cashier';
  customerName: string;
  customerContact: string;
  createdAt: string;
  screeningId: number;
  movieTitle: string;
  startsAt: string | null;
  venueName: string;
  hallName: string;
  seatIds?: number[];
  seatLabels?: string[];
}

export interface CashierReservationCreated extends CashierReservation {
  startsAt: string;
  venueAddress: string;
  seats: SeatLine[];
  total: number;
}

export interface CashierTicket {
  seatId: number;
  price: number;
  ticketCode: string;
}

export interface CashierSale {
  id: number;
  screeningId: number;
  channel: 'cashier';
  paymentMethod: 'cash' | 'card';
  reservationId: number | null;
  tickets: CashierTicket[];
  ticketCount: number;
  total: number;
  status: 'paid';
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class BoxOfficeApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = API_BASE_URL;

  venues(): Observable<Venue[]> {
    return this.http.get<Venue[]>(`${this.apiUrl}/venues`);
  }

  halls(): Observable<Hall[]> {
    return this.http.get<Hall[]>(`${this.apiUrl}/halls`);
  }

  movies(): Observable<Movie[]> {
    return this.http.get<Movie[]>(`${this.apiUrl}/movies`);
  }

  screenings(): Observable<Screening[]> {
    return this.http.get<Screening[]>(`${this.apiUrl}/screenings`);
  }

  seatmap(screeningId: number): Observable<Seatmap> {
    return this.http.get<Seatmap>(`${this.apiUrl}/screenings/${screeningId}/seatmap`);
  }

  createReservation(request: BookingRequest): Observable<CashierReservationCreated> {
    return this.http.post<CashierReservationCreated>(`${this.apiUrl}/box-office/reservations`, request);
  }

  createSale(request: Pick<BookingRequest, 'screeningId' | 'seatIds'> & {
    paymentMethod: 'cash' | 'card';
  }): Observable<CashierSale> {
    return this.http.post<CashierSale>(`${this.apiUrl}/box-office/sales`, request);
  }

  searchReservations(query: string): Observable<{ items: CashierReservation[]; count: number }> {
    const params = new HttpParams().set('query', query);
    return this.http.get<{ items: CashierReservation[]; count: number }>(
      `${this.apiUrl}/box-office/reservations`,
      { params },
    );
  }

  issueReservation(id: number, paymentMethod: 'cash' | 'card'): Observable<CashierSale> {
    return this.http.post<CashierSale>(`${this.apiUrl}/box-office/reservations/${id}/issue`, { paymentMethod });
  }

  cancelReservation(id: number): Observable<CashierReservation> {
    return this.http.post<CashierReservation>(`${this.apiUrl}/box-office/reservations/${id}/cancel`, {});
  }
}
