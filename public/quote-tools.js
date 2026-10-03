(() => {
  const sidebar = document.querySelector('.quote-tools');
  if (!sidebar) return;

  const tabs = [...sidebar.querySelectorAll('[data-quote-tools-tab]')];
  const panels = [...sidebar.querySelectorAll('[data-quote-tools-panel]')];
  const desktop = window.matchMedia('(min-width: 1024px)');
  let active = 'compose';

  function render() {
    for (const tab of tabs) {
      const selected = tab.dataset.quoteToolsTab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = desktop.matches && panel.dataset.quoteToolsPanel !== active;
      if (desktop.matches) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabs.find(tab => tab.dataset.quoteToolsTab === panel.dataset.quoteToolsPanel).id);
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
      }
    }
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => {
      active = tab.dataset.quoteToolsTab;
      render();
    });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      active = tabs[next].dataset.quoteToolsTab;
      render();
      tabs[next].focus();
    });
  }

  desktop.addEventListener('change', render);
  render();
  sidebar.classList.add('quote-tools-ready');
})();
