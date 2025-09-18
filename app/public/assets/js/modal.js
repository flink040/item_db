import { qsa, refs } from './dom.js';

let activeModal = null;
let focusableItems = [];
let previouslyFocused = null;
let modalEventsBound = false;
let onCloseCallback = null;


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
    '[contenteditable]:not([contenteditable="false"])',
  ];

  return qsa(selectors.join(','), container).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hasAttribute('disabled')) {
      return false;
    }

    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    if (element.closest('[hidden]')) {
      return false;
    }

    if (element.closest('[aria-hidden="true"]')) {
      return false;
    }

    if (element.closest('[inert]')) {
      return false;
    }

    return true;
  });
}

function refreshFocusableItems(modal) {
  if (!modal) {
    focusableItems = [];
    return focusableItems;
  }

  focusableItems = getFocusableElements(modal);

  if (focusableItems.length === 0) {
    if (modal.getAttribute('tabindex') !== '-1') {
      modal.setAttribute('tabindex', '-1');
    }
    focusableItems = [modal];
  } else if (modal.getAttribute('tabindex') === '-1') {
    modal.removeAttribute('tabindex');
  }

  return focusableItems;
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

  const modal = activeModal;
  const items = refreshFocusableItems(modal);
  const first = items[0];
  const last = items[items.length - 1];
  const isShiftPressed = event.shiftKey;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (!activeElement || !modal.contains(activeElement)) {
    event.preventDefault();
    const fallback = isShiftPressed ? last : first;
    if (fallback instanceof HTMLElement) {
      fallback.focus();
    }
    return;
  }

  if (isShiftPressed && activeElement === first) {
    event.preventDefault();
    if (last instanceof HTMLElement) {
      last.focus();
    }
  } else if (!isShiftPressed && activeElement === last) {
    event.preventDefault();
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }
}

function handleFocusIn(event) {
  if (!activeModal) {
    return;
  }

  const modal = activeModal;
  refreshFocusableItems(modal);

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!modal.contains(target)) {
    const [first] = focusableItems;
    if (first instanceof HTMLElement) {
      window.requestAnimationFrame(() => {
        first.focus();
      });
    }
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
  modal.addEventListener('focusin', handleFocusIn);
  modalEventsBound = true;
}

function prepareFocus(modal) {
  const items = refreshFocusableItems(modal);
  const target = items[0];
  window.requestAnimationFrame(() => {
    if (target instanceof HTMLElement) {
      try {
        target.focus({ preventScroll: true });
        return;
      } catch (error) {
        // Fallback to standard focus call below.
        void error;
      }
    }

    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  });
}

export function openModal(contentEl, options = {}) {

  const modal = refs.modal;
  if (!modal) {
    return;
  }


  const { labelledBy, ariaLabel, onClose } = options ?? {};

  if (labelledBy) {
    modal.setAttribute('aria-labelledby', labelledBy);
    modal.removeAttribute('aria-label');
  } else if (ariaLabel) {
    modal.setAttribute('aria-label', ariaLabel);
    modal.removeAttribute('aria-labelledby');
  } else {
    modal.removeAttribute('aria-labelledby');
    modal.removeAttribute('aria-label');
  }

  onCloseCallback = typeof onClose === 'function' ? onClose : null;


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

  const wasOpen = Boolean(activeModal);
  if (!wasOpen) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

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

  activeModal = null;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('aria-modal', 'false');
  modal.setAttribute('hidden', '');

  if (modal.getAttribute('tabindex') === '-1') {
    modal.removeAttribute('tabindex');
  }

  focusableItems = [];
  if (previouslyFocused) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;

  const callback = onCloseCallback;
  onCloseCallback = null;

  if (typeof callback === 'function') {
    try {
      callback();
    } catch (error) {
      console.error('Modal close handler failed', error);
    }
  }
}

export function isModalOpen() {
  return Boolean(activeModal);
}
