import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BookingRequest, CheckoutInfo, CheckoutStart, Order, PublicConfig } from '../../models/booking';
import { API_BASE_URL } from './api-config';

/** Bankkártyás fizetés. Kártyaadatot az alkalmazás nem kezel: a fizetési szolgáltató oldalán történik. */
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly http = inject(HttpClient);

  config(): Observable<PublicConfig> {
    return this.http.get<PublicConfig>(`${API_BASE_URL}/public/config`);
  }

  /** Helyek zárolása + fizetési munkamenet. A végösszeget a szerver számolja. */
  start(data: BookingRequest): Observable<CheckoutStart> {
    return this.http.post<CheckoutStart>(`${API_BASE_URL}/checkout`, data);
  }

  /** Fizetés előtti összegzés (a mock fizetési oldalhoz). */
  getCheckout(ref: string): Observable<CheckoutInfo> {
    return this.http.get<CheckoutInfo>(`${API_BASE_URL}/public/checkouts/${encodeURIComponent(ref)}`);
  }

  /** Megszakított fizetés: a zárolt helyek azonnal felszabadulnak. */
  cancel(ref: string): Observable<{ released: number }> {
    return this.http.post<{ released: number }>(`${API_BASE_URL}/payments/cancel`, { ref });
  }

  /** Sikeres fizetés után a jegyek (jegyazonosítók) lekérése. */
  getOrder(orderRef: string): Observable<Order> {
    return this.http.get<Order>(`${API_BASE_URL}/public/orders/${encodeURIComponent(orderRef)}`);
  }

  /** A szerver /payments/confirm végpontja – ide irányítja vissza a böngészőt a szolgáltató (mock: a mock oldal). */
  confirmUrl(ref: string, mockResult: 'success' | 'declined'): string {
    return `${API_BASE_URL}/payments/confirm?ref=${encodeURIComponent(ref)}&mock=${mockResult}`;
  }
}
