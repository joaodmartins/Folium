import { el } from '../dom';
import { THEMES, type Theme } from '../state/theme';

const LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', sepia: 'Sepia' };

export interface ThemeSwitcher {
  root: HTMLElement;
  update(theme: Theme): void;
}

/** Three small swatches (Light, Dark, Sepia): a discreet control for the reading theme. */
export function renderThemeSwitcher(current: Theme, onChange: (theme: Theme) => void): ThemeSwitcher {
  const buttons = new Map<Theme, HTMLButtonElement>();

  for (const theme of THEMES) {
    const button = el('button', {
      type: 'button',
      class: `swatch swatch--${theme}`,
      'data-testid': `theme-${theme}`,
      'aria-label': `${LABELS[theme]} theme`,
      title: `${LABELS[theme]} theme`,
    });
    button.addEventListener('click', () => onChange(theme));
    buttons.set(theme, button);
  }

  const root = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Reading theme' }, ...buttons.values());

  const update = (theme: Theme) => {
    for (const [name, button] of buttons) button.setAttribute('aria-pressed', String(name === theme));
  };
  update(current);
  return { root, update };
}
