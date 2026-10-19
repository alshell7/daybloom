// Places for Waqt: a built-in list (no lookup service, so where you are never leaves this
// computer), with the method and Asr school most used in each country as a starting point.

import type { MethodId, Madhab } from './types';

export interface Place {
  name: string;
  /** ISO 3166 code. */
  country: string;
  lat: number;
  lng: number;
  tz: string;
}

// [name, country, lat, lng, tz]
const RAW: [string, string, number, number, string][] = [
  // South Asia
  ['Delhi', 'IN', 28.6139, 77.209, 'Asia/Kolkata'],
  ['Mumbai', 'IN', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Hyderabad', 'IN', 17.385, 78.4867, 'Asia/Kolkata'],
  ['Bengaluru', 'IN', 12.9716, 77.5946, 'Asia/Kolkata'],
  ['Chennai', 'IN', 13.0827, 80.2707, 'Asia/Kolkata'],
  ['Kolkata', 'IN', 22.5726, 88.3639, 'Asia/Kolkata'],
  ['Lucknow', 'IN', 26.8467, 80.9462, 'Asia/Kolkata'],
  ['Ahmedabad', 'IN', 23.0225, 72.5714, 'Asia/Kolkata'],
  ['Pune', 'IN', 18.5204, 73.8567, 'Asia/Kolkata'],
  ['Jaipur', 'IN', 26.9124, 75.7873, 'Asia/Kolkata'],
  ['Bhopal', 'IN', 23.2599, 77.4126, 'Asia/Kolkata'],
  ['Patna', 'IN', 25.5941, 85.1376, 'Asia/Kolkata'],
  ['Srinagar', 'IN', 34.0837, 74.7973, 'Asia/Kolkata'],
  ['Kozhikode', 'IN', 11.2588, 75.7804, 'Asia/Kolkata'],
  ['Kochi', 'IN', 9.9312, 76.2673, 'Asia/Kolkata'],
  ['Aurangabad', 'IN', 19.8762, 75.3433, 'Asia/Kolkata'],
  ['Hubli', 'IN', 15.3647, 75.124, 'Asia/Kolkata'],
  ['Mangaluru', 'IN', 12.9141, 74.856, 'Asia/Kolkata'],
  ['Karachi', 'PK', 24.8607, 67.0011, 'Asia/Karachi'],
  ['Lahore', 'PK', 31.5204, 74.3587, 'Asia/Karachi'],
  ['Islamabad', 'PK', 33.6844, 73.0479, 'Asia/Karachi'],
  ['Peshawar', 'PK', 34.0151, 71.5249, 'Asia/Karachi'],
  ['Faisalabad', 'PK', 31.4504, 73.135, 'Asia/Karachi'],
  ['Dhaka', 'BD', 23.8103, 90.4125, 'Asia/Dhaka'],
  ['Chittagong', 'BD', 22.3569, 91.7832, 'Asia/Dhaka'],
  ['Kabul', 'AF', 34.5553, 69.2075, 'Asia/Kabul'],
  ['Colombo', 'LK', 6.9271, 79.8612, 'Asia/Colombo'],
  ['Malé', 'MV', 4.1755, 73.5093, 'Indian/Maldives'],
  ['Kathmandu', 'NP', 27.7172, 85.324, 'Asia/Kathmandu'],
  // Arabian Peninsula and the Gulf
  ['Mecca', 'SA', 21.4225, 39.8262, 'Asia/Riyadh'],
  ['Medina', 'SA', 24.4672, 39.6111, 'Asia/Riyadh'],
  ['Riyadh', 'SA', 24.7136, 46.6753, 'Asia/Riyadh'],
  ['Jeddah', 'SA', 21.4858, 39.1925, 'Asia/Riyadh'],
  ['Dammam', 'SA', 26.4207, 50.0888, 'Asia/Riyadh'],
  ['Dubai', 'AE', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Abu Dhabi', 'AE', 24.4539, 54.3773, 'Asia/Dubai'],
  ['Sharjah', 'AE', 25.3463, 55.4209, 'Asia/Dubai'],
  ['Doha', 'QA', 25.2854, 51.531, 'Asia/Qatar'],
  ['Kuwait City', 'KW', 29.3759, 47.9774, 'Asia/Kuwait'],
  ['Manama', 'BH', 26.2285, 50.586, 'Asia/Bahrain'],
  ['Muscat', 'OM', 23.588, 58.3829, 'Asia/Muscat'],
  ['Sana’a', 'YE', 15.3694, 44.191, 'Asia/Aden'],
  // Levant, Iraq, Iran, Turkey
  ['Amman', 'JO', 31.9539, 35.9106, 'Asia/Amman'],
  ['Jerusalem', 'PS', 31.7683, 35.2137, 'Asia/Jerusalem'],
  ['Gaza', 'PS', 31.5017, 34.4668, 'Asia/Gaza'],
  ['Beirut', 'LB', 33.8938, 35.5018, 'Asia/Beirut'],
  ['Damascus', 'SY', 33.5138, 36.2765, 'Asia/Damascus'],
  ['Baghdad', 'IQ', 33.3152, 44.3661, 'Asia/Baghdad'],
  ['Erbil', 'IQ', 36.1911, 44.0092, 'Asia/Baghdad'],
  ['Tehran', 'IR', 35.6892, 51.389, 'Asia/Tehran'],
  ['Mashhad', 'IR', 36.2605, 59.6168, 'Asia/Tehran'],
  ['Istanbul', 'TR', 41.0082, 28.9784, 'Europe/Istanbul'],
  ['Ankara', 'TR', 39.9334, 32.8597, 'Europe/Istanbul'],
  ['Konya', 'TR', 37.8746, 32.4932, 'Europe/Istanbul'],
  // Africa
  ['Cairo', 'EG', 30.0444, 31.2357, 'Africa/Cairo'],
  ['Alexandria', 'EG', 31.2001, 29.9187, 'Africa/Cairo'],
  ['Khartoum', 'SD', 15.5007, 32.5599, 'Africa/Khartoum'],
  ['Tripoli', 'LY', 32.8872, 13.1913, 'Africa/Tripoli'],
  ['Tunis', 'TN', 36.8065, 10.1815, 'Africa/Tunis'],
  ['Algiers', 'DZ', 36.7538, 3.0588, 'Africa/Algiers'],
  ['Casablanca', 'MA', 33.5731, -7.5898, 'Africa/Casablanca'],
  ['Rabat', 'MA', 34.0209, -6.8416, 'Africa/Casablanca'],
  ['Dakar', 'SN', 14.7167, -17.4677, 'Africa/Dakar'],
  ['Lagos', 'NG', 6.5244, 3.3792, 'Africa/Lagos'],
  ['Kano', 'NG', 12.0022, 8.592, 'Africa/Lagos'],
  ['Abuja', 'NG', 9.0765, 7.3986, 'Africa/Lagos'],
  ['Accra', 'GH', 5.6037, -0.187, 'Africa/Accra'],
  ['Mogadishu', 'SO', 2.0469, 45.3182, 'Africa/Mogadishu'],
  ['Addis Ababa', 'ET', 8.9806, 38.7578, 'Africa/Addis_Ababa'],
  ['Nairobi', 'KE', -1.2921, 36.8219, 'Africa/Nairobi'],
  ['Mombasa', 'KE', -4.0435, 39.6682, 'Africa/Nairobi'],
  ['Dar es Salaam', 'TZ', -6.7924, 39.2083, 'Africa/Dar_es_Salaam'],
  ['Zanzibar', 'TZ', -6.1659, 39.2026, 'Africa/Dar_es_Salaam'],
  ['Johannesburg', 'ZA', -26.2041, 28.0473, 'Africa/Johannesburg'],
  ['Cape Town', 'ZA', -33.9249, 18.4241, 'Africa/Johannesburg'],
  ['Durban', 'ZA', -29.8587, 31.0218, 'Africa/Johannesburg'],
  // Central Asia and the Caucasus
  ['Tashkent', 'UZ', 41.2995, 69.2401, 'Asia/Tashkent'],
  ['Samarkand', 'UZ', 39.627, 66.975, 'Asia/Samarkand'],
  ['Almaty', 'KZ', 43.222, 76.8512, 'Asia/Almaty'],
  ['Astana', 'KZ', 51.1694, 71.4491, 'Asia/Almaty'],
  ['Bishkek', 'KG', 42.8746, 74.5698, 'Asia/Bishkek'],
  ['Dushanbe', 'TJ', 38.5598, 68.787, 'Asia/Dushanbe'],
  ['Baku', 'AZ', 40.4093, 49.8671, 'Asia/Baku'],
  // East and Southeast Asia, Oceania
  ['Kuala Lumpur', 'MY', 3.139, 101.6869, 'Asia/Kuala_Lumpur'],
  ['Penang', 'MY', 5.4164, 100.3327, 'Asia/Kuala_Lumpur'],
  ['Singapore', 'SG', 1.3521, 103.8198, 'Asia/Singapore'],
  ['Jakarta', 'ID', -6.2088, 106.8456, 'Asia/Jakarta'],
  ['Surabaya', 'ID', -7.2575, 112.7521, 'Asia/Jakarta'],
  ['Bandung', 'ID', -6.9175, 107.6191, 'Asia/Jakarta'],
  ['Makassar', 'ID', -5.1477, 119.4327, 'Asia/Makassar'],
  ['Bandar Seri Begawan', 'BN', 4.9031, 114.9398, 'Asia/Brunei'],
  ['Manila', 'PH', 14.5995, 120.9842, 'Asia/Manila'],
  ['Cotabato', 'PH', 7.2236, 124.2464, 'Asia/Manila'],
  ['Bangkok', 'TH', 13.7563, 100.5018, 'Asia/Bangkok'],
  ['Pattani', 'TH', 6.8691, 101.2501, 'Asia/Bangkok'],
  ['Beijing', 'CN', 39.9042, 116.4074, 'Asia/Shanghai'],
  ['Ürümqi', 'CN', 43.8256, 87.6168, 'Asia/Urumqi'],
  ['Hong Kong', 'HK', 22.3193, 114.1694, 'Asia/Hong_Kong'],
  ['Tokyo', 'JP', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Seoul', 'KR', 37.5665, 126.978, 'Asia/Seoul'],
  ['Sydney', 'AU', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Melbourne', 'AU', -37.8136, 144.9631, 'Australia/Melbourne'],
  ['Perth', 'AU', -31.9505, 115.8605, 'Australia/Perth'],
  ['Auckland', 'NZ', -36.8485, 174.7633, 'Pacific/Auckland'],
  // Europe
  ['London', 'GB', 51.5074, -0.1278, 'Europe/London'],
  ['Birmingham', 'GB', 52.4862, -1.8904, 'Europe/London'],
  ['Manchester', 'GB', 53.4808, -2.2426, 'Europe/London'],
  ['Bradford', 'GB', 53.796, -1.7594, 'Europe/London'],
  ['Leicester', 'GB', 52.6369, -1.1398, 'Europe/London'],
  ['Glasgow', 'GB', 55.8642, -4.2518, 'Europe/London'],
  ['Dublin', 'IE', 53.3498, -6.2603, 'Europe/Dublin'],
  ['Paris', 'FR', 48.8566, 2.3522, 'Europe/Paris'],
  ['Marseille', 'FR', 43.2965, 5.3698, 'Europe/Paris'],
  ['Lyon', 'FR', 45.764, 4.8357, 'Europe/Paris'],
  ['Brussels', 'BE', 50.8503, 4.3517, 'Europe/Brussels'],
  ['Amsterdam', 'NL', 52.3676, 4.9041, 'Europe/Amsterdam'],
  ['Rotterdam', 'NL', 51.9244, 4.4777, 'Europe/Amsterdam'],
  ['Berlin', 'DE', 52.52, 13.405, 'Europe/Berlin'],
  ['Hamburg', 'DE', 53.5511, 9.9937, 'Europe/Berlin'],
  ['Munich', 'DE', 48.1351, 11.582, 'Europe/Berlin'],
  ['Frankfurt', 'DE', 50.1109, 8.6821, 'Europe/Berlin'],
  ['Cologne', 'DE', 50.9375, 6.9603, 'Europe/Berlin'],
  ['Vienna', 'AT', 48.2082, 16.3738, 'Europe/Vienna'],
  ['Zurich', 'CH', 47.3769, 8.5417, 'Europe/Zurich'],
  ['Geneva', 'CH', 46.2044, 6.1432, 'Europe/Zurich'],
  ['Copenhagen', 'DK', 55.6761, 12.5683, 'Europe/Copenhagen'],
  ['Stockholm', 'SE', 59.3293, 18.0686, 'Europe/Stockholm'],
  ['Oslo', 'NO', 59.9139, 10.7522, 'Europe/Oslo'],
  ['Helsinki', 'FI', 60.1699, 24.9384, 'Europe/Helsinki'],
  ['Madrid', 'ES', 40.4168, -3.7038, 'Europe/Madrid'],
  ['Barcelona', 'ES', 41.3874, 2.1686, 'Europe/Madrid'],
  ['Lisbon', 'PT', 38.7223, -9.1393, 'Europe/Lisbon'],
  ['Rome', 'IT', 41.9028, 12.4964, 'Europe/Rome'],
  ['Milan', 'IT', 45.4642, 9.19, 'Europe/Rome'],
  ['Athens', 'GR', 37.9838, 23.7275, 'Europe/Athens'],
  ['Sarajevo', 'BA', 43.8563, 18.4131, 'Europe/Sarajevo'],
  ['Tirana', 'AL', 41.3275, 19.8187, 'Europe/Tirane'],
  ['Pristina', 'XK', 42.6629, 21.1655, 'Europe/Belgrade'],
  ['Moscow', 'RU', 55.7558, 37.6173, 'Europe/Moscow'],
  ['Kazan', 'RU', 55.7963, 49.1088, 'Europe/Moscow'],
  ['Grozny', 'RU', 43.3178, 45.6949, 'Europe/Moscow'],
  // The Americas
  ['New York', 'US', 40.7128, -74.006, 'America/New_York'],
  ['Washington', 'US', 38.9072, -77.0369, 'America/New_York'],
  ['Philadelphia', 'US', 39.9526, -75.1652, 'America/New_York'],
  ['Dearborn', 'US', 42.3223, -83.1763, 'America/Detroit'],
  ['Chicago', 'US', 41.8781, -87.6298, 'America/Chicago'],
  ['Houston', 'US', 29.7604, -95.3698, 'America/Chicago'],
  ['Dallas', 'US', 32.7767, -96.797, 'America/Chicago'],
  ['Minneapolis', 'US', 44.9778, -93.265, 'America/Chicago'],
  ['Denver', 'US', 39.7392, -104.9903, 'America/Denver'],
  ['Los Angeles', 'US', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['San Francisco', 'US', 37.7749, -122.4194, 'America/Los_Angeles'],
  ['Seattle', 'US', 47.6062, -122.3321, 'America/Los_Angeles'],
  ['Toronto', 'CA', 43.6532, -79.3832, 'America/Toronto'],
  ['Mississauga', 'CA', 43.589, -79.6441, 'America/Toronto'],
  ['Montreal', 'CA', 45.5017, -73.5673, 'America/Toronto'],
  ['Calgary', 'CA', 51.0447, -114.0719, 'America/Edmonton'],
  ['Vancouver', 'CA', 49.2827, -123.1207, 'America/Vancouver'],
  ['Mexico City', 'MX', 19.4326, -99.1332, 'America/Mexico_City'],
  ['São Paulo', 'BR', -23.5505, -46.6333, 'America/Sao_Paulo'],
  ['Buenos Aires', 'AR', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires'],
];

export const PLACES: Place[] = RAW.map(([name, country, lat, lng, tz]) => ({ name, country, lat, lng, tz }));

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', AF: 'Afghanistan', LK: 'Sri Lanka', MV: 'Maldives', NP: 'Nepal',
  SA: 'Saudi Arabia', AE: 'UAE', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', YE: 'Yemen',
  JO: 'Jordan', PS: 'Palestine', LB: 'Lebanon', SY: 'Syria', IQ: 'Iraq', IR: 'Iran', TR: 'Türkiye',
  EG: 'Egypt', SD: 'Sudan', LY: 'Libya', TN: 'Tunisia', DZ: 'Algeria', MA: 'Morocco', SN: 'Senegal', NG: 'Nigeria', GH: 'Ghana',
  SO: 'Somalia', ET: 'Ethiopia', KE: 'Kenya', TZ: 'Tanzania', ZA: 'South Africa',
  UZ: 'Uzbekistan', KZ: 'Kazakhstan', KG: 'Kyrgyzstan', TJ: 'Tajikistan', AZ: 'Azerbaijan',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', BN: 'Brunei', PH: 'Philippines', TH: 'Thailand', CN: 'China', HK: 'Hong Kong',
  JP: 'Japan', KR: 'South Korea', AU: 'Australia', NZ: 'New Zealand',
  GB: 'United Kingdom', IE: 'Ireland', FR: 'France', BE: 'Belgium', NL: 'Netherlands', DE: 'Germany', AT: 'Austria', CH: 'Switzerland',
  DK: 'Denmark', SE: 'Sweden', NO: 'Norway', FI: 'Finland', ES: 'Spain', PT: 'Portugal', IT: 'Italy', GR: 'Greece',
  BA: 'Bosnia', AL: 'Albania', XK: 'Kosovo', RU: 'Russia',
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina',
};
export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

/** The method and Asr school most used where `country` is (a starting point; change it any time). */
export function suggestedFor(country: string | undefined): { method: MethodId; madhab: Madhab } {
  switch (country) {
    case 'IN': case 'PK': case 'BD': case 'AF': case 'LK': case 'MV': case 'NP':
      return { method: 'Karachi', madhab: 'hanafi' };
    case 'SA': case 'YE': case 'BH':
      return { method: 'UmmAlQura', madhab: 'shafi' };
    case 'AE': case 'OM':
      return { method: 'Dubai', madhab: 'shafi' };
    case 'QA':
      return { method: 'Qatar', madhab: 'shafi' };
    case 'KW':
      return { method: 'Kuwait', madhab: 'shafi' };
    case 'EG': case 'SD': case 'LY': case 'JO': case 'PS': case 'LB': case 'SY': case 'IQ':
      return { method: 'Egyptian', madhab: 'shafi' };
    case 'TR': case 'AZ':
      return { method: 'Turkey', madhab: 'hanafi' };
    case 'IR':
      return { method: 'Tehran', madhab: 'shafi' };
    case 'MY': case 'SG': case 'ID': case 'BN': case 'TH': case 'PH':
      return { method: 'Singapore', madhab: 'shafi' };
    case 'US': case 'CA': case 'MX':
      return { method: 'NorthAmerica', madhab: 'shafi' };
    case 'GB': case 'IE':
      return { method: 'MoonsightingCommittee', madhab: 'shafi' };
    case 'UZ': case 'KZ': case 'KG': case 'TJ': case 'BA': case 'AL': case 'XK': case 'RU':
      return { method: 'MuslimWorldLeague', madhab: 'hanafi' };
    default:
      return { method: 'MuslimWorldLeague', madhab: 'shafi' };
  }
}

/** A first guess from the time zone (e.g. Asia/Kolkata → Delhi). */
export function guessPlace(tz: string): Place | null {
  const alias: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Dacca': 'Asia/Dhaka', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Bangkok' };
  const z = alias[tz] ?? tz;
  return PLACES.find((p) => p.tz === z) ?? null;
}

/** Places whose name or country starts with (or contains) the query, best first. */
export function searchPlaces(q: string, limit = 8): Place[] {
  const s = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!s) return [];
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const scored = PLACES.map((p) => {
    const n = norm(p.name);
    const c = norm(countryName(p.country));
    const score = n.startsWith(s) ? 0 : n.includes(s) ? 1 : c.startsWith(s) ? 2 : -1;
    return { p, score };
  }).filter((x) => x.score >= 0);
  return scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}
