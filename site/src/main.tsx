import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The build prerenders the page; the browser paints that HTML first, then hydrates it in the
// next task, so the first paint never waits for script. The dev server renders fresh.
if (root.firstElementChild) requestAnimationFrame(() => setTimeout(() => hydrateRoot(root, app), 0));
else createRoot(root).render(app);
