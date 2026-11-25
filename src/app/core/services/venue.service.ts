import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Hall, Venue } from '../../models/venue';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly http = inject(HttpClient);

  listVenues(): Observable<Venue[]> {
    return this.http.get<Venue[]>(`${API_BASE_URL}/venues`);
  }

  listHalls(): Observable<Hall[]> {
    return this.http.get<Hall[]>(`${API_BASE_URL}/halls`);
  }
}
