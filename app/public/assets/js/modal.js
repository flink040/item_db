import { qsa, refs } from './dom.js';

let activeModal = null;
let focusableItems = [];
let previouslyFocused = null;
let modalEventsBound = false;

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];

  return qsa(selectors.join(','), container).filter((element) => {
    if (element.hasAttribute('disabled')) {
      return false;
    }
    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return true;
  });
}

function handleKeydown(event) {
  if (!activeModal) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  if (focusableItems.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusableItems[0];
  const last = focusableItems[focusableItems.length - 1];
  const isShiftPressed = event.shiftKey;
  const activeElement = document.activeElement;

  if (isShiftPressed && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!isShiftPressed && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindModalEvents(modal) {
  if (!modal || modalEventsBound) {
    return;
  }

  const closeBtn = refs.modalClose;
  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  const backdrop = refs.modalBackdrop;
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeModal();
    });
  }

  modal.addEventListener('keydown', handleKeydown);
  modalEventsBound = true;
}

function prepareFocus(modal) {
  focusableItems = getFocusableElements(modal);

  if (focusableItems.length === 0) {
    modal.setAttribute('tabindex', '-1');
    focusableItems = [modal];
  }

  const target = focusableItems[0];
  window.requestAnimationFrame(() => {
    target.focus();
  });
}

export function openModal(contentEl) {
  const modal = refs.modal;
  if (!modal) {
    return;
  }

  bindModalEvents(modal);

  const body = refs.modalBody;
  if (body) {
    body.innerHTML = '';

    if (contentEl instanceof HTMLElement) {
      body.appendChild(contentEl);
    } else if (typeof contentEl === 'string') {
      body.innerHTML = contentEl;
    }
  }

  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeModal = modal;

  modal.removeAttribute('hidden');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  modal.setAttribute('aria-modal', 'true');

  prepareFocus(modal);
}

export function closeModal() {
  if (!activeModal) {
    return;
  }

  const modal = activeModal;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('hidden', '');

  if (modal.getAttribute('tabindex') === '-1') {
    modal.removeAttribute('tabindex');
  }

  focusableItems = [];
  activeModal = null;

  if (previouslyFocused) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}
