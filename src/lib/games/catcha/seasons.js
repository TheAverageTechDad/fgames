/**
 * The seasonal calendar: which celebrations are on for a date. Pure (tests/seasons.test.mjs).
 * Windows repeat every year; Easter moves, so its window is worked out from Easter Sunday.
 *
 *   activeSeasons({ now, search: location.search, enabled })  // e.g. ["halloween"]
 *   ?season=halloween   force one on (any day, even with the Settings switch off)
 *   ?season=off         none
 *   ?date=2026-12-24    pretend it's that day (tests the windows)
 */
export const SEASONS = [
  { id: "valentines", name: "Valentine's", from: "02-10", to: "02-15" },
  { id: "easter", name: "Easter", easter: [-7, 1] }, // Palm Sunday to Easter Monday
  { id: "halloween", name: "Halloween", from: "10-15", to: "11-01" },
  { id: "christmas", name: "Christmas", from: "12-01", to: "01-06" },
  { id: "newyear", name: "New Year", from: "12-31", to: "01-01" },
];

/** Easter Sunday (Gregorian, the anonymous / Meeus algorithm) as a local Date. */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const md = (date) => (date.getMonth() + 1) * 100 + date.getDate(); // 10-31 → 1031
const parseMd = (s) => Number(s.slice(0, 2)) * 100 + Number(s.slice(3));

/** Is `season` on for `date`? Windows that cross New Year (12-01 → 01-06) wrap. */
export function seasonOn(season, date) {
  if (season.easter) {
    const sunday = easterSunday(date.getFullYear());
    const day = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - sunday) / 864e5);
    return day >= season.easter[0] && day <= season.easter[1];
  }
  const now = md(date), from = parseMd(season.from), to = parseMd(season.to);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

/** Every season on for this visit, in calendar order. */
export function activeSeasons({ now = new Date(), search = "", enabled = true } = {}) {
  const params = new URLSearchParams(search);
  const forced = params.get("season");
  if (forced === "off") return [];
  if (forced && SEASONS.some((s) => s.id === forced)) return [forced];
  const fakeDate = params.get("date");
  if (fakeDate && /^\d{4}-\d{2}-\d{2}$/.test(fakeDate)) { const [y, m, d] = fakeDate.split("-").map(Number); now = new Date(y, m - 1, d); }
  if (!enabled) return [];
  return SEASONS.filter((s) => seasonOn(s, now)).map((s) => s.id);
}
