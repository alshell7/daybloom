// Spoken → written. Recognisers write what they hear ("five p m", "forty five minutes",
// "half past seven"); the quick-add grammar and the assistant read "5pm", "45 minutes",
// "7:30". This only rewrites numbers next to time words, so titles keep their words.

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, ninety: 90 };

const ONE = Object.keys(ONES).filter((w) => w !== 'oh').join('|');
const TEN = Object.keys(TENS).join('|');
/** "seven", "twenty five", "twenty-five", "45" */
const NUM = `(?:\\d{1,3}|(?:${TEN})(?:[\\s-](?:${ONE}))?|${ONE})`;
const UNIT = '(?:minutes?|mins?|hours?|hrs?|h|m|o\'?clock|am|pm|a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|(?:an?|at)\\s+m)';

/** "twenty five" → 25; digits pass through; null when it isn't a number. */
export function wordsToNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(/[\s-]+/);
  if (parts.length === 1) return ONES[parts[0]] ?? TENS[parts[0]] ?? null;
  if (parts.length === 2 && TENS[parts[0]] != null && ONES[parts[1]] != null && ONES[parts[1]] < 10) return TENS[parts[0]] + ONES[parts[1]];
  return null;
}

const num = (s: string) => String(wordsToNumber(s) ?? s);

export function normalizeSpoken(raw: string): string {
  let s = ` ${raw.replace(/\s+/g, ' ').trim()} `;

  // Fillers and wake words at the start.
  s = s.replace(/^\s*(?:(?:um+|uh+|erm|so|okay|ok|hey|hi)\b[,\s]*)+/i, ' ');
  s = s.replace(/^\s*(?:hey\s+)?daybloom\b[,\s]*/i, ' ');
  // "Ad yoga…" is almost always "Add yoga…".
  s = s.replace(/^\s*ad\b/i, ' Add');

  // Durations in words.
  s = s.replace(/\ban hour and a half\b/gi, '90 minutes');
  s = s.replace(/\bhalf an hour\b/gi, '30 minutes');
  s = s.replace(/\ba quarter of an hour\b/gi, '15 minutes');
  s = s.replace(/\ban hour\b/gi, '1 hour');
  s = s.replace(new RegExp(`\\b(${NUM}) and a half hours?\\b`, 'gi'), (_m, n) => `${Number(num(n)) * 60 + 30} minutes`);

  // Clock phrases.
  s = s.replace(new RegExp(`\\bhalf past (${NUM})\\b`, 'gi'), (_m, h) => `${num(h)}:30`);
  s = s.replace(new RegExp(`\\b(at|from|until|to|by) (${NUM}) and a half\\b`, 'gi'), (_m, p, h) => `${p} ${num(h)}:30`);
  s = s.replace(new RegExp(`\\b(at|from|until|to|by) half (${ONE})\\b`, 'gi'), (_m, p, h) => `${p} ${num(h)}:30`);
  s = s.replace(new RegExp(`\\bquarter past (${NUM})\\b`, 'gi'), (_m, h) => `${num(h)}:15`);
  s = s.replace(new RegExp(`\\bquarter to (${NUM})\\b`, 'gi'), (_m, h) => {
    const n = Number(num(h));
    return Number.isFinite(n) ? `${n === 1 ? 12 : n - 1}:45` : _m;
  });
  // "seven thirty", "nine fifteen" right after at/from/until/to/by: hours and minutes.
  s = s.replace(new RegExp(`\\b(at|from|until|till|to|by|around) (${ONE}) (${TEN}(?:[\\s-](?:${ONE}))?|fifteen|forty five|oh (?:${ONE}))\\b`, 'gi'), (_m, p, h, m) => {
    const hh = wordsToNumber(h);
    const mm = wordsToNumber(String(m).replace(/^oh /i, ''));
    return hh != null && mm != null && hh <= 12 && mm < 60 ? `${p} ${hh}:${String(mm).padStart(2, '0')}` : _m;
  });

  // Numbers next to time words, or after at/for/in/by.
  s = s.replace(new RegExp(`\\b(${NUM})(?=\\s*${UNIT}\\b)`, 'gi'), (m) => num(m));
  s = s.replace(new RegExp(`\\b(at|for|in|by|from|until|till|around) (${NUM})\\b`, 'gi'), (_m, p, n) => `${p} ${num(n)}`);

  // Meridians: "5 p m", "5 p.m.", "5 P.M.", and the misheard "5 an M" / "5 at M".
  s = s.replace(/\b(\d{1,2}(?::\d{2})?)\s*(?:a\.?\s?m\.?|an? m\b|at m\b)(?=\W|$)/gi, '$1am');
  s = s.replace(/\b(\d{1,2}(?::\d{2})?)\s*p\.?\s?m\.?(?=\W|$)/gi, '$1pm');
  s = s.replace(/\b(\d{1,2}) o'?clock\b/gi, '$1:00');
  // A misheard "at" right before a time.
  s = s.replace(/\b(?:would|add|out|that)\s+(?=\d{1,2}(?::\d{2})?(?:am|pm)\b)/gi, 'at ');

  return s.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
}
