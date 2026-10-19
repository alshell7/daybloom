import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { windowLabel } from './lib/platform';

// The desktop widget is a transparent window. Opt it out of `color-scheme` before the first
// paint: with "dark", Chromium/WebView2 paints the page canvas dark even under transparent
// html/body, which shows as a black box around the dial on Windows (WKWebView doesn't).
if (windowLabel() !== 'main') {
  document.documentElement.classList.add('widget-mode');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', 'normal');
}

const app = mount(App, { target: document.getElementById('app')! });

export default app;
