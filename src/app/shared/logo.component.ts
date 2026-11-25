import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Vigadó logó: boltíves ablak (a vigadó épületek jellegzetes formája), benne "V" betű,
 * alatta üléssor. Lapos színek, színátmenet nélkül.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" role="img" aria-label="Vigadó logó">
      <path d="M8 60V26C8 13 18 4 32 4s24 9 24 22v34z" fill="var(--color-brick)" />
      <path d="M13 60V27C13 16 21 9 32 9s19 7 19 18v33z" fill="none" stroke="var(--color-paper)" stroke-width="1.5" />
      <path d="M20 20l12 22 12-22" fill="none" stroke="var(--color-paper)" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter" />
      <circle cx="21" cy="52" r="2.6" fill="var(--color-brass)" />
      <circle cx="32" cy="52" r="2.6" fill="var(--color-brass)" />
      <circle cx="43" cy="52" r="2.6" fill="var(--color-brass)" />
    </svg>
  `,
})
export class LogoComponent {
  readonly size = input(40);
}
