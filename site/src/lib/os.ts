export type OS = 'mac' | 'windows' | 'other';

/** The visitor's computer, to put the right download first. Phones and tablets are "other". */
export function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  const ua = nav.userAgent;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)) return 'other';
  // iPadOS reports itself as a Mac; a Mac has no touch screen.
  if (/mac/i.test(platform) && navigator.maxTouchPoints > 1) return 'other';
  if (/mac/i.test(platform) || /Mac OS X/.test(ua)) return 'mac';
  if (/win/i.test(platform) || /Windows/.test(ua)) return 'windows';
  return 'other';
}
