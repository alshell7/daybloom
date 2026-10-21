import { clsx, type ClassValue } from 'clsx';

/** Class names joined (clsx). Components here avoid conflicting defaults, so no merge step. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** The site's base path ("/daybloom/"), for files in public/. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
