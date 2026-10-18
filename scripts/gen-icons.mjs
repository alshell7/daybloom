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

const out = {};
const groups = {};
for (const [id, name, group] of ICONS) {
  const nodes = NODES[name] ?? fromSvg(name);
  out[id] = nodes;
  if (group) (groups[group] ??= []).push(id);
}

const ts = `// Generated by scripts/gen-icons.mjs from lucide-static (ISC License, © Lucide Icons and Contributors).
// Do not edit by hand.

export type IconNode = [tag: string, attrs: Record<string, string | number>];

export const ICON_NODES: Record<string, IconNode[]> = ${JSON.stringify(out)};

/** Icons offered in the block icon picker, grouped. */
export const ICON_GROUPS: Record<string, string[]> = ${JSON.stringify(groups, null, 2)};
`;
writeFileSync(new URL('../src/lib/icons.generated.ts', import.meta.url), ts);
console.log(`wrote ${Object.keys(out).length} icons`);
