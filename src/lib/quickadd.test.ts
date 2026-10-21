import { describe, expect, it } from 'vitest';
import { parseQuick } from './quickadd';

// Monday 2026-10-19, 10:40 local.
const NOW = new Date(2026, 9, 19, 10, 40).getTime();
const p = (text: string) => parseQuick(text, NOW, 640);
const TODAY = '2026-10-19';

describe('parseQuick — the headline examples', () => {
  it('Gym 5pm 45m', () => {
    expect(p('Gym 5pm 45m')).toMatchObject({ title: 'Gym', date: TODAY, start: 17 * 60, hasTime: true, duration: 45, recurrence: null, anytime: false });
  });

  it('Lunch 12:30 for 45 mins', () => {
    expect(p('Lunch 12:30 for 45 mins')).toMatchObject({ title: 'Lunch', date: TODAY, start: 12 * 60 + 30, duration: 45 });
  });

  it('Call mom tomorrow 6pm', () => {
    expect(p('Call mom tomorrow 6pm')).toMatchObject({ title: 'Call mom', date: '2026-10-20', start: 18 * 60, duration: null });
  });

  it('Meds every day 8am — past time stays today', () => {
    expect(p('Meds every day 8am')).toMatchObject({
      title: 'Meds',
      date: TODAY,
      start: 8 * 60,
      recurrence: { freq: 'daily', interval: 1 },
    });
  });

  it('Standup weekdays 9:30 15m', () => {
    expect(p('Standup weekdays 9:30 15m')).toMatchObject({
      title: 'Standup',
      date: TODAY,
      start: 9 * 60 + 30,
      duration: 15,
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] },
    });
  });

  it('Team sync every mon and thu 2-3pm', () => {
    expect(p('Team sync every mon and thu 2-3pm')).toMatchObject({
      title: 'Team sync',
      date: TODAY,
      start: 14 * 60,
      duration: 60,
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 4] },
    });
  });

  it('Deep work 9-11:30am', () => {
    expect(p('Deep work 9-11:30am')).toMatchObject({ title: 'Deep work', start: 9 * 60, duration: 150 });
  });

  it('Read 3 chapters — bare numbers are not times', () => {
    expect(p('Read 3 chapters')).toEqual({
      title: 'Read 3 chapters',
      date: TODAY,
      start: null,
      hasTime: false,
      duration: null,
      recurrence: null,
      anytime: false,
      alarm: false,
      tokens: [],
    });
  });

  it('Pay rent monthly', () => {
    expect(p('Pay rent monthly')).toMatchObject({ title: 'Pay rent', date: TODAY, start: null, recurrence: { freq: 'monthly', interval: 1 } });
  });

  it('Dentist on fri at 3', () => {
    expect(p('Dentist on fri at 3')).toMatchObject({ title: 'Dentist', date: '2026-10-23', start: 15 * 60 });
  });

  it('Return parcel later', () => {
    const r = p('Return parcel later');
    expect(r).toMatchObject({ title: 'Return parcel', date: null, start: null, hasTime: false });
    expect(r.tokens).toEqual([[14, 19, 'later']]);
  });

  it('Water plants anytime', () => {
    expect(p('Water plants anytime')).toMatchObject({ title: 'Water plants', date: TODAY, start: null, hasTime: false, anytime: true });
  });

  it('Walk tonight', () => {
    expect(p('Walk tonight')).toMatchObject({ title: 'Walk', date: TODAY, start: 20 * 60, hasTime: true });
  });

  it('Write essay in 3 days 1h30', () => {
    expect(p('Write essay in 3 days 1h30')).toMatchObject({ title: 'Write essay', date: '2026-10-22', start: null, duration: 90 });
  });

  it('Yoga every other day 7am 30m', () => {
    expect(p('Yoga every other day 7am 30m')).toMatchObject({
      title: 'Yoga',
      start: 7 * 60,
      duration: 30,
      recurrence: { freq: 'daily', interval: 2 },
    });
  });

  it('Swim 2pm to 3:30pm', () => {
    expect(p('Swim 2pm to 3:30pm')).toMatchObject({ title: 'Swim', start: 14 * 60, duration: 90 });
  });

  it('Coffee at noon', () => {
    expect(p('Coffee at noon')).toMatchObject({ title: 'Coffee', date: TODAY, start: 12 * 60 });
  });

  it('Sleep midnight — the coming midnight', () => {
    expect(p('Sleep midnight')).toMatchObject({ title: 'Sleep', date: '2026-10-20', start: 0, hasTime: true });
  });
});

describe('times', () => {
  it.each([
    ['Tea 5 pm', 17 * 60],
    ['Tea 5:30pm', 17 * 60 + 30],
    ['Tea 5 p.m.', 17 * 60],
    ['Tea 12am', 0],
    ['Tea 17:30', 17 * 60 + 30],
    ['Tea 07:30', 7 * 60 + 30],
    ['Tea at 5', 17 * 60],
    ['Tea at 7', 19 * 60],
    ['Tea at 8', 8 * 60],
    ['Tea at 11', 11 * 60],
    ['Tea at 12', 12 * 60],
    ['Tea @7', 19 * 60],
    ['Tea 3:15', 15 * 60 + 15],
    ['Tea at midday', 12 * 60],
    ['Tea in the morning', 9 * 60],
    ['Tea this afternoon', 14 * 60],
    ['Tea evening', 18 * 60],
  ])('%s → %i', (text, start) => {
    expect(p(text)).toMatchObject({ title: 'Tea', start, hasTime: true });
  });

  it('ranges inherit am/pm from the end and stay under 12h', () => {
    expect(p('Meeting from 2 to 4pm')).toMatchObject({ title: 'Meeting', start: 14 * 60, duration: 120 });
    expect(p('Meeting 9:30–11')).toMatchObject({ start: 9 * 60 + 30, duration: 90 });
    expect(p('Meeting 11-1pm')).toMatchObject({ start: 11 * 60, duration: 120 });
    expect(p('Party 11pm-1am')).toMatchObject({ start: 23 * 60, duration: 120 });
    expect(p('Read pages 10-20')).toMatchObject({ title: 'Read pages 10-20', start: null });
  });

  it('part-of-day words flip a guessed hour', () => {
    expect(p('Call tonight at 9')).toMatchObject({ title: 'Call', start: 21 * 60 });
    expect(p('Run tomorrow morning at 7')).toMatchObject({ title: 'Run', date: '2026-10-20', start: 7 * 60 });
    expect(p('Pack bag tomorrow night')).toMatchObject({ title: 'Pack bag', date: '2026-10-20', start: 20 * 60 });
  });

  it('"in 2 hours" is relative to now', () => {
    expect(p('Stretch in 2 hours')).toMatchObject({ title: 'Stretch', date: TODAY, start: 640 + 120, duration: null });
    expect(parseQuick('Stretch in 3 hours', NOW, 23 * 60)).toMatchObject({ date: '2026-10-20', start: 2 * 60 });
  });

  it('leaves ambiguous words in the title when they open it', () => {
    expect(p('Morning pages')).toMatchObject({ title: 'Morning pages', start: null });
    expect(p('Midnight snack')).toMatchObject({ title: 'Midnight snack', start: null });
    expect(p('Movie night')).toMatchObject({ title: 'Movie night', start: null });
    expect(p('Get some sun')).toMatchObject({ title: 'Get some sun', date: TODAY });
  });
});

describe('durations', () => {
  it.each([
    ['45 min', 45],
    ['45 mins', 45],
    ['1h', 60],
    ['1.5h', 90],
    ['1h30', 90],
    ['1h 30m', 90],
    ['90 minutes', 90],
    ['2 hours', 120],
    ['2 hrs 15 mins', 135],
    ['for 30m', 30],
    ['for half an hour', 30],
    ['an hour', 60],
    ['an hour and a half', 90],
  ])('Plank %s → %i', (dur, minutes) => {
    expect(p(`Plank ${dur}`)).toMatchObject({ title: 'Plank', duration: minutes, start: null });
  });
});

describe('dates', () => {
  it.each([
    ['Gym today', TODAY],
    ['Gym tmr', '2026-10-20'],
    ['Gym tmrw', '2026-10-20'],
    ['Gym fri', '2026-10-23'],
    ['Gym on friday', '2026-10-23'],
    ['Gym this fri', '2026-10-23'],
    ['Gym next fri', '2026-10-30'],
    ['Gym next monday', '2026-10-26'],
    ['Gym next sunday', '2026-11-01'],
    ['Gym on sun', '2026-10-25'],
    ['Gym sat', '2026-10-24'],
    ['Gym mon', '2026-10-26'], // today, but no time → strictly after today
    ['Gym this mon', TODAY],
    ['Gym in 2 weeks', '2026-11-02'],
    ['Gym in a week', '2026-10-26'],
    ['Gym later today', TODAY],
  ])('%s → %s', (text, date) => {
    expect(p(text)).toMatchObject({ title: 'Gym', date });
  });

  it('a weekday counts as today only when its time is still ahead', () => {
    expect(p('Gym mon 5pm').date).toBe(TODAY);
    expect(p('Gym mon 9am').date).toBe('2026-10-26');
  });

  it('later / someday / sometime / no date go to the Later tray and drop the time', () => {
    for (const w of ['someday', 'sometime', 'no date']) expect(p(`Paint fence ${w}`)).toMatchObject({ title: 'Paint fence', date: null });
    expect(p('Call bank later 3pm')).toMatchObject({ date: null, start: null, hasTime: false });
  });
});

describe('recurrence', () => {
  it.each([
    ['daily', { freq: 'daily', interval: 1 }],
    ['everyday', { freq: 'daily', interval: 1 }],
    ['every 2 days', { freq: 'daily', interval: 2 }],
    ['weekly', { freq: 'weekly', interval: 1 }],
    ['every week', { freq: 'weekly', interval: 1 }],
    ['every 2 weeks', { freq: 'weekly', interval: 2 }],
    ['every month', { freq: 'monthly', interval: 1 }],
    ['yearly', { freq: 'yearly', interval: 1 }],
    ['every year', { freq: 'yearly', interval: 1 }],
  ])('Review %s', (text, rule) => {
    const r = p(`Review ${text}`);
    expect(r).toMatchObject({ title: 'Review', date: TODAY });
    expect(r.recurrence).toEqual(rule);
  });

  it('weekday lists anchor on the first matching day from today', () => {
    expect(p('Piano every mon, wed, fri')).toMatchObject({ title: 'Piano', date: TODAY, recurrence: { freq: 'weekly', byWeekday: [1, 3, 5] } });
    expect(p('Hike weekends')).toMatchObject({ title: 'Hike', date: '2026-10-24', recurrence: { freq: 'weekly', byWeekday: [0, 6] } });
    expect(p('Bins every thursday')).toMatchObject({ title: 'Bins', date: '2026-10-22', recurrence: { byWeekday: [4] } });
    expect(p('Report every weekday 4pm')).toMatchObject({ title: 'Report', start: 16 * 60, recurrence: { byWeekday: [1, 2, 3, 4, 5] } });
  });

  it('"every week on fri" anchors on that Friday', () => {
    expect(p('Review every week on fri')).toMatchObject({ title: 'Review', date: '2026-10-23', recurrence: { freq: 'weekly', interval: 1 } });
  });

  it('"every morning" is daily at 9', () => {
    expect(p('Meds every morning')).toMatchObject({ title: 'Meds', start: 9 * 60, recurrence: { freq: 'daily', interval: 1 } });
  });
});

describe('tokens and title', () => {
  it('reports understood spans, sorted, including consumed connectors', () => {
    const text = 'Call mom tomorrow at 6pm for 20 min';
    const r = p(text);
    expect(r.tokens.map(([a, b, k]) => [text.slice(a, b), k])).toEqual([
      ['tomorrow', 'date'],
      ['at 6pm', 'time'],
      ['for 20 min', 'duration'],
    ]);
    expect(p('Gym 5pm 45m').tokens).toEqual([
      [4, 7, 'time'],
      [8, 11, 'duration'],
    ]);
    const rep = 'Team sync every mon and thu 2-3pm';
    expect(p(rep).tokens.map(([a, b, k]) => [rep.slice(a, b), k])).toEqual([
      ['every mon and thu', 'repeat'],
      ['2-3pm', 'time'],
    ]);
  });

  it('cleans up punctuation, dashes and case', () => {
    expect(p('- buy milk, tomorrow, 5pm.').title).toBe('Buy milk');
    expect(p('Lunch, tomorrow, with Sam').title).toBe('Lunch, with Sam');
    expect(p('gym - 5pm - legs').title).toBe('Gym - legs');
    expect(p('  dinner   (tomorrow)  ').title).toBe('Dinner');
    expect(p('GYM TOMORROW 5PM')).toMatchObject({ title: 'GYM', date: '2026-10-20', start: 17 * 60 });
  });

  it('never throws on garbage', () => {
    for (const junk of ['', '   ', '!!!', '@@@ 99:99 at', '25:00-26:00', 'every every every', '1h30h30', '\u0000\u{1F600}']) {
      expect(() => p(junk)).not.toThrow();
    }
    expect(p('')).toMatchObject({ title: '', date: TODAY, start: null, tokens: [] });
    expect(p('@@@ 99:99 at')).toMatchObject({ start: null, duration: null });
    expect(parseQuick(undefined as unknown as string, NOW, 640).title).toBe('');
  });
});

describe('parseQuick — alarms', () => {
  // NOW is Monday 10:40.
  const TOMORROW = '2026-10-20';

  it('alarm at 7am: a block that rings, tomorrow because 7am has gone', () => {
    expect(p('alarm at 7am')).toMatchObject({ title: 'Alarm', date: TOMORROW, start: 7 * 60, alarm: true });
  });

  it('wake me at 6:30: a wake-up is in the morning', () => {
    expect(p('wake me at 6:30')).toMatchObject({ title: 'Wake up', date: TOMORROW, start: 6 * 60 + 30, alarm: true });
    expect(p('Wake me up at 6 tomorrow')).toMatchObject({ title: 'Wake up', date: TOMORROW, start: 6 * 60, alarm: true });
  });

  it('a bare hour is the next one that comes', () => {
    expect(p('Alarm at 7')).toMatchObject({ date: TODAY, start: 19 * 60, alarm: true });
    expect(p('Alarm at 11')).toMatchObject({ date: TODAY, start: 11 * 60, alarm: true });
    expect(p('Alarm at 10')).toMatchObject({ date: TODAY, start: 22 * 60, alarm: true });
  });

  it('a time still ahead stays today', () => {
    expect(p('set an alarm for 11:15 stretch')).toMatchObject({ title: 'Stretch', date: TODAY, start: 11 * 60 + 15, alarm: true });
    expect(p('Gym 6pm with an alarm')).toMatchObject({ title: 'Gym', date: TODAY, start: 18 * 60, alarm: true });
  });

  it('repeats keep their rule', () => {
    expect(p('Wake me every weekday at 6:30')).toMatchObject({ title: 'Wake up', start: 6 * 60 + 30, alarm: true, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] } });
  });

  it('needs a time to ring', () => {
    expect(p('alarm tomorrow')).toMatchObject({ title: 'Alarm', date: TOMORROW, start: null, alarm: false });
  });

  it('"alarm" inside a title is just a word', () => {
    expect(p('Check smoke alarm batteries 5pm')).toMatchObject({ title: 'Check smoke alarm batteries', start: 17 * 60, alarm: false });
    expect(p('Gym 5pm 45m').alarm).toBe(false);
  });

  it('marks the words it understood', () => {
    const text = 'set an alarm for 6:30 run';
    expect(p(text).tokens.map(([a, b, k]) => [text.slice(a, b), k])).toEqual([
      ['set an alarm for', 'alarm'],
      ['6:30', 'time'],
    ]);
  });
});
