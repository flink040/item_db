/**
 * Modal helpers including a tiny focus trap implementation.
 */

import { qsa } from './dom.js';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let activeModal = null;
let lastFocusedElement = null;
const forcedTabIndex = new WeakSet();

function getFocusableElements(modal) {
  if (!modal) return [];
  return qsa(FOCUSABLE_SELECTORS, modal).filter(
    (element) => !element.hasAttribute('aria-hidden') && element.offsetParent !== null,
  );
}

function trapFocus(event) {
  if (!activeModal) return;

  const focusable = getFocusableElements(activeModal);
  if (focusable.length === 0) {
    if (!forcedTabIndex.has(activeModal)) {
      activeModal.setAttribute('tabindex', '-1');
      forcedTabIndex.add(activeModal);
    }
    activeModal.focus({ preventScroll: true });
    event.preventDefault();
    return;
  }

  const currentIndex = focusable.indexOf(document.activeElement);

  if (event.shiftKey) {
    if (currentIndex <= 0) {
      focusable[focusable.length - 1].focus({ preventScroll: true });
      event.preventDefault();
    }
  } else if (currentIndex === -1 || currentIndex >= focusable.length - 1) {
    focusable[0].focus({ preventScroll: true });
    event.preventDefault();
  }
}

function handleKeyDown(event) {
  if (!activeModal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key === 'Tab') {
    trapFocus(event);
  }
}

export function openModal(modal) {
  if (!modal || activeModal === modal) {
    return;
  }

  if (activeModal) {
    closeModal();
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  activeModal = modal;

  const focusable = getFocusableElements(modal);
  if (focusable.length > 0) {
    focusable[0].focus({ preventScroll: true });
  } else {
    if (!modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
      forcedTabIndex.add(modal);
    }
    modal.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', handleKeyDown);
}

export function closeModal() {
  if (!activeModal) {
    return;
  }

  const modal = activeModal;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  if (forcedTabIndex.has(modal)) {
    modal.removeAttribute('tabindex');
    forcedTabIndex.delete(modal);
  }

  document.removeEventListener('keydown', handleKeyDown);

  const targetToFocus = lastFocusedElement;
  activeModal = null;
  lastFocusedElement = null;

  if (targetToFocus && typeof targetToFocus.focus === 'function') {
    targetToFocus.focus({ preventScroll: true });
  }
}

export function isModalOpen() {
  return Boolean(activeModal);
}
