import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';

export type AdminReportKind = 'reservations' | 'sales';
export type ReportChannel = 'online' | 'cashier';

export interface AdminReportFilters {
  from: string;
  to: string;
  venueId: string;
  screeningId: string;
  channel: '' | ReportChannel;
}

export interface AdminReportItem {
  id: number;
  code?: string;
  status: string;
  channel: ReportChannel;
  createdAt: string;
  screeningId: number;
  movieTitle: string;
  venueName: string;
  hallName: string;
  startsAt: string | null;
  seatLabels: string[];
  customerName?: string;
  customerContact?: string;
  ticketCount?: number;
  paymentMethod?: 'cash' | 'card' | 'stripe';
  total?: number;
}

export interface AdminReportResponse {
  items: AdminReportItem[];
  count: number;
  totalRevenue: number;
}

@Injectable({ providedIn: 'root' })
export class AdminReportsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = API_BASE_URL;

  get(kind: AdminReportKind, filters: AdminReportFilters): Observable<AdminReportResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<AdminReportResponse>(`${this.apiUrl}/${kind}`, { params });
  }
}
