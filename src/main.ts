import './styles/tokens.css';
import './styles/app.css';

// Phase 0: static landing page only. The dynamic library, router and reader
// arrive in later phases. The cards below are placeholders, not real books.
const placeholders = [
  { title: 'Languages', meta: 'Example category' },
  { title: 'University', meta: 'Example category' },
  { title: 'Your next book', meta: 'Add a .md file to Library/' },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element');

app.innerHTML = `
  <main class="home">
    <header class="home__hero">
      <h1 class="home__logo" data-testid="logo">Folium<span>.</span></h1>
      <p class="home__tagline">Your personal digital library</p>
    </header>
    <section aria-labelledby="preview-title">
      <h2 class="home__section-title" id="preview-title">Preview</h2>
      <p class="home__note">These cards are static placeholders. Your library is not loaded yet.</p>
      <ul class="cards">
        ${placeholders
          .map(
            (p) => `
          <li class="card">
            <span class="card__badge">Placeholder</span>
            <h3 class="card__title">${p.title}</h3>
            <p class="card__meta">${p.meta}</p>
          </li>`,
          )
          .join('')}
      </ul>
    </section>
  </main>
`;
