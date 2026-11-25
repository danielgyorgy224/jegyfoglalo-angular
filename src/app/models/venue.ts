export interface Venue {
  id: number;
  name: string;
  city: string;
  address: string;
}

export interface Hall {
  id: number;
  venueId: number;
  name: string;
}
