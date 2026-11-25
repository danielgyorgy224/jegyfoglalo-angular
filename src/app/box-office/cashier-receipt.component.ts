import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface CashierReceipt {
  kind: 'reservation' | 'sale';
  code: string | null;
  movieTitle: string;
  venueName: string;
  hallName: string;
  startsAt: string;
  customerName?: string;
  paymentMethod?: 'cash' | 'card';
  total: number;
  seats: Array<{ label: string; price: number; ticketCode?: string }>;
}

@Component({
  selector: 'app-cashier-receipt',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article id="cashier-receipt-print" class="card mt-6 p-5 sm:p-7">
      <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">
        {{ receipt().kind === 'reservation' ? 'Pénztári foglalás' : 'Jegyeladás' }}
      </p>
      <h2 class="mt-2 text-2xl">Kisújszállási Vigadó</h2>
      @if (receipt().code) {
        <p class="mt-2 text-xl font-bold">{{ receipt().kind === 'reservation' ? 'Foglalási kód' : 'Azonosító' }}: {{ receipt().code }}</p>
      }
      <dl class="mt-4 grid gap-2 sm:grid-cols-2">
        <div><dt class="font-semibold">Műsor</dt><dd>{{ receipt().movieTitle }}</dd></div>
        <div><dt class="font-semibold">Időpont</dt><dd>{{ receipt().startsAt | date:'yyyy. MM. dd. HH:mm' }}</dd></div>
        <div><dt class="font-semibold">Helyszín</dt><dd>{{ receipt().venueName }} · {{ receipt().hallName }}</dd></div>
        @if (receipt().customerName) {
          <div><dt class="font-semibold">Név</dt><dd>{{ receipt().customerName }}</dd></div>
        }
        @if (receipt().paymentMethod) {
          <div><dt class="font-semibold">Fizetés</dt><dd>{{ receipt().paymentMethod === 'cash' ? 'Készpénz' : 'Kártya' }}</dd></div>
        }
      </dl>
      <div class="mt-5 overflow-x-auto">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b-2 border-line">
              <th class="p-2">Szék</th>
              <th class="p-2">Jegykód</th>
              <th class="p-2 text-right">Ár</th>
            </tr>
          </thead>
          <tbody>
            @for (seat of receipt().seats; track seat.ticketCode ?? seat.label) {
              <tr class="border-b border-line">
                <td class="p-2 font-semibold">{{ seat.label }}</td>
                <td class="p-2">{{ seat.ticketCode ?? 'Foglalás' }}</td>
                <td class="p-2 text-right">{{ seat.price }} Ft</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr><th class="p-2 text-right" colspan="2">Végösszeg</th><th class="p-2 text-right">{{ receipt().total }} Ft</th></tr>
          </tfoot>
        </table>
      </div>
      <button type="button" class="btn btn-outline no-print mt-5" (click)="print()">Nyomtatás</button>
    </article>
  `,
})
export class CashierReceiptComponent {
  readonly receipt = input.required<CashierReceipt>();

  protected print(): void {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #cashier-receipt-print, #cashier-receipt-print * { visibility: visible !important; }
        #cashier-receipt-print {
          position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important;
          margin: 0 !important; padding: 24px !important; border: 0 !important;
          background: #fff !important; color: #000 !important;
        }
        #cashier-receipt-print .no-print { display: none !important; }
      }
    `;
    document.head.append(style);
    try {
      window.print();
    } finally {
      window.setTimeout(() => style.remove(), 1000);
    }
  }
}
