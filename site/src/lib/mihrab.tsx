// Waqt's icon in the app: a mihrab, the prayer niche (from the app's scripts/gen-icons.mjs),
// drawn on Lucide's grid so it matches the other icons.
import { createLucideIcon } from 'lucide-react';

export const Mihrab = createLucideIcon('mihrab', [
  ['path', { d: 'M5 21v-9.6C5 7.6 8.2 4.6 12 2.5c3.8 2.1 7 5.1 7 8.9V21', key: 'outer' }],
  ['path', { d: 'M9.2 21v-6.3c0-1.7 1.2-3.1 2.8-4.1 1.6 1 2.8 2.4 2.8 4.1V21', key: 'inner' }],
  ['path', { d: 'M3 21h18', key: 'floor' }],
]);
