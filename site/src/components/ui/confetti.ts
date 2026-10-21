// Adapted from Magic UI's Confetti (MIT, magicui.design/docs/components/confetti), which wraps
// canvas-confetti (ISC). Changed for Daybloom: a plain function, loaded only on the first burst,
// in the seven block colours, and silent under reduced motion.

const COLORS = ['#3D6FE3', '#25976A', '#D99A06', '#DB4F94', '#8670E6', '#138FA6', '#EA6A2A'];

export async function burst(from: Element | null) {
  if (!from || document.documentElement.dataset.motion === 'calm') return;
  const r = from.getBoundingClientRect();
  const { default: confetti } = await import('canvas-confetti');
  const origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  const base = { origin, colors: COLORS, disableForReducedMotion: true, zIndex: 80, scalar: 0.9, ticks: 140 };
  void confetti({ ...base, particleCount: 46, spread: 64, startVelocity: 34 });
  void confetti({ ...base, particleCount: 22, spread: 110, startVelocity: 22, shapes: ['circle'] });
}
