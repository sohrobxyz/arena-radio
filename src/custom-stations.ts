import { type Station } from "./radio-stations";

// User-added stations live in localStorage so they survive reloads without a backend.
const STORAGE_KEY = "arena-radio:custom-stations";

export function loadCustomStations(): Station[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is Station =>
        s && typeof s.slug === "string" && typeof s.name === "string"
    );
  } catch {
    return [];
  }
}

function save(stations: Station[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
  } catch {
    /* quota / private mode — fail silently, custom stations just won't persist */
  }
}

// Add a station, replacing any existing one with the same slug. Returns the new list.
export function addCustomStation(station: Station): Station[] {
  const next = [...loadCustomStations().filter(s => s.slug !== station.slug), station];
  save(next);
  return next;
}

export function removeCustomStation(slug: string): Station[] {
  const next = loadCustomStations().filter(s => s.slug !== slug);
  save(next);
  return next;
}
