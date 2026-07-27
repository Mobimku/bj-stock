export interface UnitOption {
  readonly id: string;
  readonly label: string;
  readonly totalCapital: number | string;
  readonly listingPrice: number | string | null;
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly wa: string | null;
}
