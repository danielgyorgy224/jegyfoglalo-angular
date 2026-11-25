import { Observable, catchError, map, of, startWith } from 'rxjs';
import { ApiProblem, toProblem } from '../core/util/api-error';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; data: T };

/** Egy lekérés eredménye betöltés / hiba / kész állapotként (sablonhoz). */
export function toLoadState<T>(source$: Observable<T>): Observable<LoadState<T>> {
  return source$.pipe(
    map((data): LoadState<T> => ({ status: 'ready', data })),
    catchError((err) => of<LoadState<T>>({ status: 'error', problem: toProblem(err) })),
    startWith<LoadState<T>>({ status: 'loading' }),
  );
}
