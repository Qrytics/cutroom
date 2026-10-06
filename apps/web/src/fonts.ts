// Bundled fonts so the preview and headless export render text identically, offline.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/syne/400.css';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/unbounded/400.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/900.css';
import '@fontsource/sora/400.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/800.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/900.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/700-italic.css';
import '@fontsource/anton/400.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import '@fontsource/major-mono-display/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import { FONTS } from '@cutroom/core';

/** Force-load every bundled face (canvas text does not trigger font loading by itself). */
export async function loadFonts() {
  const weights = [400, 500, 600, 700, 800, 900];
  await Promise.all(FONTS.filter((f) => !['system-ui', 'Georgia', 'Helvetica'].includes(f)).flatMap((f) =>
    weights.map((w) => document.fonts.load(`${w} 40px "${f}"`).catch(() => [])),
  ));
  await Promise.all(['Inter', 'Fraunces', 'Instrument Serif', 'DM Serif Display', 'Playfair Display'].map((f) => document.fonts.load(`italic 400 40px "${f}"`).catch(() => [])));
  await document.fonts.ready;
}
