// Studio configurator data — cities, printable locations, printers.

export type StudioLocation = {
  slug: string;
  name: string;
  area: string;
  coords: string;
  completed: boolean; // true = model ready & clickable, false = in modelling & click not allowed
};

export type StudioCity = {
  slug: string;
  name: string;
  available: boolean;
  locations: StudioLocation[];
};

// Cities are fetched dynamically from Supabase database tables (`cities` and `places`).
export const studioCities: StudioCity[] = [];

// Bambu Lab printers — build volume in mm (W × D × H).
export type Printer = {
  id: string;
  name: string;
  bed: [number, number, number];
};

export const printers: Printer[] = [
  { id: "a1-mini", name: "A1 mini", bed: [180, 180, 180] },
  { id: "a1", name: "A1", bed: [256, 256, 256] },
  { id: "p1s", name: "P1S", bed: [256, 256, 256] },
  { id: "x1c", name: "X1 Carbon", bed: [256, 256, 256] },
  { id: "h2d", name: "H2D", bed: [325, 320, 325] },
];

// Scene scale: 1 three.js unit = 50 mm.
export const MM = 1 / 50;

// Live "Manipulate city" values (percentages + layer visibility).
export type CityControls = {
  small: number; // small-building · vertical only
  large: number; // main-building · all axes
  terrain: number; // terrain · vertical only
  roads: number; // roads · vertical only
  trees: number; // trees · vertical only
  hideRoads: boolean;
  hideTrees: boolean;
  hideGrass: boolean;
  // Revit sub-foundation frame layer controls
  enableRevit: boolean;
  revitHeight: number; // frame height/thickness (% scale)
  revitWidth: number; // frame width (% scale) — used in independent mode
  revitBreadth: number; // frame breadth/depth (% scale) — used in independent mode
  revitUniformScale: boolean; // true = single slider scales W+D equally
  revitUniform: number; // uniform W+D scale (% scale) — used when revitUniformScale = true
};

export const CITY_DEFAULTS: CityControls = {
  small: 100,
  large: 100,
  terrain: 100,
  roads: 100,
  trees: 100,
  hideRoads: false,
  hideTrees: false,
  hideGrass: false,
  enableRevit: false,
  revitHeight: 35,
  revitWidth: 100,
  revitBreadth: 100,
  revitUniformScale: true,
  revitUniform: 100,
};
