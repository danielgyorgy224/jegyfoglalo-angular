import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, switchMap } from 'rxjs';
import { ProgramEntry } from '../../models/screening';
import { ProgramService } from '../../core/services/program.service';
import { HuDatePipe } from '../../shared/format.pipes';
import { LoadState, toLoadState } from '../../shared/load-state';
import { PosterPipe } from '../../shared/poster.pipe';
import { StatusMessageComponent } from '../../shared/status-message.component';

type TypeFilter = 'all' | 'film' | 'event';
const MAX_SHOWN = 4;

@Component({
  selector: 'app-program-page',
  imports: [RouterLink, HuDatePipe, PosterPipe, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './program-page.component.html',
})
export class ProgramPageComponent {
  private readonly program = inject(ProgramService);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  protected readonly maxShown = MAX_SHOWN;
  protected readonly state = toSignal(this.reload$.pipe(switchMap(() => toLoadState(this.program.loadProgram()))), {
    initialValue: { status: 'loading' } as LoadState<ProgramEntry[]>,
  });

  protected readonly typeFilter = signal<TypeFilter>('all');
  protected readonly venueFilter = signal<number | null>(null);

  protected readonly typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'Mind' },
    { value: 'film', label: 'Filmek' },
    { value: 'event', label: 'Előadások' },
  ];

  /** A betöltött műsorból a helyszínek (szűrőhöz). */
  protected readonly venues = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') return [];
    const map = new Map<number, string>();
    s.data.forEach((e) => e.screenings.forEach((sc) => map.set(sc.venue.id, sc.venue.name)));
    return [...map].map(([id, name]) => ({ id, name }));
  });

  /** A szűrők szerinti műsor; a helyszín-szűrő az időpontokat is leszűkíti. */
  protected readonly entries = computed<ProgramEntry[]>(() => {
    const s = this.state();
    if (s.status !== 'ready') return [];
    const type = this.typeFilter();
    const venueId = this.venueFilter();
    return s.data
      .filter((e) => type === 'all' || e.movie.type === type)
      .map((e) => ({ ...e, screenings: venueId ? e.screenings.filter((sc) => sc.venue.id === venueId) : e.screenings }))
      .filter((e) => e.screenings.length > 0);
  });

  protected reload(): void {
    this.reload$.next();
  }

  protected onVenueChange(value: string): void {
    this.venueFilter.set(value ? Number(value) : null);
  }
}
