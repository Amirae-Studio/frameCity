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
  country: string;
  available: boolean;
  locations: StudioLocation[];
};

export type StudioBuilding = {
  slug: string;
  name: string;
  country: string;
  city_slug: string;
  city_name: string;
  area?: string;
  coords?: string;
  available: boolean;
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

export const FILAMENT_LINES = [
  {
    line: 'PLA Basic',
    colors: {
      'Jade White': '#FFFFFF',
      'Black': '#000000',
      'Silver': '#A6A9AA',
      'Gray': '#8E9089',
      'Light Gray': '#D1D3D5',
      'Dark Gray': '#545454',
      'Red': '#C12E1F',
      'Beige': '#F7E6DE',
      'Magenta': '#EC008C',
      'Pink': '#F55A74',
      'Hot Pink': '#F5547C',
      'Maroon Red': '#9D2235',
      'Orange': '#FF6A13',
      'Pumpkin Orange': '#FF9016',
      'Yellow': '#F4EE2A',
      'Gold': '#E4BD68',
      'Sunflower Yellow': '#FEC600',
      'Bambu Green': '#00AE42',
      'Mistletoe Green': '#3F8E43',
      'Bright Green': '#BECF00',
      'Blue': '#0A2989',
      'Blue Gray': '#5B6579',
      'Cyan': '#0086D6',
      'Cobalt Blue': '#0056B8',
      'Turquoise': '#00B1B7',
      'Purple': '#5E43B7',
      'Indigo Purple': '#482960',
      'Brown': '#9D432C',
      'Bronze': '#847D48',
      'Cocoa Brown': '#6F5034',
    },
  },
  {
    line: 'PLA Pure',
    colors: {
      'Pure White': '#FFFFFF',
      'Absolute Black': '#000000',
      'Baby Blue': '#A5DAE9',
      'Milky Pink': '#F8CDD8',
      'Apricot': '#FFB672',
    },
  },
];

export const DEFAULT_LAYER_COLORS: Record<string, string> = {
  trees: "#3F8E43", // Mistletoe Green
  grass: "#3F8E43", // Bambu Green
  terrain: "#545454", // Apricot
  "small-building": "#FFFFFF", // Jade White
  "main-building": "#FFFFFF", // Jade White
  roads: "#FFFFFF", // Dark Gray
};

// Live "Manipulate city" values (percentages + layer visibility + colors).
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
  // Filament Color customization
  enableColors: boolean;
  layerColors: Record<string, string>;
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
  revitHeight: 100,
  revitWidth: 100,
  revitBreadth: 100,
  revitUniformScale: true,
  revitUniform: 100,
  enableColors: false,
  layerColors: { ...DEFAULT_LAYER_COLORS },
};

