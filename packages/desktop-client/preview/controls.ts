import type { Theme } from '@actual-app/core/types/prefs';
import i18n, { t } from 'i18next';

import { setI18NextLanguage } from '#i18n';

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error('Missing preview control: ' + selector);
  return value;
}
const frame = element<HTMLIFrameElement>('#app');
const theme = element<HTMLSelectElement>('#theme');
const viewport = element<HTMLSelectElement>('#viewport');
const reset = element<HTMLButtonElement>('#reset');
const status = element<HTMLSpanElement>('#status');
let phase: 'loading' | 'ready' | 'reset' | 'error' = 'loading';
let failure = '';
function translateControls() {
  document.title = t('Actual CFM — UI preview');
  element('#caption').textContent = t('UI preview · sample data');
  element('#theme-label').textContent = t('Theme');
  element('#viewport-label').textContent = t('Screen size');
  theme.setAttribute('aria-label', t('Theme'));
  viewport.setAttribute('aria-label', t('Screen size'));
  theme.options[0].text = t('Light');
  theme.options[1].text = t('Dark');
  theme.options[2].text = t('Midnight');
  viewport.options[0].text = t('Full width');
  viewport.options[1].text = t('Tablet · 820 px');
  viewport.options[2].text = t('Phone · 390 px');
  reset.textContent = t('Reset sample');
  frame.title = t('Actual CFM sample application');
  status.textContent =
    phase === 'ready'
      ? t('Sample ready · as of {{date}} · edits stay in this browser', {
          date: new Intl.DateTimeFormat(i18n.language || 'en', {
            dateStyle: 'long',
            timeZone: 'UTC',
          }).format(new Date('2026-10-31T00:00:00Z')),
        })
      : phase === 'reset'
        ? t('Restoring the sample…')
        : phase === 'error'
          ? t('Preview failed: {{message}}', {
              message: failure || t('Check the terminal and reload.'),
            })
          : t('Loading the sample…');
}
i18n.on('languageChanged', translateControls);
if (i18n.isInitialized) {
  setI18NextLanguage(null);
  translateControls();
} else {
  i18n.once('initialized', () => {
    setI18NextLanguage(null);
    translateControls();
  });
}
theme.value = localStorage.getItem('cfm-preview-theme') || 'light';
viewport.value = localStorage.getItem('cfm-preview-viewport') || 'full';
function applyTheme() {
  frame.contentWindow?.Actual?.setTheme(theme.value as Theme);
  localStorage.setItem('cfm-preview-theme', theme.value);
}
function applyViewport() {
  frame.style.width =
    viewport.value === 'full' ? '100%' : viewport.value + 'px';
  localStorage.setItem('cfm-preview-viewport', viewport.value);
}
theme.addEventListener('change', applyTheme);
viewport.addEventListener('change', applyViewport);
applyViewport();
reset.addEventListener('click', () => {
  reset.disabled = true;
  phase = 'reset';
  translateControls();
  frame.src = '/summary?resetSample=1';
});
window.addEventListener('message', event => {
  if (
    event.origin !== window.location.origin ||
    event.source !== frame.contentWindow
  ) {
    return;
  }
  const message: unknown = event.data;
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (message.type === 'cfm-preview-ready') {
    applyTheme();
    reset.disabled = false;
    phase = 'ready';
    translateControls();
  } else if (message.type === 'cfm-preview-error') {
    reset.disabled = false;
    phase = 'error';
    failure =
      'message' in message && typeof message.message === 'string'
        ? message.message
        : '';
    translateControls();
  }
});

// Reload the application iframe once after a complete backend build. Sending
// Vite's global full-reload would reload both the shell and its child at once.
import.meta.hot?.on('cfm-backend-updated', () => {
  reset.disabled = true;
  phase = 'loading';
  translateControls();
  frame.contentWindow?.location.reload();
});

import.meta.hot?.on('cfm-backend-error', (data: { message: string }) => {
  reset.disabled = true;
  phase = 'error';
  failure = data.message;
  translateControls();
});
