import { SeatStatus } from '../models/seatmap';

export interface SeatStatusMeta {
  /** felirat a jelmagyarázatban és a képernyőolvasónak */
  label: string;
  /** a székben megjelenő jel – a szín mellett is megkülönbözteti az állapotot */
  glyph: string;
  /** Tailwind osztályok a székhez */
  classes: string;
}

export const SEAT_STATUS: Record<SeatStatus | 'selected', SeatStatusMeta> = {
  free: {
    label: 'Szabad',
    glyph: '',
    classes: 'bg-white text-ink border-pine border-2 hover:bg-pine hover:text-white cursor-pointer',
  },
  selected: {
    label: 'Kiválasztva',
    glyph: '✓',
    classes: 'bg-brick text-white border-brick-dark border-2 cursor-pointer',
  },
  reserved: {
    label: 'Foglalt',
    glyph: 'F',
    classes: 'bg-brass-soft text-ink border-brass border-2 cursor-not-allowed',
  },
  sold: {
    label: 'Eladott',
    glyph: '×',
    classes: 'bg-ink text-paper border-ink border-2 cursor-not-allowed',
  },
  disabled: {
    label: 'Letiltott',
    glyph: '⊘',
    classes: 'bg-paper-deep text-ink-soft border-line border-2 border-dashed cursor-not-allowed',
  },
  locked: {
    label: 'Fizetés alatt',
    glyph: '…',
    classes: 'bg-white text-ink-soft border-brass border-2 border-dotted cursor-not-allowed',
  },
};

export const LEGEND_ORDER: (SeatStatus | 'selected')[] = ['free', 'selected', 'reserved', 'sold', 'disabled', 'locked'];
