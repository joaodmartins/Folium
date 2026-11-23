import { manifest } from 'virtual:folium-library';
import { mountApp } from './app';
import { createLibrary } from './library';
import { applyTheme, loadTheme } from './state/theme';
import './styles/tokens.css';
import './styles/app.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element');

// The reader's choice wins; otherwise the library's default theme (folium.config.json).
applyTheme(loadTheme(manifest.config.defaultTheme));

mountApp(app, createLibrary(manifest));
