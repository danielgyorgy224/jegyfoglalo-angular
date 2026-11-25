import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Betöltés / hiba megjelenítése egységesen. */
@Component({
  selector: 'app-status-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kind() === 'loading') {
      <p class="py-10 text-center text-ink-soft" role="status">Betöltés…</p>
    } @else {
      <div class="rounded border-2 border-brick bg-alert-soft p-4" role="alert">
        <p class="font-semibold">{{ message() }}</p>
        @if (retryable()) {
          <button type="button" class="btn btn-outline mt-3" (click)="retry.emit()">Újrapróbálom</button>
        }
      </div>
    }
  `,
})
export class StatusMessageComponent {
  readonly kind = input<'loading' | 'error'>('loading');
  readonly message = input('');
  readonly retryable = input(true);
  readonly retry = output<void>();
}
