export type SeriesId = "land" | "port" | "arch" | "still";

export interface Plate {
  title: string;
  date: string;
  medium: string;
}

export interface Series {
  id: SeriesId;
  name: string;
  foil: string;
  ink: string;
  dot: string;
  art: [string, string, string];
  sub: string;
  blurb: string;
  pool: Plate[];
}

export type Phase = "idle" | "tearing" | "dealing" | "collected";

export interface Card {
  key: string;
  order: number;
  seriesId: SeriesId;
  slot: string;
  plate: string;
  tier: string;
  ink: string;
  title: string;
  date: string;
  medium: string;
  photoUrl: string | null;
  display?: "block" | "none";
}
