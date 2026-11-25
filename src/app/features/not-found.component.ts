import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-16 text-center">
      <h1 class="text-4xl">Az oldal nem található</h1>
      <p class="mt-3 text-ink-soft">A keresett oldal nem létezik vagy áthelyezték.</p>
      <a routerLink="/" class="btn btn-primary mt-6">Vissza a műsorhoz</a>
    </section>
  `,
})
export class NotFoundComponent {}
