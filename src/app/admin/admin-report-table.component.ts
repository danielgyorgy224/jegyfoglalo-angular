import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AdminDataService } from '../core/services/admin-data.service';
import {
  AdminReportFilters,
  AdminReportItem,
  AdminReportKind,
  AdminReportResponse,
  AdminReportsService,
} from '../core/services/admin-reports.service';
import { toProblem } from '../core/util/api-error';
import { Movie } from '../models/movie';
import { Screening } from '../models/screening';
import { Venue } from '../models/venue';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-admin-report-table',
  imports: [DatePipe, ReactiveFormsModule, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció · Riportok</p>
        <h1 class="mt-2 text-3xl">{{ kind() === 'sales' ? 'Jegyeladások' : 'Foglalások' }}</h1>
      </header>

      @if (loading()) {
        <app-status-message kind="loading" />
      } @else if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else {
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <section class="card p-5">
          <h2 class="text-2xl">Szűrés</h2>
          <form class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" [formGroup]="filterForm" (ngSubmit)="applyFilters()">
            <div>
              <label for="report-from" class="mb-1 block font-semibold">Kezdő dátum</label>
              <input id="report-from" class="field" type="date" formControlName="from" />
            </div>
            <div>
              <label for="report-to" class="mb-1 block font-semibold">Záró dátum</label>
              <input id="report-to" class="field" type="date" formControlName="to" />
            </div>
            <div>
              <label for="report-venue" class="mb-1 block font-semibold">Helyszín</label>
              <select id="report-venue" class="field" formControlName="venueId">
                <option value="">Minden helyszín</option>
                @for (venue of venues(); track venue.id) {
                  <option [value]="venue.id">{{ venue.name }}</option>
                }
              </select>
            </div>
            <div>
              <label for="report-screening" class="mb-1 block font-semibold">Előadás</label>
              <select id="report-screening" class="field" formControlName="screeningId">
                <option value="">Minden előadás</option>
                @for (screening of screenings(); track screening.id) {
                  <option [value]="screening.id">{{ movieName(screening.movieId) }} · {{ screening.startsAt | date:'yyyy. MM. dd. HH:mm' }}</option>
                }
              </select>
            </div>
            <div>
              <label for="report-channel" class="mb-1 block font-semibold">Csatorna</label>
              <select id="report-channel" class="field" formControlName="channel">
                <option value="">Minden csatorna</option>
                <option value="online">Online</option>
                <option value="cashier">Pénztár</option>
              </select>
            </div>
            <div class="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
              <button type="submit" class="btn btn-primary" [disabled]="reportLoading()">Szűrés</button>
              <button type="button" class="btn btn-outline" [disabled]="reportLoading()" (click)="clearFilters()">Szűrők törlése</button>
            </div>
          </form>
        </section>

        @if (reportLoading()) {
          <app-status-message kind="loading" />
        } @else if (report()) {
          <section class="card p-5" aria-label="Riport összesítése">
            <h2 class="text-xl">Összesítés</h2>
            <div class="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              <p><span class="font-semibold">{{ kind() === 'sales' ? 'Jegyek száma' : 'Foglalások száma' }}:</span> {{ report()!.count }}</p>
              <p><span class="font-semibold">Összbevétel:</span> {{ report()!.totalRevenue }} Ft</p>
            </div>
          </section>

          @if (report()!.items.length === 0) {
            <p class="card p-5 text-ink-soft">A megadott szűrőkkel nincs megjeleníthető rekord.</p>
          } @else {
            <section class="card p-5">
              <h2 class="text-2xl">{{ kind() === 'sales' ? 'Jegyeladások' : 'Foglalások' }}</h2>
              <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-5xl border-collapse text-left">
                  <thead>
                    <tr class="border-b-2 border-line">
                      @if (kind() === 'reservations') {
                        <th class="p-2">Foglalás / vásárló</th>
                      } @else {
                        <th class="p-2">Eladás</th>
                      }
                      <th class="p-2">Létrehozva</th>
                      <th class="p-2">Film / esemény</th>
                      <th class="p-2">Helyszín / terem</th>
                      <th class="p-2">Előadás időpontja</th>
                      <th class="p-2">Székek</th>
                      <th class="p-2">Csatorna / állapot</th>
                      @if (kind() === 'sales') {
                        <th class="p-2 text-right">Jegyek / összeg</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of report()!.items; track item.id) {
                      <tr class="border-b border-line align-top">
                        <td class="p-2">
                          @if (kind() === 'reservations') {
                            <strong>{{ item.code }}</strong>
                            <span class="block">{{ item.customerName }}</span>
                            <span class="block text-sm text-ink-soft">{{ item.customerContact }}</span>
                          } @else {
                            <strong>#{{ item.id }}</strong>
                            <span class="block">{{ paymentLabel(item) }}</span>
                          }
                        </td>
                        <td class="p-2">{{ item.createdAt | date:'yyyy. MM. dd. HH:mm' }}</td>
                        <td class="p-2">{{ item.movieTitle }}</td>
                        <td class="p-2">{{ item.venueName }}<span class="block">{{ item.hallName }}</span></td>
                        <td class="p-2">{{ item.startsAt | date:'yyyy. MM. dd. HH:mm' }}</td>
                        <td class="p-2">{{ item.seatLabels.join(', ') }}</td>
                        <td class="p-2">{{ channelLabel(item.channel) }}<span class="block">{{ statusLabel(item.status) }}</span></td>
                        @if (kind() === 'sales') {
                          <td class="p-2 text-right">{{ item.ticketCount ?? item.seatLabels.length }} / {{ item.total ?? 0 }} Ft</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        }
      }
    </div>
  `,
})
export class AdminReportTableComponent implements OnInit {
  readonly kind = input.required<AdminReportKind>();

  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);
  private readonly reports = inject(AdminReportsService);

  protected readonly venues = signal<Venue[]>([]);
  protected readonly movies = signal<Movie[]>([]);
  protected readonly screenings = signal<Screening[]>([]);
  protected readonly report = signal<AdminReportResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly reportLoading = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');

  protected readonly filterForm = this.fb.nonNullable.group({
    from: [''],
    to: [''],
    venueId: [''],
    screeningId: [''],
    channel: this.fb.nonNullable.control<'' | 'online' | 'cashier'>(''),
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      venues: this.admin.list<Venue>('venues'),
      movies: this.admin.list<Movie>('movies'),
      screenings: this.admin.list<Screening>('screenings'),
      report: this.reports.get(this.kind(), this.filterForm.getRawValue()),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ venues, movies, screenings, report }) => {
        this.venues.set(venues);
        this.movies.set(movies);
        this.screenings.set(screenings);
        this.report.set(report);
      },
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected movieName(movieId: number): string {
    return this.movies().find((movie) => movie.id === movieId)?.title ?? 'Ismeretlen cím';
  }

  protected applyFilters(): void {
    this.error.set('');
    this.reportLoading.set(true);
    this.reports.get(this.kind(), this.filterForm.getRawValue())
      .pipe(finalize(() => this.reportLoading.set(false)))
      .subscribe({
        next: (report) => this.report.set(report),
        error: (error: unknown) => this.error.set(toProblem(error).message),
      });
  }

  protected clearFilters(): void {
    this.filterForm.reset({ from: '', to: '', venueId: '', screeningId: '', channel: '' });
    this.applyFilters();
  }

  protected channelLabel(channel: AdminReportItem['channel']): string {
    return channel === 'online' ? 'Online' : 'Pénztár';
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Aktív',
      cancelled: 'Lemondva',
      converted: 'Jegy kiadva',
      expired: 'Lejárt',
      paid: 'Fizetve',
    };
    return labels[status] ?? status;
  }

  protected paymentLabel(item: AdminReportItem): string {
    if (item.paymentMethod === 'cash') return 'Készpénz';
    if (item.paymentMethod === 'card') return 'Bankkártya';
    if (item.paymentMethod === 'stripe') return 'Online fizetés';
    return '–';
  }
}
