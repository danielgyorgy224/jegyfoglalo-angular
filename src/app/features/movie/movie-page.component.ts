import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, merge, switchMap } from 'rxjs';
import { groupBy } from '../../core/util/group-by';
import { ProgramService } from '../../core/services/program.service';
import { ProgramEntry, ProgramScreening } from '../../models/screening';
import { FtPipe, HuDatePipe, dayKey } from '../../shared/format.pipes';
import { LoadState, toLoadState } from '../../shared/load-state';
import { PosterPipe } from '../../shared/poster.pipe';
import { StatusMessageComponent } from '../../shared/status-message.component';

interface DayGroup { key: string; iso: string; screenings: ProgramScreening[] }

@Component({
  selector: 'app-movie-page',
  imports: [RouterLink, HuDatePipe, FtPipe, PosterPipe, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movie-page.component.html',
})
export class MoviePageComponent {
  private readonly program = inject(ProgramService);
  private readonly retry$ = new Subject<void>();

  /** Az útvonal :id paramétere (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly state = toSignal(
    merge(toObservable(this.id), this.retry$.pipe(switchMap(() => [this.id()]))).pipe(
      switchMap((id) => toLoadState(this.program.loadMovie(Number(id)))),
    ),
    { initialValue: { status: 'loading' } as LoadState<ProgramEntry> },
  );

  protected readonly days = computed<DayGroup[]>(() => {
    const s = this.state();
    if (s.status !== 'ready') return [];
    const groups = groupBy(s.data.screenings, (sc) => dayKey(sc.startsAt));
    return [...groups].map(([key, screenings]) => ({ key, iso: screenings[0].startsAt, screenings }));
  });

  protected retry(): void {
    this.retry$.next();
  }
}
