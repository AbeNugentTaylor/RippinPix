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

export type Rarity = "common" | "uncommon" | "rare" | "holo" | "secret";

export interface Attribute {
  label: string;
  value: string;
}

// x/y are CSS object-position percentages (0-100), zoom >= 1 scales the image
// beyond a plain "cover" fit before it's cropped to the card frame.
export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

export interface CardConfig {
  designId: string;
  local: number; // 1-based local plate number within the design
  fileName: string; // basename copied into public/photos/<designId>/
  sourcePath: string; // original absolute path, kept so it can be re-edited later
  crop: Crop;
  rarity: Rarity;
  holo: boolean;
  attributes: Attribute[];
  title?: string;
  date?: string;
  medium?: string;
  updatedAt: string;
}

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
  rarity?: Rarity;
  holo?: boolean;
  attributes?: Attribute[];
  crop?: Crop;
}
