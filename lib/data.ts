export type City = {
  name: string;
  img: string | null;
  price?: string;
};

export const cities: City[] = [
  { name: "Paris", img: "/paris-frame.jpg" },
  { name: "London", img: "/london-preview.jpg" },
  { name: "New York", img: null },
  { name: "Tokyo", img: null },
  { name: "Hong Kong", img: null },
  { name: "Singapore", img: null },
  { name: "Dubai", img: null },
  { name: "Chicago", img: null },
  { name: "Sydney", img: null },
  { name: "San Francisco", img: null },
];

export const marqueeNames = [
  "London",
  "Paris",
  "New York",
  "Tokyo",
  "Hong Kong",
  "Singapore",
  "Dubai",
  "Chicago",
  "Sydney",
  "San Francisco",
];

export type Step = { no: string; title: string; body: string };

export const steps: Step[] = [
  {
    no: "01",
    title: "Data as a reference",
    body: "We pull real map data for your district only to get the footprints and proportions right — never as the finished model.",
  },
  {
    no: "02",
    title: "Modelled by hand",
    body: "Our team rebuilds most buildings by hand so each one is print-ready, clean-edged and true to how the city actually looks.",
  },
  {
    no: "03",
    title: "Tested & framed",
    body: "Every part is test-printed until it holds, then set into a solid wood frame and sealed to last for decades.",
  },
];

export const filmStages = [
  { no: "01", label: "Planned", body: "Districts mapped and laid out" },
  { no: "02", label: "Modelled", body: "Buildings shaped by hand" },
  { no: "03", label: "Tested", body: "Every part test-printed" },
];

export type Accent = { value: string; rgb: string; label: string };

export const accents: Accent[] = [
  { value: "#c79366", rgb: "199, 147, 102", label: "Bronze" },
  { value: "#8a94a6", rgb: "138, 148, 166", label: "Slate" },
  { value: "#9c8f7a", rgb: "156, 143, 122", label: "Sand" },
  { value: "#b06a4a", rgb: "176, 106, 74", label: "Terracotta" },
];

