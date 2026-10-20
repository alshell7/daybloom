// Waqt (Salah times): shared shapes.

export type PrayerId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: PrayerId[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export type MethodId =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'MoonsightingCommittee'
  | 'NorthAmerica'
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Tehran'
  | 'Turkey';

export const METHODS: { id: MethodId; label: string }[] = [
  { id: 'MuslimWorldLeague', label: 'Muslim World League' },
  { id: 'Karachi', label: 'University of Islamic Sciences, Karachi' },
  { id: 'UmmAlQura', label: 'Umm al-Qura, Makkah' },
  { id: 'Egyptian', label: 'Egyptian General Authority' },
  { id: 'NorthAmerica', label: 'ISNA (North America)' },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee' },
  { id: 'Dubai', label: 'Dubai' },
  { id: 'Kuwait', label: 'Kuwait' },
  { id: 'Qatar', label: 'Qatar' },
  { id: 'Singapore', label: 'Singapore, Malaysia, Indonesia' },
  { id: 'Turkey', label: 'Diyanet (Türkiye)' },
  { id: 'Tehran', label: 'Institute of Geophysics, Tehran' },
];

export type Madhab = 'shafi' | 'hanafi';
export type HighLat = 'auto' | 'middle' | 'seventh' | 'angle';

export interface JamaatRule {
  /** off: no jamaat; after: N minutes after the adhan; at: a fixed time. */
  mode: 'off' | 'after' | 'at';
  after: number;
  /** "HH:MM" */
  at: string;
}

export interface WaqtSettings {
  place: { name: string; country: string; lat: number; lng: number } | null;
  method: MethodId;
  madhab: Madhab;
  highLat: HighLat;
  /** Minutes added to each computed time (mosque timetables differ a little). */
  adjust: Record<PrayerId | 'sunrise', number>;
  /** Fixed adhan times ("HH:MM") that replace the computed ones, e.g. your mosque's. */
  manual: Partial<Record<PrayerId, string>>;
  jamaat: {
    on: boolean;
    rules: Record<PrayerId, JamaatRule>;
    /** Friday: Jumu'ah replaces Dhuhr. */
    jumuah: { on: boolean; at: string; minutes: number };
  };
  /** On the dial and in the day. */
  dial: { track: boolean; blocks: boolean; minutes: number };
  remind: { before: number; atAdhan: boolean; beforeJamaat: number; sound: boolean };
  /** Travelling: Dhuhr, Asr and Isha are marked as qasr (shortened). `until` "YYYY-MM-DD" or "". */
  travel: { on: boolean; until: string };
}

export type Marked = 'prayed' | 'jamaat';

/** More about a marked prayer. Kept beside `prayed`, which older versions read as it was. */
export interface MarkDetail {
  /** Prayed after its time had ended (made up). */
  late?: boolean;
  /** Shortened while travelling. */
  qasr?: boolean;
  /** When it was marked (ms). */
  at?: number;
}

/** How a prayer went, for marking and for analytics. */
export type PrayedHow = 'ontime' | 'jamaat' | 'late';

export interface WaqtFile {
  version: 1;
  settings: WaqtSettings;
  /** Prayers you marked, by day. */
  prayed: Record<string, Partial<Record<PrayerId, Marked>>>;
  /** On time or late, qasr: by day and prayer. */
  detail: Record<string, Partial<Record<PrayerId, MarkDetail>>>;
}

/** The prayers that are shortened while travelling. */
export const QASR: PrayerId[] = ['dhuhr', 'asr', 'isha'];

export const PRAYER_NAME: Record<PrayerId, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
export const PRAYER_ICON: Record<PrayerId, string> = { fajr: 'sunrise', dhuhr: 'sun', asr: 'sun', maghrib: 'sunset', isha: 'moon' };
