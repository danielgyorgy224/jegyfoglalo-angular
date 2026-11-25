import { Pipe, PipeTransform } from '@angular/core';

const TZ = 'Europe/Budapest';
// A hu-HU nyelv a négyjegyű számokat nem tagolja; a feladatleírás szerint "2 500 Ft" a kívánt alak.
const nf = { format: (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') };
const fmt = {
  day: new Intl.DateTimeFormat('hu-HU', { timeZone: TZ, month: 'short', day: 'numeric', weekday: 'long' }),
  time: new Intl.DateTimeFormat('hu-HU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
  full: new Intl.DateTimeFormat('hu-HU', {
    timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit',
  }),
  short: new Intl.DateTimeFormat('hu-HU', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
};

/** 2500 → "2 500 Ft" */
@Pipe({ name: 'ft' })
export class FtPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '' : `${nf.format(value)} Ft`;
  }
}

/** Magyar dátum / idő budapesti időzónában: 'day' | 'time' | 'full' | 'short' */
@Pipe({ name: 'huDate' })
export class HuDatePipe implements PipeTransform {
  transform(iso: string | null | undefined, format: keyof typeof fmt = 'full'): string {
    return iso ? fmt[format].format(new Date(iso)) : '';
  }
}

/** Budapesti naptári nap kulcsa (csoportosításhoz): "2026-12-04" */
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso));
}

/** 2500 → "2 500" (mértékegység nélkül) */
export const formatNumber = (n: number): string => nf.format(n);
