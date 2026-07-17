/**
 * Option lists for the intake form. Edit freely — values are stored as plain
 * text in the CSV, so changing a list never breaks existing records.
 */

/** Racket type/series per brand — the form only offers types of the chosen brand. */
export const RACKET_TYPES_BY_BRAND: Record<string, readonly string[]> = {
  Yonex: [
    "Astrox",
    "Nanoflare",
    "Arcsaber",
    "Duora",
    "Voltric",
    "Nanoray",
    "Muscle Power",
    "Carbonex",
  ],
  Victor: [
    "Thruster",
    "Auraspeed",
    "Jetspeed",
    "DriveX",
    "Brave Sword",
    "Hypernano X",
    "Meteor X",
  ],
  "Li-Ning": [
    "Axforce",
    "Bladex",
    "Halbertec",
    "Tectonic",
    "Aeronaut",
    "Windstorm",
    "Turbo Charging",
  ],
  Apacs: ["Feather Weight", "Lethal", "Z-Ziggler", "Virtuoso", "Nano Fusion"],
  Mizuno: ["Fortius", "Altius", "Acrospeed", "Caliber"],
  Felet: ["TJ Power", "The Legend", "Woven"],
};

export const RACKET_BRANDS: readonly string[] = Object.keys(RACKET_TYPES_BY_BRAND);

/** Types for a brand; empty for unknown/custom brands (form falls back to free text). */
export function racketTypesForBrand(brand: string): readonly string[] {
  return RACKET_TYPES_BY_BRAND[brand] ?? [];
}

export const COLORS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
] as const;

export const STRING_TYPES = [
  "Yonex BG65",
  "Yonex BG65 Ti",
  "Yonex BG66 Ultimax",
  "Yonex BG80",
  "Yonex BG80 Power",
  "Yonex Exbolt 63",
  "Yonex Exbolt 65",
  "Yonex Aerobite",
  "Yonex Nanogy 98",
  "Victor VBS-63",
  "Victor VBS-66N",
  "Victor VBS-70",
  "Li-Ning No.1",
] as const;

/** Sensible tension bounds used only for form validation hints. */
export const TENSION_RANGE = { Kg: { min: 8, max: 16 }, Lbs: { min: 17, max: 36 } };
