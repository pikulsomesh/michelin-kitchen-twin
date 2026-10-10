// Lighting and mood. computeLook() turns the studio's look settings plus the season into one plain
// object any renderer can apply (the scene contract, see docs/studio.md):
//   sun      { azimuthDeg (from north, clockwise), elevationDeg, color, intensity }   real solar position
//   sky      { top, horizon, ground }                                                  hex colours
//   interior { kelvin, color, intensity }                                              kitchen LED field
//   accent   { kelvin, color, intensity }                                              heat lamps, candles
//   exposure, haze (0..1), weather, precipitation (0..1), season, foliage, blossom, groundColor, candles
import { SEASON_FACTS } from './catalog.js';

export const MOODS = {
  service: { label: 'Full service', blurb: 'Bright, even 4000 K kitchen light, a little steam in the air.', look: { hour: 19.5, kelvin: 4000, brightness: 1, warmth: 0.5, exposure: 1, haze: 0.12, candles: true } },
  golden: { label: 'Golden hour', blurb: 'The first seating, low sun raking across the garden.', look: { hour: 'sunset-0.6', kelvin: 3500, brightness: 0.85, warmth: 0.7, exposure: 1.05, haze: 0.2, candles: true } },
  candlelit: { label: 'Candlelit dining', blurb: 'Late seating, the room down to candles and warm pin spots.', look: { hour: 21.25, kelvin: 2700, brightness: 0.55, warmth: 1, exposure: 1.1, haze: 0.08, candles: true } },
  morning: { label: 'Morning prep', blurb: 'Deliveries and mise en place in cool daylight.', look: { hour: 9, kelvin: 5000, brightness: 0.9, warmth: 0.2, exposure: 0.95, haze: 0.04, candles: false } },
  afterhours: { label: 'After hours', blurb: 'Kitchen scrubbed down, a few lights left on.', look: { hour: 23.75, kelvin: 4300, brightness: 0.35, warmth: 0.2, exposure: 1.15, haze: 0.02, candles: false } },
  editorial: { label: 'Editorial', blurb: 'Photo-shoot light: high key, neutral, no haze.', look: { hour: 15, kelvin: 5200, brightness: 1.25, warmth: 0.3, exposure: 1.1, haze: 0, candles: false } },
};

export const WEATHER = { auto: 'Season default', clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Valley fog', snow: 'Snow' };

const LAT = 38.4; // Yountville
const LON = -122.36;
const rad = Math.PI / 180;

/** Clock hour for a mood's hour, resolving 'sunset-0.6' against the season. */
export function resolveHour(hour, season) {
  if (typeof hour === 'number') return hour;
  const m = /^sunset([+-][\d.]+)?$/.exec(hour ?? '');
  if (!m) return 19.5;
  const [h, mm] = SEASON_FACTS[season].sunset.split(':').map(Number);
  return h + mm / 60 + Number(m[1] ?? 0);
}

/** Solar position for a local clock hour on the season's reference day (NOAA low-precision model). */
export function sunPosition(hour, season) {
  const f = SEASON_FACTS[season];
  const n = f.dayOfYear;
  const g = (2 * Math.PI / 365) * (n - 1 + (hour - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tz = f.dst ? -7 : -8;
  const solarMin = hour * 60 + eqTime + 4 * LON - 60 * tz;
  const ha = (solarMin / 4 - 180) * rad;
  const lat = LAT * rad;
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen))))) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { azimuthDeg: az, elevationDeg: 90 - zen / rad };
}

/** Black-body colour temperature to sRGB hex (Tanner Helland's fit, 1000 K to 40000 K). */
export function kelvinToHex(k) {
  const t = Math.max(1000, Math.min(40000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

const mix = (a, b, t) => {
  t = Math.max(0, Math.min(1, t));
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [x, y] = [ch(a), ch(b)];
  return (Math.round(x[0] + (y[0] - x[0]) * t) << 16) | (Math.round(x[1] + (y[1] - x[1]) * t) << 8) | Math.round(x[2] + (y[2] - x[2]) * t);
};
const scale = (c, s) => mix(0, c, s);

export function computeLook(lookIn, season) {
  const look = { ...MOODS.service.look, ...lookIn };
  const f = SEASON_FACTS[season];
  const hour = resolveHour(look.hour, season);
  const sun = sunPosition(hour, season);
  const weather = look.weather && look.weather !== 'auto' ? look.weather : f.weather;
  const cloud = { clear: 0, overcast: 0.85, rain: 0.95, fog: 0.6, snow: 0.9 }[weather] ?? 0;
  const el = sun.elevationDeg;
  const day = Math.max(0, Math.min(1, (el + 6) / 12));        // 0 at civil dusk, 1 once the sun is 6° up
  const low = Math.max(0, Math.min(1, 1 - (el - 2) / 18));     // 1 near the horizon, 0 above 20°

  // sun colour runs from ~1900 K at the horizon to ~5600 K high up; clouds wash it toward grey
  const sunK = 1900 + (5600 - 1900) * Math.max(0, Math.min(1, el / 35));
  const sunColor = mix(kelvinToHex(sunK), 0xc9ced6, cloud * 0.7);
  // a low sun is redder, not much dimmer, through clear valley air: keep golden hour bright enough to rake
  const sunIntensity = el <= 0 ? 0 : 3.2 * (0.35 + 0.65 * Math.sin(Math.min(90, el) * rad) ** 0.6) * Math.min(1, el / 1.5) * (1 - cloud * 0.8);

  const dayTop = mix(0x3f7fd0, 0x8d99a8, cloud), dayHorizon = mix(0xbcd6ee, 0xc4c9cf, cloud);
  const duskTop = 0x2a3360, duskHorizon = mix(0xf09a55, 0x8a7f86, cloud);
  const nightTop = 0x05070d, nightHorizon = 0x111726;
  const top = day >= 1 ? mix(dayTop, duskTop, low * 0.6) : mix(nightTop, duskTop, day);
  const horizon = day >= 1 ? mix(dayHorizon, duskHorizon, low * 0.85) : mix(nightHorizon, duskHorizon, day);

  const interiorK = look.kelvin;
  const accentK = 2200 + 1000 * (1 - look.warmth);
  const fogDensity = { fog: 0.55, rain: 0.25, snow: 0.3 }[weather] ?? 0;

  return {
    hour, season, weather, cloud,
    sun: { ...sun, color: sunColor, intensity: +sunIntensity.toFixed(3), kelvin: Math.round(sunK) },
    moon: el < -4 ? { color: 0x8fa3c8, intensity: 0.12 * (1 - cloud * 0.7) } : null,
    sky: { top, horizon, ground: scale(f.ground, 0.25 + 0.75 * day) },
    interior: { kelvin: interiorK, color: kelvinToHex(interiorK), intensity: look.brightness },
    accent: { kelvin: Math.round(accentK), color: kelvinToHex(accentK), intensity: 0.4 + 0.8 * look.warmth },
    candles: !!look.candles,
    exposure: look.exposure,
    haze: Math.min(1, look.haze + fogDensity),
    precipitation: weather === 'rain' || weather === 'snow' ? 1 : 0,
    foliage: weather === 'snow' ? mix(f.foliage, 0xf4f6f8, 0.55) : f.foliage,
    blossom: f.blossom,
    groundColor: weather === 'snow' ? 0xe9edf1 : f.ground,
    daylight: day,
  };
}
