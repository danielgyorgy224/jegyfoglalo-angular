import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Screening } from '../../models/screening';
import { Seatmap } from '../../models/seatmap';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class ScreeningService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/screenings`;

  list(params = new HttpParams()): Observable<Screening[]> {
    return this.http.get<Screening[]>(this.url, { params });
  }

  getById(id: number): Observable<Screening> {
    return this.http.get<Screening>(`${this.url}/${id}`);
  }

  /** A nyilvános műsorban szereplő (aktív) előadások, időrendben. */
  listActive(movieId?: number | null): Observable<Screening[]> {
    let params = new HttpParams().set('status', 'active').set('_sort', 'startsAt').set('_order', 'asc');
    if (movieId) params = params.set('movieId', String(movieId));
    return this.list(params);
  }

  /** Székek állapota és érvényes árai az előadáshoz. */
  seatmap(screeningId: number): Observable<Seatmap> {
    return this.http.get<Seatmap>(`${this.url}/${screeningId}/seatmap`);
  }
}
