// Studio configurator data — cities, printable locations, printers.

export type StudioLocation = {
  slug: string;
  name: string;
  area: string;
  coords: string;
};

export type StudioCity = {
  slug: string;
  name: string;
  available: boolean;
  locations: StudioLocation[];
};

export const studioCities: StudioCity[] = [
  {
    slug: "london",
    name: "London",
    available: true,
    locations: [
      { slug: "the-city", name: "The City", area: "Square Mile · EC2", coords: "51.5155° N, 0.0922° W" },
      { slug: "westminster", name: "Westminster", area: "Big Ben · Abbey", coords: "51.4995° N, 0.1248° W" },
      { slug: "tower-bridge", name: "Tower Bridge", area: "Southwark riverfront", coords: "51.5055° N, 0.0754° W" },
      { slug: "canary-wharf", name: "Canary Wharf", area: "Docklands", coords: "51.5054° N, 0.0235° W" },
      { slug: "camden", name: "Camden", area: "Regent's Park edge", coords: "51.5390° N, 0.1426° W" },
    ],
  },
  {
    slug: "paris",
    name: "Paris",
    available: true,
    locations: [
      { slug: "tour-eiffel", name: "Tour Eiffel", area: "Champ-de-Mars · 7ᵉ", coords: "48.8584° N, 2.2945° E" },
      { slug: "le-marais", name: "Le Marais", area: "3ᵉ & 4ᵉ arr.", coords: "48.8590° N, 2.3620° E" },
      { slug: "ile-de-la-cite", name: "Île de la Cité", area: "Notre-Dame", coords: "48.8530° N, 2.3499° E" },
      { slug: "montmartre", name: "Montmartre", area: "Sacré-Cœur · 18ᵉ", coords: "48.8867° N, 2.3431° E" },
      { slug: "la-defense", name: "La Défense", area: "Grande Arche", coords: "48.8920° N, 2.2362° E" },
    ],
  },
  {
    slug: "new-york",
    name: "New York",
    available: true,
    locations: [
      { slug: "midtown", name: "Midtown", area: "Empire State", coords: "40.7484° N, 73.9857° W" },
      { slug: "central-park-south", name: "Central Park South", area: "Billionaires' Row", coords: "40.7661° N, 73.9797° W" },
      { slug: "financial-district", name: "Financial District", area: "Wall St · One WTC", coords: "40.7074° N, 74.0113° W" },
      { slug: "dumbo", name: "DUMBO", area: "Brooklyn Bridge", coords: "40.7033° N, 73.9894° W" },
      { slug: "times-square", name: "Times Square", area: "Theater District", coords: "40.7580° N, 73.9855° W" },
    ],
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    available: true,
    locations: [
      { slug: "shibuya", name: "Shibuya", area: "Scramble Crossing", coords: "35.6595° N, 139.7005° E" },
      { slug: "shinjuku", name: "Shinjuku", area: "West towers", coords: "35.6938° N, 139.7034° E" },
      { slug: "roppongi", name: "Roppongi", area: "Tokyo Tower view", coords: "35.6628° N, 139.7315° E" },
      { slug: "asakusa", name: "Asakusa", area: "Sensō-ji", coords: "35.7148° N, 139.7967° E" },
      { slug: "ginza", name: "Ginza", area: "Chūō shopping mile", coords: "35.6717° N, 139.7650° E" },
    ],
  },
  { slug: "hong-kong", name: "Hong Kong", available: false, locations: [] },
  { slug: "singapore", name: "Singapore", available: false, locations: [] },
  { slug: "dubai", name: "Dubai", available: false, locations: [] },
  { slug: "chicago", name: "Chicago", available: false, locations: [] },
  { slug: "sydney", name: "Sydney", available: false, locations: [] },
  { slug: "san-francisco", name: "San Francisco", available: false, locations: [] },
];

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
};
