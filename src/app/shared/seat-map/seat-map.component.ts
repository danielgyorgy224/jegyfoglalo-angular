import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PriceMap, Sector, SeatmapSeat } from '../../models/seatmap';
import { formatNumber } from '../format.pipes';
import { groupBy } from '../../core/util/group-by';
import { LEGEND_ORDER, SEAT_STATUS } from '../seat-status';

interface RowView { name: string; seats: SeatmapSeat[] }
interface SectorView { id: number; name: string; priceLabel: string; rows: RowView[] }

/**
 * Teremnézet: szektorok, sorok, egyedileg azonosítható székek.
 * A székek állapotát szín ÉS jel/felirat is mutatja (jelmagyarázat alul).
 *
 * Használat (a pénztár is ezt használja):
 *   <app-seat-map [seats]="seats" [prices]="prices" [selected]="selected" (selectionChange)="selected = $event" />
 *
 * Inputok:  seats, prices (seatId → ár), selected (kiválasztott seatId-k), sectors (opcionális), maxSelect, readonly
 * Output:   selectionChange – a kiválasztott seatId-k új listája
 */
@Component({
  selector: 'app-seat-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-map.component.html',
})
export class SeatMapComponent {
  readonly seats = input.required<SeatmapSeat[]>();
  readonly prices = input<PriceMap>({});
  readonly selected = input<number[]>([]);
  readonly sectors = input<Sector[]>([]);
  readonly maxSelect = input<number>(10);
  readonly readonly = input(false);

  readonly selectionChange = output<number[]>();

  protected readonly legend = LEGEND_ORDER.map((key) => ({ key, ...SEAT_STATUS[key] }));
  protected readonly meta = SEAT_STATUS;

  private readonly selectedSet = computed(() => new Set(this.selected()));

  protected readonly sectorViews = computed<SectorView[]>(() => {
    const seats = this.seats();
    const prices = this.prices();
    const known = new Map(this.sectors().map((s) => [s.id, s]));
    const bySector = groupBy(seats, (s) => s.sectorId);

    return [...bySector.entries()]
      .map(([sectorId, sectorSeats]) => {
        const sector = known.get(sectorId);
        const rowNames = sector?.rows ?? [...new Set(sectorSeats.map((s) => s.row))].sort();
        const rows = rowNames
          .map((name) => ({
            name,
            seats: sectorSeats.filter((s) => s.row === name).sort((a, b) => a.number - b.number),
          }))
          .filter((r) => r.seats.length > 0);

        const values = sectorSeats.map((s) => prices[s.id]).filter((p): p is number => p !== undefined);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return {
          id: sectorId,
          name: sector?.name ?? `Szektor ${sectorId}`,
          priceLabel: !values.length ? '' : min === max ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`,
          rows,
          order: rowNames[0] ?? '',
        };
      })
      .sort((a, b) => a.order.localeCompare(b.order))
      .map(({ order: _order, ...view }) => view);
  });

  protected fmt = formatNumber;

  protected stateOf(seat: SeatmapSeat): keyof typeof SEAT_STATUS {
    return this.selectedSet().has(seat.id) ? 'selected' : seat.status;
  }

  protected canToggle(seat: SeatmapSeat): boolean {
    const state = this.stateOf(seat);
    return !this.readonly() && (state === 'free' || state === 'selected');
  }

  protected ariaLabel(seat: SeatmapSeat): string {
    const price = this.prices()[seat.id];
    const priceText = price === undefined ? '' : `, ${formatNumber(price)} forint`;
    return `${seat.row} sor ${seat.number}. szék (${seat.label}), ${SEAT_STATUS[this.stateOf(seat)].label.toLowerCase()}${priceText}`;
  }

  protected toggle(seat: SeatmapSeat): void {
    if (!this.canToggle(seat)) return;
    const current = this.selected();
    if (current.includes(seat.id)) {
      this.selectionChange.emit(current.filter((id) => id !== seat.id));
    } else if (current.length < this.maxSelect()) {
      this.selectionChange.emit([...current, seat.id]);
    }
  }
}
