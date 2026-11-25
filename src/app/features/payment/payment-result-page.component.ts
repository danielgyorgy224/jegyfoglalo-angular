import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { CheckoutService } from '../../core/services/checkout.service';
import { toProblem } from '../../core/util/api-error';
import { Order } from '../../models/booking';
import { FtPipe, HuDatePipe } from '../../shared/format.pipes';
import { StatusMessageComponent } from '../../shared/status-message.component';

type Result =
  | { kind: 'loading' }
  | { kind: 'success'; order: Order }
  | { kind: 'failed' | 'cancelled'; title: string; text: string }
  | { kind: 'error'; message: string };

const FAILURE_TEXT: Record<string, string> = {
  declined: 'A bankkártyás fizetés nem sikerült. Nem vontunk le összeget, a kiválasztott helyek újra szabadok.',
  expired: 'A fizetésre szánt idő lejárt, ezért a helyeket felszabadítottuk. Nem vontunk le összeget.',
  seat_taken:
    'Fizetés közben a kiválasztott helyek közül valamelyiket már más megvette. A kifizetett összeget visszautaljuk.',
  price_changed: 'A jegyárak a fizetés közben megváltoztak. A kifizetett összeget visszautaljuk, kérjük, próbáld újra.',
  provider_error: 'A fizetési szolgáltatótól nem kaptunk megerősítést. A helyeket felszabadítottuk, nem vontunk le összeget.',
};

/** A fizetés végeredménye: sikeres (jegyazonosítók), sikertelen vagy megszakított – egyértelmű visszajelzéssel. */
@Component({
  selector: 'app-payment-result-page',
  imports: [RouterLink, FtPipe, HuDatePipe, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-result-page.component.html',
})
export class PaymentResultPageComponent {
  private readonly checkout = inject(CheckoutService);

  // query paraméterek (withComponentInputBinding)
  readonly status = input<string>();
  readonly order = input<string>();
  readonly ref = input<string>();
  readonly reason = input<string>();
  readonly screening = input<string>();

  protected readonly backLink = computed(() => (this.screening() ? ['/screenings', this.screening()] : ['/']));

  protected readonly result = toSignal(
    toObservable(computed(() => ({ status: this.status(), order: this.order(), ref: this.ref(), reason: this.reason() }))).pipe(
      switchMap((p) => this.resolve(p)),
    ),
    { initialValue: { kind: 'loading' } as Result },
  );

  protected print(): void {
    window.print();
  }

  private resolve(p: { status?: string; order?: string; ref?: string; reason?: string }): Observable<Result> {
    if (p.status === 'success' && p.order) {
      return this.checkout.getOrder(p.order).pipe(
        map((order): Result => ({ kind: 'success', order })),
        catchError((err) => of<Result>({ kind: 'error', message: toProblem(err).message })),
        startWith<Result>({ kind: 'loading' }),
      );
    }
    if (p.status === 'cancelled') {
      const done: Result = {
        kind: 'cancelled',
        title: 'A fizetést megszakítottad',
        text: 'Nem vontunk le összeget, a kiválasztott helyeket újra szabaddá tettük.',
      };
      // a szerver a zárolt helyeket azonnal felszabadítja
      const release$: Observable<unknown> = p.ref ? this.checkout.cancel(p.ref) : of(null);
      return release$.pipe(
        map((): Result => done),
        catchError(() => of<Result>(done)), // a zárolás amúgy is lejár
        startWith<Result>({ kind: 'loading' }),
      );
    }
    return of<Result>({
      kind: 'failed',
      title: 'A fizetés sikertelen',
      text: FAILURE_TEXT[p.reason ?? ''] ?? 'A fizetés nem sikerült. Nem vontunk le összeget, a helyek újra szabadok.',
    });
  }
}
