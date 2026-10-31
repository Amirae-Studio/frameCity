// Bambu Studio project settings for exported 3MF files.
//
// Bambu Studio only treats a 3MF as a project (plates, per-part filaments)
// when it carries a complete Metadata/project_settings.config. The files in
// public/bambu/ were written by Bambu Studio itself from its system presets:
// "<printer> 0.4 nozzle", "0.20mm Standard" and "Bambu PLA Basic", with one
// filament. `perFilament` lists the settings Bambu repeats once per filament,
// which is how it writes projects with more than one.

export type BambuProfile = { config: Record<string, unknown>; perFilament: string[] };

const cache = new Map<string, Promise<BambuProfile>>();

export function loadBambuProfile(printerId: string): Promise<BambuProfile> {
  let p = cache.get(printerId);
  if (!p) {
    p = fetch(`/bambu/${encodeURIComponent(printerId)}.json`).then((r) => {
      if (!r.ok) throw new Error(`No Bambu profile for printer "${printerId}"`);
      return r.json() as Promise<BambuProfile>;
    });
    cache.set(printerId, p);
    p.catch(() => cache.delete(printerId));
  }
  return p;
}

/** The printer's bed from its profile, in millimetres. */
export function profileBed(profile: BambuProfile): [number, number] {
  const area = profile.config.printable_area as string[] | undefined;
  const far = area?.[2]?.split("x").map(Number);
  return far && far.length === 2 && far.every(Number.isFinite) ? [far[0], far[1]] : [256, 256];
}

/** project_settings.config for `colours.length` filaments in these colours. */
export function projectSettings(
  profile: BambuProfile,
  colours: string[],
  tower?: { towerX: string[]; towerY: string[]; towerWidth: number }
): string {
  const n = Math.max(1, colours.length);
  const cfg: Record<string, unknown> = { ...profile.config };
  for (const k of profile.perFilament) {
    const v = profile.config[k] as unknown[];
    cfg[k] = Array.from({ length: n }, () => v).flat();
  }
  cfg.filament_self_index = Array.from({ length: n }, (_, i) => String(i + 1));
  cfg.different_settings_to_system = Array(n + 2).fill("");
  cfg.inherits_group = Array(n + 2).fill("");
  cfg.filament_colour = colours.length ? colours : ["#FFFFFF"];
  // Purge volumes between filaments: an N × N matrix per nozzle (zero on the
  // diagonal) and an unload/load pair per filament. Bambu refuses to slice a
  // multi-colour plate when these don't match the filament count.
  const nozzles = Math.max(1, (profile.config.nozzle_diameter as string[] | undefined)?.length ?? 1);
  const matrix = (profile.config.flush_volumes_matrix as string[] | undefined) ?? [];
  const purge = matrix.find((v) => v !== "0") ?? "280";
  cfg.flush_volumes_matrix = Array.from({ length: nozzles * n * n }, (_, k) => {
    const i = Math.floor((k % (n * n)) / n), j = k % n;
    return i === j ? "0" : purge;
  });
  const vector = (profile.config.flush_volumes_vector as string[] | undefined) ?? [];
  cfg.flush_volumes_vector = Array(2 * n).fill(vector[0] ?? "140");
  if (tower) {
    // One entry per plate, in that plate's own coordinates.
    cfg.wipe_tower_x = tower.towerX;
    cfg.wipe_tower_y = tower.towerY;
    cfg.prime_tower_width = String(+tower.towerWidth.toFixed(2));
    // A tower narrowed to fit beside the model drops its rib walls, which
    // would otherwise reach past the space it was given.
    if (tower.towerWidth < Number(profile.config.prime_tower_width)) cfg.prime_tower_rib_wall = "0";
  }
  return JSON.stringify(cfg, null, 4);
}
