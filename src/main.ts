import { manifest } from 'virtual:folium-library';
import { mountApp } from './app';
import { createLibrary } from './library';
import './styles/tokens.css';
import './styles/app.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element');

mountApp(app, createLibrary(manifest));
