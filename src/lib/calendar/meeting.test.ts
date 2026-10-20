import { describe, expect, it } from 'vitest';
import { mapGoogleEvent } from './google';
import { parseIcs } from './ics';
import { findMeetingLink, initials, linkify, meetingOf, peopleLine, plainText, sortAttendees } from './meeting';

describe('meeting links', () => {
  it('finds Meet, Zoom, Teams and Webex links in words', () => {
    expect(findMeetingLink('Join at https://meet.google.com/abc-defg-hij.')).toEqual({ url: 'https://meet.google.com/abc-defg-hij', label: 'Google Meet' });
    expect(findMeetingLink('Room 4', 'Zoom: https://us02web.zoom.us/j/8123456789?pwd=xyz')?.label).toBe('Zoom');
    expect(findMeetingLink('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=1')?.label).toBe('Microsoft Teams');
    expect(findMeetingLink('https://acme.webex.com/meet/sam')?.label).toBe('Webex');
    expect(findMeetingLink('Office, 3rd floor', 'https://example.com/agenda')).toBeNull();
  });

  it('prefers the link the calendar gave', () => {
    expect(meetingOf({ meetUrl: 'https://meet.google.com/aaa-bbbb-ccc', location: 'https://zoom.us/j/1' })?.label).toBe('Google Meet');
    expect(meetingOf({ location: 'https://zoom.us/j/123' })?.url).toBe('https://zoom.us/j/123');
  });
});

describe('notes and people', () => {
  it('turns calendar HTML into readable text', () => {
    const html = '<p>Agenda:</p><ul><li>Budget &amp; plan</li><li>Q&amp;A</li></ul>Docs: <a href="https://docs.example.com/x">the doc</a><br>Thanks&nbsp;all';
    expect(plainText(html)).toBe('Agenda:\n\n• Budget & plan\n• Q&A\nDocs: the doc (https://docs.example.com/x)\nThanks all');
    expect(plainText('a'.repeat(50), 10)).toBe('aaaaaaaaa…');
  });

  it('splits links out for clicking', () => {
    expect(linkify('See https://x.com/a, then go.')).toEqual([{ text: 'See ' }, { text: 'https://x.com/a', href: 'https://x.com/a' }, { text: ', then go.' }]);
  });

  it('orders people and names them kindly', () => {
    const list = sortAttendees([
      { name: 'Zed', status: 'declined' },
      { email: 'amy@x.com', status: 'needsAction' },
      { name: 'Bo Chen', status: 'accepted' },
      { name: 'Org Person', organizer: true, status: 'accepted' },
    ]);
    expect(list.map((a) => a.name ?? a.email)).toEqual(['Org Person', 'Bo Chen', 'amy@x.com', 'Zed']);
    expect(initials({ name: 'Bo Chen' })).toBe('BC');
    expect(initials({ email: 'amy@x.com' })).toBe('A');
    expect(peopleLine(list)).toBe('4 people · 2 coming');
  });
});

describe('providers keep meeting details', () => {
  const cal = { id: 'primary', name: 'Work', color: '#4285f4', enabled: true };
  it('maps Google Meet, notes and attendees', () => {
    const ev = mapGoogleEvent(
      {
        id: 'e1',
        summary: 'Sync',
        start: { dateTime: '2026-10-20T10:00:00Z' },
        end: { dateTime: '2026-10-20T10:30:00Z' },
        description: 'Agenda<br>1. Plans',
        hangoutLink: 'https://meet.google.com/old-link-xyz',
        conferenceData: { conferenceSolution: { name: 'Google Meet' }, entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] },
        attendees: [
          { email: 'me@x.com', self: true, responseStatus: 'accepted' },
          { email: 'sam@x.com', displayName: 'Sam', responseStatus: 'tentative', organizer: true },
          { email: 'room@x.com', resource: true },
        ],
      },
      'google:1',
      cal,
    )!;
    expect(ev.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(ev.meetLabel).toBe('Google Meet');
    expect(ev.description).toBe('Agenda\n1. Plans');
    expect(ev.attendees).toEqual([
      { email: 'me@x.com', status: 'accepted', self: true },
      { name: 'Sam', email: 'sam@x.com', status: 'tentative', organizer: true },
    ]);
  });

  it('reads DESCRIPTION, ATTENDEE, ORGANIZER and the Google conference field from ICS', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:x1',
      'SUMMARY:Planning',
      'DTSTART:20261020T100000Z',
      'DTEND:20261020T110000Z',
      'DESCRIPTION:Bring notes\\nJoin: https://zoom.us/j/999',
      'ORGANIZER;CN=Amy:mailto:amy@x.com',
      'ATTENDEE;CN=Amy;PARTSTAT=ACCEPTED:mailto:amy@x.com',
      'ATTENDEE;CN=Bo;PARTSTAT=NEEDS-ACTION:mailto:bo@x.com',
      'ATTENDEE;CUTYPE=ROOM;CN=Room 4:mailto:room@x.com',
      'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [o] = parseIcs(ics, { startMs: Date.UTC(2026, 9, 19), endMs: Date.UTC(2026, 9, 22) }).events;
    expect(o.description).toBe('Bring notes\nJoin: https://zoom.us/j/999');
    expect(o.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(o.attendees).toEqual([
      { name: 'Amy', email: 'amy@x.com', status: 'accepted', organizer: true },
      { name: 'Bo', email: 'bo@x.com', status: 'needsAction' },
    ]);
  });
});
