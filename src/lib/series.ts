import type { Series } from "./types";

// Placeholder plate titles/dates/mediums — swap for real captions once
// photographs are dropped into public/photos/<seriesId>/ (see photos.server.ts).
export const SERIES: Series[] = [
  {
    id: "land",
    name: "Landscape",
    foil: "#004961",
    ink: "var(--color-accent-700)",
    dot: "#0088b0",
    art: ["Eight", "land-", "scapes"],
    sub: "wide country, sealed",
    blurb:
      "Eight landscapes, sealed in foil and printed as art cards. Swipe across the crimped top to open the pack.",
    pool: [
      { title: "Harbour, First Light", date: "2024", medium: "Gelatin silver print" },
      { title: "Salt Flat, Noon", date: "2024", medium: "Platinum palladium" },
      { title: "Fog Bank No. 4", date: "2024", medium: "Gelatin silver print" },
      { title: "The Long Field", date: "2021", medium: "Chromogenic print" },
      { title: "Quarry Road", date: "2023", medium: "Gelatin silver print" },
      { title: "Breakwater", date: "2024", medium: "Platinum palladium" },
      { title: "Dry Riverbed", date: "2021", medium: "Archival pigment print" },
      { title: "Pines Before Rain", date: "2022", medium: "Gelatin silver print" },
      { title: "Low Tide, Two Boats", date: "2024", medium: "Archival pigment print" },
      { title: "Snow on the Turnpike", date: "2023", medium: "Gelatin silver print" },
    ],
  },
  {
    id: "port",
    name: "Portrait",
    foil: "#790e3d",
    ink: "var(--color-accent-2-700)",
    dot: "#d6006c",
    art: ["Eight", "por-", "traits"],
    sub: "faces, sealed",
    blurb:
      "Eight portraits, sealed in foil and printed as art cards. Swipe across the crimped top to open the pack.",
    pool: [
      { title: "Portrait of My Landlord", date: "2023", medium: "Gelatin silver print" },
      { title: "Sitter with Hat", date: "2024", medium: "Platinum palladium" },
      { title: "Two Sisters, Kitchen", date: "2022", medium: "Chromogenic print" },
      { title: "Boxer, Between Rounds", date: "2023", medium: "Gelatin silver print" },
      { title: "Hands of a Printer", date: "2024", medium: "Archival pigment print" },
      { title: "Girl on the Seawall", date: "2021", medium: "Gelatin silver print" },
      { title: "Night Shift Nurse", date: "2024", medium: "Archival pigment print" },
      { title: "Self, Mirror, Flash", date: "2022", medium: "Gelatin silver print" },
      { title: "The Understudy", date: "2023", medium: "Chromogenic print" },
      { title: "Stranger, Platform 4", date: "2024", medium: "Gelatin silver print" },
    ],
  },
  {
    id: "arch",
    name: "Architecture",
    foil: "#0a303e",
    ink: "var(--color-accent-700)",
    dot: "#38a6cf",
    art: ["Eight", "buil-", "dings"],
    sub: "concrete and glass",
    blurb:
      "Eight buildings, sealed in foil and printed as art cards. Swipe across the crimped top to open the pack.",
    pool: [
      { title: "Study of a Stairwell", date: "2022", medium: "Gelatin silver print" },
      { title: "Rooftop Aerials", date: "2023", medium: "Archival pigment print" },
      { title: "Municipal Pool", date: "2023", medium: "Archival pigment print" },
      { title: "Sixth Floor, Vacant", date: "2021", medium: "Gelatin silver print" },
      { title: "Car Park, Level 3", date: "2024", medium: "Gelatin silver print" },
      { title: "Chapel, Side Light", date: "2022", medium: "Platinum palladium" },
      { title: "Cooling Towers", date: "2023", medium: "Gelatin silver print" },
      { title: "Glass Atrium", date: "2024", medium: "Chromogenic print" },
      { title: "Water Tank, Roof", date: "2021", medium: "Gelatin silver print" },
      { title: "Underpass", date: "2024", medium: "Archival pigment print" },
    ],
  },
  {
    id: "still",
    name: "Still life",
    foil: "#201e1d",
    ink: "var(--color-neutral-800)",
    dot: "#201e1d",
    art: ["Eight", "still", "lifes"],
    sub: "table-top light",
    blurb:
      "Eight still lifes, sealed in foil and printed as art cards. Swipe across the crimped top to open the pack.",
    pool: [
      { title: "Two Chairs, Off Season", date: "2023", medium: "Archival pigment print" },
      { title: "Interior with Curtain", date: "2022", medium: "Chromogenic print" },
      { title: "Cold Frame", date: "2024", medium: "Platinum palladium" },
      { title: "Greenhouse Light", date: "2024", medium: "Platinum palladium" },
      { title: "Bowl, Three Pears", date: "2023", medium: "Gelatin silver print" },
      { title: "Folded Linen", date: "2022", medium: "Gelatin silver print" },
      { title: "Cut Flowers, Day 6", date: "2024", medium: "Chromogenic print" },
      { title: "Wine Glass, Window", date: "2021", medium: "Gelatin silver print" },
      { title: "Studio Floor", date: "2023", medium: "Archival pigment print" },
      { title: "Last Frame of the Roll", date: "2022", medium: "Gelatin silver print" },
    ],
  },
];

export function getSeries(id: string) {
  return SERIES.find((s) => s.id === id) ?? SERIES[0];
}
