import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Movie } from '../../models/movie';
import { API_BASE_URL } from './api-config';

@Injectable({ providedIn: 'root' })
export class MovieService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/movies`;

  list(params = new HttpParams()): Observable<Movie[]> {
    return this.http.get<Movie[]>(this.url, { params });
  }

  getById(id: number): Observable<Movie> {
    return this.http.get<Movie>(`${this.url}/${id}`);
  }
}
