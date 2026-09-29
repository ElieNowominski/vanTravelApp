export type AmenityFlags = {
  free: boolean | null;
  water: boolean | null;
  power: boolean | null;
  toilets: boolean | null;
  shower: boolean | null;
  dump: boolean | null;
};

const EMPTY: AmenityFlags = {
  free: null,
  water: null,
  power: null,
  toilets: null,
  shower: null,
  dump: null,
};

function osmFlag(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  const s = String(value).toLowerCase().trim();
  if (["yes", "true", "1", "ok", "designated", "limited", "customers"].includes(s)) return true;
  if (["no", "false", "0", "none", "private"].includes(s)) return false;
  return null;
}

function yesish(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const s = String(value).toLowerCase().trim();
  if (["yes", "true", "y", "1", "free"].includes(s)) return true;
  if (["no", "false", "n", "0"].includes(s)) return false;
  return null;
}

function facilitiesText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(String).join(" ");
  if (typeof value === "object") return Object.values(value).map(String).join(" ");
  return String(value);
}

export function amenitiesFromOsm(tags: Record<string, unknown>): AmenityFlags {
  const fee = osmFlag(tags.fee);
  return {
    free: fee == null ? null : !fee,
    water: osmFlag(tags.drinking_water) ?? osmFlag(tags.water_point),
    power: osmFlag(tags.electricity) ?? osmFlag(tags.power_supply),
    toilets: osmFlag(tags.toilets),
    shower: osmFlag(tags.shower),
    dump:
      osmFlag(tags.sanitary_dump_station) ??
      osmFlag(tags.dump_station) ??
      (tags.amenity === "sanitary_dump_station" ? true : null),
  };
}

export function amenitiesFromDoc(props: Record<string, unknown>): AmenityFlags {
  const facilities = facilitiesText(props.facilities).toLowerCase();
  const powered = Number(props.numberOfPoweredSites ?? 0);
  return {
    free: yesish(props.free),
    water: facilities.match(/water|tap|drinking/) ? true : null,
    power: powered > 0 ? true : facilities.match(/power|electric/) ? true : null,
    toilets: facilities.match(/toilet/) ? true : null,
    shower: facilities.match(/shower/) ? true : null,
    dump: facilities.match(/dump|waste.?water|dump.?station/) ? true : null,
  };
}

export function amenitiesFromProperties(
  props: GeoJSON.GeoJsonProperties | null | undefined,
): AmenityFlags {
  if (!props) return EMPTY;
  if (props.source === "OSM" || props.tourism || props.amenity === "sanitary_dump_station") {
    return amenitiesFromOsm(props);
  }
  return amenitiesFromDoc(props);
}

export type AmenityChip = { label: string; ok: boolean };

/** Puces à afficher dans une popup : rendu par `PlacePopup` (React), pas en HTML assemblé. */
export function amenityChips(flags: AmenityFlags): AmenityChip[] {
  const chips: AmenityChip[] = [];
  if (flags.free === true) chips.push({ label: "Gratuit", ok: true });
  if (flags.free === false) chips.push({ label: "Payant", ok: false });
  if (flags.water === true) chips.push({ label: "Eau", ok: true });
  if (flags.power === true) chips.push({ label: "Électricité", ok: true });
  if (flags.toilets === true) chips.push({ label: "Toilettes", ok: true });
  if (flags.shower === true) chips.push({ label: "Douche", ok: true });
  if (flags.dump === true) chips.push({ label: "Dump station", ok: true });
  return chips;
}

export function amenitySummary(flags: AmenityFlags): string {
  const parts: string[] = [];
  if (flags.free === true) parts.push("gratuit");
  if (flags.free === false) parts.push("payant");
  if (flags.water === true) parts.push("eau");
  if (flags.power === true) parts.push("électricité");
  if (flags.toilets === true) parts.push("toilettes");
  if (flags.shower === true) parts.push("douche");
  if (flags.dump === true) parts.push("dump");
  return parts.join(" · ");
}
