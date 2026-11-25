import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody } from '../../models/booking';

export interface ApiProblem {
  message: string;
  code?: string;
  /** ütközésnél a már nem szabad székek azonosítói */
  seatIds?: number[];
}

/** HTTP-hibából felhasználóbarát, magyar üzenet. */
export function toProblem(err: unknown): ApiProblem {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return { message: 'A szerver nem érhető el. Ellenőrizd a kapcsolatot, majd próbáld újra.', code: 'NETWORK' };
    }
    const body = err.error as Partial<ApiErrorBody> | null;
    if (body && typeof body === 'object' && body.error) {
      return { message: body.error, code: body.code, seatIds: body.seatIds };
    }
    if (err.status === 404) return { message: 'A keresett adat nem található.', code: 'NOT_FOUND' };
  }
  return { message: 'Váratlan hiba történt. Próbáld újra később.', code: 'UNKNOWN' };
}
