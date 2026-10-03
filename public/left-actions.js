(() => {
  const desktop = window.matchMedia('(min-width: 1024px)');
  const placements = new Map();
  const groups = {
    leftActionsQuote: ['#newQuote', '#saveQuote', '#quoteLibrary', '#pendingQuoteApprovals', '#approveQuote', '#printQuote'],
    leftActionsType: ['.quote-type[data-type="HRC"]', '.quote-type[data-type="B2B"]', '.quote-type[data-type="VIGIFTS"]'],
    leftActionsProducts: ['#openSearch', '#openIncomingStock', '#openSupplierOrder', '#openSupplierReview'],
    leftActionsContracts: ['#previewPayload', '#viewSapoOrder', '#createContract', '#createContractCrm', '#downloadContractFile', '#printDeliveryNote'],
    leftActionsShipping: ['#openLalamove'],
    leftActionsWork: ['#openUserGuide'],
    leftActionsAccount: ['#staffNotifications', '#staffPushToggle', '#supplierPaymentRequests', '#staffManage', '#staffBackup', '#staffFullBackup', '#staffPassword', '#catalogMoreActions > button'],
    leftSaveState: ['#saveState'],
  };

  function sync() {
    if (!desktop.matches) {
      for (const [element, anchor] of placements) {
        if (anchor.parentNode && element.previousSibling !== anchor) anchor.after(element);
      }
      return;
    }
    for (const [id, selectors] of Object.entries(groups)) {
      const target = document.getElementById(id);
      if (!target) continue;
      for (const selector of selectors) {
       for (const element of document.querySelectorAll(selector)) {
        if (element.parentNode === target) continue;
        if (!placements.has(element)) {
          const anchor = document.createComment('Original action position');
          element.before(anchor);
          placements.set(element, anchor);
        }
        target.append(element);
       }
      }
    }
    document.body.classList.add('left-actions-ready');
  }

  function start() {
    sync();
    desktop.addEventListener('change', sync);
    new MutationObserver(sync).observe(document.body, {childList: true, subtree: true});
    const params = new URLSearchParams(location.search);
    if (params.get('dashboardAction') === 'account') {
      const group = document.getElementById('leftActionsAccount')?.closest('details');
      if (group) {
        group.open = true;
        if (desktop.matches) group.scrollIntoView({block: 'nearest'});
      }
      const action = params.get('accountAction');
      if (['staffManage', 'staffPassword', 'staffNotifications'].includes(action)) {
        const button = document.getElementById(action);
        if (button && !button.hidden && !button.disabled) button.click();
      }
    }
  }
  window.addEventListener('bn-staff-ready', start, {once: true});
})();
