import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { toProblem } from '../core/util/api-error';
import { BoxOfficeApiService, CashierReservation, CashierSale } from './box-office-api.service';
import { CashierReceipt, CashierReceiptComponent } from './cashier-receipt.component';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-box-office-reservations',
  imports: [DatePipe, ReactiveFormsModule, CashierReceiptComponent, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Pénztár</p>
        <h1 class="mt-2 text-3xl">Foglalások keresése és kezelése</h1>
      </header>

      <section class="card p-5">
        <h2 class="text-2xl">Keresés</h2>
        <form class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" [formGroup]="searchForm" (ngSubmit)="search()">
          <div>
            <label for="reservation-query" class="mb-1 block font-semibold">Foglalási kód vagy névrészlet</label>
            <input id="reservation-query" class="field" formControlName="query" minlength="2" maxlength="100" required />
            @if (searchForm.controls.query.touched && searchForm.controls.query.invalid) {
              <p class="mt-1 text-sm text-brick">Legalább 2 karaktert adj meg.</p>
            }
          </div>
          <button type="submit" class="btn btn-primary self-end" [disabled]="loading()">Keresés</button>
        </form>
        <div class="mt-4 max-w-xs">
          <label for="issue-payment" class="mb-1 block font-semibold">Kiadás fizetési módja</label>
          <select id="issue-payment" class="field" [formControl]="paymentMethod">
            <option value="cash">Készpénz</option>
            <option value="card">Bankkártya</option>
          </select>
        </div>
      </section>

      @if (error()) {
        <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ notice() }}</p>
      }
      @if (loading()) {
        <app-status-message kind="loading" />
      } @else if (hasSearched() && reservations().length === 0) {
        <p class="card p-5 text-ink-soft">A keresés nem talált foglalást.</p>
      } @else if (reservations().length > 0) {
        <section class="card p-5">
          <h2 class="text-2xl">Találatok ({{ reservations().length }})</h2>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full min-w-232 border-collapse text-left">
              <thead>
                <tr class="border-b-2 border-line">
                  <th class="p-2">Kód / állapot</th>
                  <th class="p-2">Vásárló</th>
                  <th class="p-2">Előadás</th>
                  <th class="p-2">Székek</th>
                  <th class="p-2">Csatorna</th>
                  <th class="p-2">Művelet</th>
                </tr>
              </thead>
              <tbody>
                @for (reservation of reservations(); track reservation.id) {
                  <tr class="border-b border-line align-top">
                    <td class="p-2">
                      <strong>{{ reservation.code }}</strong>
                      <span class="block">{{ statusLabel(reservation.status) }}</span>
                    </td>
                    <td class="p-2">{{ reservation.customerName }}<span class="block text-sm text-ink-soft">{{ reservation.customerContact }}</span></td>
                    <td class="p-2">
                      {{ reservation.movieTitle }}
                      <span class="block">{{ reservation.startsAt | date:'yyyy. MM. dd. HH:mm' }}</span>
                      <span class="block text-sm text-ink-soft">{{ reservation.venueName }} · {{ reservation.hallName }}</span>
                    </td>
                    <td class="p-2">{{ reservation.seatLabels?.join(', ') }}</td>
                    <td class="p-2">{{ reservation.channel === 'cashier' ? 'Pénztár' : 'Online' }}</td>
                    <td class="p-2">
                      <div class="flex flex-col items-start gap-2">
                        <button
                          type="button"
                          class="btn btn-primary"
                          [disabled]="saving() || reservation.status !== 'active'"
                          (click)="issue(reservation)"
                        >
                          Jegy kiadása
                        </button>
                        <button
                          type="button"
                          class="btn btn-outline"
                          [disabled]="saving() || reservation.status !== 'active'"
                          (click)="cancel(reservation)"
                        >
                          Foglalás lemondása
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else {
        <p class="card p-5 text-ink-soft">Kereséshez adj meg egy foglalási kódot vagy legalább két karaktert a névből.</p>
      }

      @if (receipt()) {
        <app-cashier-receipt [receipt]="receipt()!" />
      }
    </div>
  `,
})
export class BoxOfficeReservationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BoxOfficeApiService);

  protected readonly reservations = signal<CashierReservation[]>([]);
  protected readonly receipt = signal<CashierReceipt | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly searchForm = this.fb.nonNullable.group({
    query: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
  });
  protected readonly paymentMethod = this.fb.nonNullable.control<'cash' | 'card'>('cash');

  protected search(preserveError = false): void {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }
    if (!preserveError) this.error.set('');
    this.notice.set('');
    this.loading.set(true);
    this.hasSearched.set(true);
    this.api.searchReservations(this.searchForm.controls.query.value.trim())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.reservations.set(response.items),
        error: (error: unknown) => this.error.set(toProblem(error).message),
      });
  }

  protected statusLabel(status: CashierReservation['status']): string {
    switch (status) {
      case 'active': return 'Aktív';
      case 'cancelled': return 'Lemondva';
      case 'converted': return 'Jegy kiadva';
      case 'expired': return 'Lejárt';
    }
  }

  protected issue(reservation: CashierReservation): void {
    if (!window.confirm(`Kiadod a jegyeket a(z) ${reservation.code} foglalásból?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.api.issueReservation(reservation.id, this.paymentMethod.value)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (sale) => {
          this.receipt.set(this.saleReceipt(sale, reservation));
          this.updateStatus(reservation.id, 'converted');
          this.notice.set(`${sale.tickets.length} jegy kiállítva a(z) ${reservation.code} foglalásból.`);
        },
        error: (error: unknown) => this.handleActionError(error, reservation),
      });
  }

  protected cancel(reservation: CashierReservation): void {
    if (!window.confirm(`Biztosan lemondod a(z) ${reservation.code} foglalást?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.api.cancelReservation(reservation.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.updateStatus(reservation.id, 'cancelled');
        this.notice.set(`A(z) ${reservation.code} foglalás lemondva.`);
      },
      error: (error: unknown) => this.handleActionError(error, reservation),
    });
  }

  private updateStatus(id: number, status: CashierReservation['status']): void {
    this.reservations.update((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  private handleActionError(error: unknown, reservation: CashierReservation): void {
    const problem = toProblem(error);
    if (problem.code === 'SEAT_UNAVAILABLE') {
      const labels = (problem.seatIds ?? [])
        .map((id) => {
          const index = reservation.seatIds?.indexOf(id) ?? -1;
          return index >= 0 ? reservation.seatLabels?.[index] ?? String(id) : String(id);
        });
      this.error.set(`${problem.message}${labels.length ? ` Érintett székek: ${labels.join(', ')}.` : ''}`);
      this.search(true);
      return;
    }
    this.error.set(problem.message);
  }

  private saleReceipt(sale: CashierSale, reservation: CashierReservation): CashierReceipt {
    return {
      kind: 'sale',
      code: `#${sale.id}`,
      movieTitle: reservation.movieTitle,
      venueName: reservation.venueName,
      hallName: reservation.hallName,
      startsAt: reservation.startsAt ?? '',
      customerName: reservation.customerName,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      seats: sale.tickets.map((ticket, index) => ({
        label: reservation.seatLabels?.[index] ?? String(ticket.seatId),
        price: ticket.price,
        ticketCode: ticket.ticketCode,
      })),
    };
  }
}
