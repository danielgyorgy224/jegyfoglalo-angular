'use strict';
/**
 * Árképzés – tiszta függvények, I/O nélkül.
 * Szabály (előadásonként): székár → szektorár → alapár.
 */

/** Az előadás felülírásainak indexe: { seat: Map(seatId→ár), sector: Map(sectorId→ár) } */
function indexOverrides(overrides, screeningId) {
  const seat = new Map();
  const sector = new Map();
  for (const o of overrides || []) {
    if (o.screeningId !== screeningId) continue;
    if (o.scope === 'seat') seat.set(o.targetId, o.price);
    else if (o.scope === 'sector') sector.set(o.targetId, o.price);
  }
  return { seat, sector };
}

/** Egy szék érvényes ára: { price, source: 'seat' | 'sector' | 'base' } */
function effectivePrice(seat, screening, index) {
  if (index.seat.has(seat.id)) return { price: index.seat.get(seat.id), source: 'seat' };
  if (index.sector.has(seat.sectorId)) return { price: index.sector.get(seat.sectorId), source: 'sector' };
  return { price: screening.basePrice, source: 'base' };
}

/** Az előadás összes székének ára: Map(seatId → { price, source }) */
function buildPriceMap(seats, screening, overrides) {
  const index = indexOverrides(overrides, screening.id);
  const map = new Map();
  for (const seat of seats) map.set(seat.id, effectivePrice(seat, screening, index));
  return map;
}

/** Végösszeg a kiválasztott székekre. Ismeretlen szék esetén hibát dob. */
function calcTotal(seatIds, priceMap) {
  let total = 0;
  for (const id of seatIds) {
    const p = priceMap.get(id);
    if (!p) throw new Error(`Ismeretlen szék: ${id}`);
    total += p.price;
  }
  return total;
}

module.exports = { indexOverrides, effectivePrice, buildPriceMap, calcTotal };
