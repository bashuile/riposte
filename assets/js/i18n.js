// i18n.js : gestion simple des traductions FR/EN

let translations = {};
let currentLang = 'fr';

async function loadLanguage(lang) {
  try {
    const response = await fetch(`./locales/${lang}.json`);
    if (!response.ok) throw new Error('Cannot load locale ' + lang);
    translations[lang] = await response.json();
    currentLang = lang;
    applyTranslations();
    updateHtmlLang(lang);
  } catch (err) {
    console.error('Erreur de chargement langue', lang, err);
  }
}

function updateHtmlLang(lang) {
  document.documentElement.setAttribute('lang', lang);
}

function t(key, params = {}) {
  const dict = translations[currentLang];
  if (!dict) return key;

  const parts = key.split('.');
  let value = dict;
  for (const p of parts) {
    value = value?.[p];
    if (value === undefined || value === null) {
      return key;
    }
  }

  if (typeof value !== 'string') return key;

  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] != null ? params[name] : `{${name}}`
  );
}

function applyTranslations() {
  // Texte principal (innerHTML)
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = t(key);
    if (value !== key) {
      el.innerHTML = value;
    }
  });

  // Placeholders
  document
    .querySelectorAll('[data-i18n-placeholder]')
    .forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const value = t(key);
      if (value !== key) {
        el.setAttribute('placeholder', value);
      }
    });

  // Titre de la page (balise <title> avec data-i18n)
  const titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) {
    const key = titleEl.getAttribute('data-i18n');
    const value = t(key);
    if (value !== key) {
      titleEl.textContent = value;
    }
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  // Langue par défaut
  loadLanguage(currentLang);

  // Switcher de langue dans le header
  const langSwitcher = document.getElementById('lang-switcher');
  if (langSwitcher) {
    langSwitcher.value = currentLang;
    langSwitcher.addEventListener('change', (e) => {
      const lang = e.target.value;
      loadLanguage(lang);
    });
  }
});
