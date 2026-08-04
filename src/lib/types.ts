export interface Plate {
  title: string;
  date: string;
  medium: string;
}

export interface Design {
  id: string;
  name: string;
  packs: number;
  stock: string;
  foil: string;
  ink: string;
  art: string[];
  sub: string;
  subjects: string[];
  conds: string[];
  limited?: boolean;
  locked?: boolean;
}

export interface Slot {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface Pack {
  id: string;
  design: Design;
  designIdx: number;
  name: string;
  from: number;
  price: string;
  slot: Slot;
}

export type Phase = "bin" | "idle" | "tearing" | "dealing" | "collected";

export interface Card {
  key: string;
  order: number;
  designId: string;
  slot: string;
  plate: string;
  tilt: number;
  tag: string;
  tier: string;
  ink: string;
  title: string;
  date: string;
  medium: string;
  photoUrl: string | null;
  display?: "block" | "none";
}
