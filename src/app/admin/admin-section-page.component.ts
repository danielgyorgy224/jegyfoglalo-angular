import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-admin-section-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5 sm:p-7">
      <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
      <h1 class="mt-2 text-3xl">{{ heading() }}</h1>
      <p class="mt-3 text-ink-soft">Ennek a területnek a kezelőfelülete még készül.</p>
    </section>
  `,
})
export class AdminSectionPageComponent {
  readonly heading = input('Adminisztráció');
}
