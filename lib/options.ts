/**
 * Option lists for the intake form. Edit freely — values are stored as plain
 * text in the CSV, so changing a list never breaks existing records.
 */

export const RACKET_BRANDS = [
  "Yonex",
  "Victor",
  "Li-Ning",
  "Apacs",
  "Mizuno",
  "Felet",
] as const;

export const RACKET_TYPES = [
  "Astrox",
  "Nanoflare",
  "Arcsaber",
  "Duora",
  "Voltric",
  "Nanoray",
  "Auraspeed",
  "Thruster",
  "Brave Sword",
  "Jetspeed",
  "Axforce",
  "Bladex",
  "Halbertec",
] as const;

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
