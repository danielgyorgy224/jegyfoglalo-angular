/** Közös elemek a foglalási és fizetési válaszokban. */
export interface ScreeningSummary {
  screeningId: number;
  startsAt: string;
  movieTitle: string;
  movieType: 'film' | 'event';
  venueName: string;
  venueAddress: string;
  hallName: string;
}

export interface SeatLine {
  id: number;
  label: string;
  price: number;
}

/** POST /reservations és POST /checkout törzse. Összeget a kliens nem küld. */
export interface BookingRequest {
  screeningId: number;
  seatIds: number[];
  customerName: string;
  customerContact: string;
}

export interface Reservation extends ScreeningSummary {
  code: string;
  status: 'active' | 'cancelled' | 'converted' | 'expired';
  createdAt: string;
  seats: SeatLine[];
  total: number;
  /** csak a POST /reservations válaszában */
  customerName?: string;
}

export type PaymentMode = 'stripe' | 'mock';

export interface CheckoutStart {
  ref: string;
  mode: PaymentMode;
  checkoutUrl: string;
  total: number;
  expiresAt: string;
}

export interface CheckoutInfo extends ScreeningSummary {
  ref: string;
  mode: PaymentMode;
  expiresAt: string;
  seats: SeatLine[];
  total: number;
}

export interface Ticket {
  ticketCode: string;
  seatId: number;
  seatLabel: string;
  price: number;
}

export interface Order extends ScreeningSummary {
  orderRef: string;
  status: string;
  createdAt: string;
  total: number;
  tickets: Ticket[];
}

export interface PublicConfig {
  paymentMode: PaymentMode;
  lockMinutes: number;
  maxSeats: number;
}

/** A szerver hibaválasza. */
export interface ApiErrorBody {
  error: string;
  code: string;
  seatIds?: number[];
}
