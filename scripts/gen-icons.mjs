// Extracts the icons Daybloom uses from lucide-static (ISC) into a tiny TS module,
// so the bundle carries ~70 paths instead of a whole icon library.
// Run: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const NODES = JSON.parse(readFileSync(new URL('../node_modules/lucide-static/icon-nodes.json', import.meta.url), 'utf8'));

// [id, lucide name, picker group]  — group null = UI-only icon (not offered in the block picker)
const ICONS = [
  // Work & mind
  ['laptop', 'laptop', 'Work'], ['briefcase', 'briefcase', 'Work'], ['code', 'code-xml', 'Work'],
  ['mail', 'mail', 'Work'], ['phone', 'phone', 'Work'], ['video', 'video', 'Work'],
  ['pen', 'pen-line', 'Work'], ['target', 'target', 'Work'], ['brain', 'brain', 'Work'],
  ['lightbulb', 'lightbulb', 'Work'], ['presentation', 'presentation', 'Work'], ['wallet', 'wallet', 'Work'],
  // Care
  ['pill', 'pill', 'Care'], ['droplet', 'droplet', 'Care'], ['utensils', 'utensils', 'Care'],
  ['coffee', 'coffee', 'Care'], ['apple', 'apple', 'Care'], ['shower', 'shower-head', 'Care'],
  ['heart', 'heart', 'Care'], ['stethoscope', 'stethoscope', 'Care'], ['smile', 'smile', 'Care'],
  ['bath', 'bath', 'Care'],
  // Home & errands
  ['house', 'house', 'Home'], ['sparkles', 'sparkles', 'Home'], ['shirt', 'shirt', 'Home'],
  ['cart', 'shopping-cart', 'Home'], ['chef', 'chef-hat', 'Home'], ['car', 'car', 'Home'],
  ['bus', 'bus', 'Home'], ['plant', 'sprout', 'Home'], ['paw', 'paw-print', 'Home'],
  ['baby', 'baby', 'Home'], ['trash', 'trash-2', 'Home'], ['package', 'package', 'Home'],
  // People
  ['users', 'users', 'People'], ['message', 'message-circle', 'People'], ['gift', 'gift', 'People'],
  ['party', 'party-popper', 'People'], ['handshake', 'handshake', 'People'],
  // Rest & play
  ['moon', 'moon', 'Rest'], ['bed', 'bed', 'Rest'], ['sun', 'sun', 'Rest'], ['sunrise', 'sunrise', 'Rest'],
  ['music', 'music', 'Rest'], ['headphones', 'headphones', 'Rest'], ['gamepad', 'gamepad-2', 'Rest'],
  ['tv', 'tv', 'Rest'], ['palette', 'palette', 'Rest'], ['leaf', 'leaf', 'Rest'], ['wind', 'wind', 'Rest'],
  // Learn
  ['book-open', 'book-open', 'Learn'], ['graduation', 'graduation-cap', 'Learn'], ['languages', 'languages', 'Learn'],
  ['library', 'library', 'Learn'], ['notebook', 'notebook-pen', 'Learn'],
  // Move
  ['footprints', 'footprints', 'Move'], ['dumbbell', 'dumbbell', 'Move'], ['bike', 'bike', 'Move'],
  ['activity', 'activity', 'Move'], ['mountain', 'mountain', 'Move'], ['waves', 'waves', 'Move'],
  // UI
  ['plus', 'plus', null], ['check', 'check', null], ['x', 'x', null], ['chevron-left', 'chevron-left', null],
  ['chevron-right', 'chevron-right', null], ['chevron-down', 'chevron-down', null], ['repeat', 'repeat', null],
  ['bell', 'bell', null], ['bell-off', 'bell-off', null], ['settings', 'settings-2', null], ['clock', 'clock', null],
  ['calendar', 'calendar', null], ['inbox', 'inbox', null], ['trash-ui', 'trash-2', null], ['pin', 'pin', null],
  ['picture', 'picture-in-picture-2', null], ['volume', 'volume-2', null], ['volume-off', 'volume-x', null],
  ['play', 'play', null], ['pause', 'pause', null], ['skip', 'skip-forward', null], ['rotate', 'rotate-ccw', null],
  ['arrow-right', 'arrow-right', null], ['move-later', 'calendar-arrow-down', null], ['grip', 'grip-vertical', null],
  ['focus', 'scan', null], ['eye', 'eye', null], ['list', 'list-checks', null], ['dial', 'circle-gauge', null],
  ['external', 'external-link', null], ['refresh', 'refresh-cw', null], ['google', 'mail', null],
  ['link', 'link', null], ['globe', 'globe', null], ['search', 'search', null], ['wand', 'wand-sparkles', null],
  ['undo', 'undo-2', null], ['copy', 'copy', null], ['corner', 'corner-down-left', null],
  ['chart', 'chart-no-axes-column', null], ['trophy', 'trophy', null], ['flag', 'flag', null], ['zap', 'zap', null],
  ['battery-low', 'battery-low', null], ['battery-medium', 'battery-medium', null], ['battery-full', 'battery-full', null],
  ['hourglass', 'hourglass', null], ['archive', 'archive', null], ['filter', 'list-filter', null], ['sort', 'arrow-up-down', null],
  ['calendar-clock', 'calendar-clock', null], ['star', 'star', null], ['alarm', 'alarm-clock', null], ['hand', 'hand', null],
  ['medal', 'medal', null], ['rocket', 'rocket', null], ['sunset', 'sunset', null], ['brain-dump', 'notebook-pen', null],
  ['timer', 'timer', null], ['circle-dashed', 'circle-dashed', null], ['circle-check', 'circle-check', null],
  ['trend-up', 'trending-up', null], ['flame', 'flame', null], ['bed-rest', 'bed-double', null], ['shuffle', 'shuffle', null], ['wand-sparkles', 'wand-sparkles', null], ['maximize', 'maximize-2', null], ['minimize', 'minimize-2', null], ['more', 'ellipsis', null],
  ['mic', 'mic', null], ['mic-off', 'mic-off', null], ['audio-lines', 'audio-lines', null], ['monitor', 'monitor', null],
  ['panel-top', 'panel-top', null], ['panel-bottom', 'panel-bottom', null], ['panel-left', 'panel-left', null], ['panel-right', 'panel-right', null],
  ['scan', 'scan', null], ['gauge', 'gauge', null], ['square', 'square', null], ['sparkle', 'sparkle', null], ['layers', 'layers', null],
  ['eye-off', 'eye-off', null], ['shield', 'shield-check', null], ['puzzle', 'puzzle', null], ['receipt', 'receipt', null],
  ['file-text', 'file-text', null], ['download', 'download', null], ['dollar', 'circle-dollar-sign', null], ['folder', 'folder', null],
  ['building', 'building-2', null], ['printer', 'printer', null], ['tag', 'tag', null], ['percent', 'percent', null], ['user', 'user', null],
  ['plug', 'plug', null], ['app-window', 'app-window', null], ['chart-pie', 'chart-pie', null], ['chart-column', 'chart-column', null],
  ['badge-check', 'badge-check', null], ['timer-reset', 'timer-reset', null], ['pointer', 'mouse-pointer-2', null], ['coins', 'coins', null],
  ['terminal', 'terminal', null], ['key', 'key-round', null], ['sliders', 'sliders-horizontal', null], ['calendar-plus', 'calendar-plus', null], ['bot', 'bot', null],
  ['arrow-up', 'arrow-up', null], ['info', 'info', null], ['lock', 'lock', null], ['cpu', 'cpu', null], ['cloud', 'cloud', null], ['audio-lines', 'audio-lines', null], ['message-square', 'message-square-text', null],
  // Timeline views, world clock, alarms, the AI hub.
  ['columns', 'columns-3', null], ['chart-gantt', 'chart-gantt', null], ['kanban', 'square-kanban', null], ['rows', 'rows-3', null],
  ['bell-ring', 'bell-ring', null], ['alarm-check', 'alarm-clock-check', null], ['alarm-off', 'alarm-clock-off', null],
  ['earth', 'earth', null], ['sun-moon', 'sun-moon', null], ['map-pin', 'map-pin', null],
  ['brain-circuit', 'brain-circuit', null], ['ear', 'ear', null], ['speech', 'speech', null], ['route', 'route', null], ['server', 'server', null],
  ['chevron-up', 'chevron-up', null], ['arrow-left', 'arrow-left', null], ['layout-grid', 'layout-grid', null], ['calendar-range', 'calendar-range', null],
  ['move-horizontal', 'move-horizontal', null], ['zoom-in', 'zoom-in', null], ['zoom-out', 'zoom-out', null], ['check-check', 'check-check', null],
  ['hand-heart', 'hand-heart', null], ['heart-handshake', 'heart-handshake', null], ['thumbs-up', 'thumbs-up', null], ['send', 'send', null],
  ['circle-play', 'circle-play', null], ['power', 'power', null], ['pencil', 'pencil', null], ['orbit', 'orbit', null], ['headset', 'headset', null],
  ['sliders-vertical', 'sliders-vertical', null], ['circle-dot', 'circle-dot', null], ['footprints-ui', 'footprints', null],
  ['calendar-days', 'calendar-days', null],
];

// Aliased icons are absent from icon-nodes.json; read their SVG instead.
function fromSvg(name) {
  const svg = readFileSync(new URL(`../node_modules/lucide-static/icons/${name}.svg`, import.meta.url), 'utf8');
  const body = svg.replace(/<!--.*?-->/gs, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return [...body.matchAll(/<(\w+)([^>]*?)\/?>/g)].map(([, tag, attrs]) => [
    tag,
    Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  ]);
}

// Daybloom's own icons, drawn on Lucide's 24-unit grid with its stroke style.
const CUSTOM = {
  // Waqt: a mihrab (the prayer niche), so it never reads as the dark-mode moon.
  mihrab: [
    ['path', { d: 'M5 21v-9.6C5 7.6 8.2 4.6 12 2.5c3.8 2.1 7 5.1 7 8.9V21' }],
    ['path', { d: 'M9.2 21v-6.3c0-1.7 1.2-3.1 2.8-4.1 1.6 1 2.8 2.4 2.8 4.1V21' }],
    ['path', { d: 'M3 21h18' }],
  ],
};

const out = {};
const groups = {};
for (const [id, name, group] of ICONS) {
  const nodes = NODES[name] ?? fromSvg(name);
  out[id] = nodes;
  if (group) (groups[group] ??= []).push(id);
}
Object.assign(out, CUSTOM);

const ts = `// Generated by scripts/gen-icons.mjs from lucide-static (ISC License, © Lucide Icons and Contributors),
// plus a few of Daybloom's own.
// Do not edit by hand.

export type IconNode = [tag: string, attrs: Record<string, string | number>];

export const ICON_NODES: Record<string, IconNode[]> = ${JSON.stringify(out)};

/** Icons offered in the block icon picker, grouped. */
export const ICON_GROUPS: Record<string, string[]> = ${JSON.stringify(groups, null, 2)};
`;
writeFileSync(new URL('../src/lib/icons.generated.ts', import.meta.url), ts);
console.log(`wrote ${Object.keys(out).length} icons`);
