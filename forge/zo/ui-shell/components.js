/**
 * Zo-Qore Component Library - JavaScript Module
 * 
 * Provides utility functions for creating and managing UI components.
 * Vanilla JS implementation - no framework dependencies.
 */

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================

/**
 * Toast notification manager
 */
const ToastManager = {
  container: null,
  toasts: new Map(),
  idCounter: 0,

  /**
   * Initialize the toast container
   */
  init() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('role', 'alert');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  },

  /**
   * Show a toast notification
   * @param {Object} options - Toast options
   * @param {string} options.title - Toast title
   * @param {string} options.message - Toast message
   * @param {string} options.variant - Toast variant: 'success', 'warning', 'error', 'info'
   * @param {number} options.duration - Duration in ms (0 for persistent)
   * @param {string} options.icon - Custom icon (emoji or HTML)
   * @returns {number} Toast ID for dismissal
   */
  show({ title = '', message = '', variant = 'info', duration = 5000, icon = null } = {}) {
    this.init();
    
    const id = ++this.idCounter;
    const defaultIcons = {
      success: '✓',
      warning: '⚠',
      error: '✕',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icon || defaultIcons[variant] || 'ℹ'}</span>
      <div class="toast__content">
        ${title ? `<p class="toast__title">${this.escapeHtml(title)}</p>` : ''}
        ${message ? `<p class="toast__message">${this.escapeHtml(message)}</p>` : ''}
      </div>
      <button class="toast__close" aria-label="Dismiss notification">
        <span aria-hidden="true">×</span>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => this.dismiss(id));

    this.container.appendChild(toast);
    this.toasts.set(id, { element: toast, timeout: null });

    if (duration > 0) {
      const timeout = setTimeout(() => this.dismiss(id), duration);
      this.toasts.get(id).timeout = timeout;
    }

    return id;
  },

  /**
   * Dismiss a toast by ID
   * @param {number} id - Toast ID
   */
  dismiss(id) {
    const toastData = this.toasts.get(id);
    if (!toastData) return;

    const { element, timeout } = toastData;
    if (timeout) clearTimeout(timeout);

    element.classList.add('toast--exiting');
    element.addEventListener('animationend', () => {
      element.remove();
      this.toasts.delete(id);
    });
  },

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    for (const id of this.toasts.keys()) {
      this.dismiss(id);
    }
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Convenience methods
const toast = {
  success: (message, options = {}) => ToastManager.show({ ...options, message, variant: 'success' }),
  warning: (message, options = {}) => ToastManager.show({ ...options, message, variant: 'warning' }),
  error: (message, options = {}) => ToastManager.show({ ...options, message, variant: 'error' }),
  info: (message, options = {}) => ToastManager.show({ ...options, message, variant: 'info' }),
  show: (options) => ToastManager.show(options),
  dismiss: (id) => ToastManager.dismiss(id),
  dismissAll: () => ToastManager.dismissAll()
};

// ==========================================
// MODAL SYSTEM
// ==========================================

/**
 * Modal dialog manager
 */
const ModalManager = {
  activeModal: null,
  previousActiveElement: null,

  /**
   * Create and show a modal
   * @param {Object} options - Modal options
   * @param {string} options.title - Modal title
   * @param {string|HTMLElement} options.content - Modal body content
   * @param {Array} options.actions - Action buttons [{ label, variant, onClick }]
   * @param {string} options.size - Modal size: 'sm', 'md', 'lg', 'fullscreen'
   * @param {boolean} options.closeOnBackdrop - Close when clicking backdrop
   * @param {boolean} options.closeOnEscape - Close when pressing Escape
   * @param {Function} options.onClose - Callback when modal closes
   * @returns {Object} Modal control object { close, element }
   */
  show({
    title = '',
    content = '',
    actions = [],
    size = 'md',
    closeOnBackdrop = true,
    closeOnEscape = true,
    onClose = null
  } = {}) {
    // Close any existing modal
    if (this.activeModal) {
      this.close();
    }

    // Store previously focused element
    this.previousActiveElement = document.activeElement;

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    if (title) backdrop.setAttribute('aria-labelledby', 'modal-title');

    // Create modal
    const modal = document.createElement('div');
    modal.className = `modal${size !== 'md' ? ` modal--${size}` : ''}`;

    // Build modal HTML
    modal.innerHTML = `
      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">${this.escapeHtml(title)}</h2>
        <button class="modal__close" aria-label="Close modal">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div class="modal__body"></div>
      ${actions.length > 0 ? '<div class="modal__footer"></div>' : ''}
    `;

    // Set content
    const body = modal.querySelector('.modal__body');
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      body.appendChild(content);
    }

    // Add action buttons
    if (actions.length > 0) {
      const footer = modal.querySelector('.modal__footer');
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = `btn btn--${action.variant || 'secondary'}`;
        btn.textContent = action.label;
        if (action.onClick) {
          btn.addEventListener('click', () => {
            action.onClick();
            if (action.closeOnClick !== false) {
              this.close();
            }
          });
        }
        footer.appendChild(btn);
      });
    }

    // Close button
    const closeBtn = modal.querySelector('.modal__close');
    closeBtn.addEventListener('click', () => this.close());

    // Backdrop click
    if (closeOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    // Escape key
    if (closeOnEscape) {
      this.escapeHandler = (e) => {
        if (e.key === 'Escape') this.close();
      };
      document.addEventListener('keydown', this.escapeHandler);
    }

    // Focus trap
    this.focusTrap = this.createFocusTrap(modal);

    // Assemble and show
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(() => {
      backdrop.classList.add('modal-backdrop--visible');
      // Focus first focusable element
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    });

    this.activeModal = { backdrop, modal, onClose };
    this.onCloseCallback = onClose;

    return {
      close: () => this.close(),
      element: modal
    };
  },

  /**
   * Close the active modal
   */
  close() {
    if (!this.activeModal) return;

    const { backdrop, modal, onClose } = this.activeModal;

    // Remove event listeners
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }

    // Animate out
    backdrop.classList.remove('modal-backdrop--visible');

    const handleAnimationEnd = () => {
      backdrop.remove();
      document.body.style.overflow = '';
      
      // Restore focus
      if (this.previousActiveElement) {
        this.previousActiveElement.focus();
      }

      // Callback
      if (onClose) onClose();
      if (this.onCloseCallback) this.onCloseCallback();
      
      this.activeModal = null;
    };

    modal.addEventListener('transitionend', handleAnimationEnd, { once: true });
    
    // Fallback if transition doesn't fire
    setTimeout(handleAnimationEnd, 300);
  },

  /**
   * Create focus trap for modal
   * @param {HTMLElement} container - Modal container
   * @returns {Function} Cleanup function
   */
  createFocusTrap(container) {
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    
    const handler = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = container.querySelectorAll(focusableSelector);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Convenience methods
const modal = {
  show: (options) => ModalManager.show(options),
  close: () => ModalManager.close(),
  confirm: (message, options = {}) => {
    return new Promise((resolve) => {
      ModalManager.show({
        title: options.title || 'Confirm',
        content: `<p>${message}</p>`,
        actions: [
          {
            label: options.cancelLabel || 'Cancel',
            variant: 'secondary',
            onClick: () => resolve(false)
          },
          {
            label: options.confirmLabel || 'Confirm',
            variant: options.confirmVariant || 'primary',
            onClick: () => resolve(true)
          }
        ],
        onClose: () => resolve(false),
        ...options
      });
    });
  },
  alert: (message, options = {}) => {
    return new Promise((resolve) => {
      ModalManager.show({
        title: options.title || 'Alert',
        content: `<p>${message}</p>`,
        actions: [
          {
            label: options.buttonLabel || 'OK',
            variant: 'primary',
            onClick: () => resolve(true)
          }
        ],
        onClose: () => resolve(true),
        ...options
      });
    });
  }
};

// ==========================================
// STATUS INDICATOR
// ==========================================

/**
 * Create a status indicator element
 * @param {Object} options - Status options
 * @param {string} options.status - Status: 'success', 'warning', 'error', 'info', 'neutral'
 * @param {string} options.label - Status label text
 * @param {boolean} options.pulse - Enable pulse animation
 * @returns {HTMLElement} Status indicator element
 */
function createStatusIndicator({ status = 'neutral', label = '', pulse = false } = {}) {
  const indicator = document.createElement('div');
  indicator.className = `status-indicator status-indicator--${status}${pulse ? ' status-indicator--pulse' : ''}`;
  indicator.innerHTML = `
    <span class="status-indicator__dot" aria-hidden="true"></span>
    <span class="status-indicator__label">${label}</span>
  `;
  return indicator;
}

// ==========================================
// BADGE
// ==========================================

/**
 * Create a badge element
 * @param {Object} options - Badge options
 * @param {string} options.variant - Badge variant: 'default', 'primary', 'accent', 'success', 'warning', 'error', 'info'
 * @param {string} options.text - Badge text
 * @param {boolean} options.dot - Show dot indicator
 * @returns {HTMLElement} Badge element
 */
function createBadge({ variant = 'default', text = '', dot = false } = {}) {
  const badge = document.createElement('span');
  badge.className = `badge badge--${variant}`;
  badge.innerHTML = `${dot ? '<span class="badge__dot"></span>' : ''}${text}`;
  return badge;
}

// ==========================================
// EMPTY STATE
// ==========================================

/**
 * Create an empty state element
 * @param {Object} options - Empty state options
 * @param {string} options.icon - Icon (emoji or HTML)
 * @param {string} options.title - Title text
 * @param {string} options.description - Description text
 * @param {Object} options.action - Action button { label, onClick }
 * @param {string} options.tip - Optional tip text
 * @returns {HTMLElement} Empty state element
 */
function createEmptyState({ icon = '📭', title = 'No items', description = '', action = null, tip = '' } = {}) {
  const state = document.createElement('div');
  state.className = 'empty-state';
  
  let html = `
    <div class="empty-state__icon" aria-hidden="true">${icon}</div>
    <h3 class="empty-state__title">${title}</h3>
    ${description ? `<p class="empty-state__desc">${description}</p>` : ''}
  `;

  if (action) {
    html += `
      <div class="empty-state__action">
        <button class="btn btn--primary">${action.label}</button>
      </div>
    `;
  }

  if (tip) {
    html += `<p class="empty-state__tip">${tip}</p>`;
  }

  state.innerHTML = html;

  // Attach action handler
  if (action && action.onClick) {
    const btn = state.querySelector('.empty-state__action .btn');
    if (btn) {
      btn.addEventListener('click', action.onClick);
    }
  }

  return state;
}

// ==========================================
// FORM FIELD VALIDATION
// ==========================================

/**
 * Form field validation utilities
 */
const FormValidation = {
  /**
   * Validate a form field
   * @param {HTMLInputElement|HTMLTextAreaElement} input - Input element
   * @param {Object} rules - Validation rules
   * @returns {Object} { valid: boolean, error: string|null }
   */
  validate(input, rules = {}) {
    const value = input.value.trim();
    const errors = [];

    if (rules.required && !value) {
      errors.push(rules.requiredMessage || 'This field is required');
    }

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`Must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`Must be no more than ${rules.maxLength} characters`);
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(rules.patternMessage || 'Invalid format');
    }

    if (rules.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push('Invalid email address');
    }

    if (rules.custom && typeof rules.custom === 'function') {
      const customError = rules.custom(value);
      if (customError) errors.push(customError);
    }

    return {
      valid: errors.length === 0,
      error: errors[0] || null
    };
  },

  /**
   * Show validation error on a form field
   * @param {HTMLElement} field - Form field container
   * @param {string} error - Error message
   */
  showError(field, error) {
    field.classList.add('form-field--error');
    field.classList.remove('form-field--success');
    
    let errorEl = field.querySelector('.form-field__error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'form-field__error';
      field.appendChild(errorEl);
    }
    errorEl.textContent = error;
  },

  /**
   * Show success state on a form field
   * @param {HTMLElement} field - Form field container
   */
  showSuccess(field) {
    field.classList.remove('form-field--error');
    field.classList.add('form-field--success');
    
    const errorEl = field.querySelector('.form-field__error');
    if (errorEl) errorEl.remove();
  },

  /**
   * Clear validation state from a form field
   * @param {HTMLElement} field - Form field container
   */
  clear(field) {
    field.classList.remove('form-field--error', 'form-field--success');
    
    const errorEl = field.querySelector('.form-field__error');
    if (errorEl) errorEl.remove();
  }
};

// ==========================================
// SKELETON LOADING
// ==========================================

/**
 * Create skeleton loading placeholders
 * @param {Object} options - Skeleton options
 * @param {string} options.type - Type: 'text', 'title', 'avatar', 'button', 'card'
 * @param {number} options.lines - Number of text lines (for type 'text')
 * @returns {HTMLElement} Skeleton element
 */
function createSkeleton({ type = 'text', lines = 3 } = {}) {
  const container = document.createElement('div');
  
  switch (type) {
    case 'title':
      container.innerHTML = '<div class="skeleton skeleton--title"></div>';
      break;
    
    case 'avatar':
      container.innerHTML = '<div class="skeleton skeleton--avatar"></div>';
      break;
    
    case 'button':
      container.innerHTML = '<div class="skeleton skeleton--button"></div>';
      break;
    
    case 'card':
      container.innerHTML = `
        <div class="skeleton skeleton--title"></div>
        <div class="skeleton skeleton--text" style="width: 90%"></div>
        <div class="skeleton skeleton--text" style="width: 75%"></div>
        <div class="skeleton skeleton--text" style="width: 60%"></div>
      `;
      break;
    
    case 'text':
    default:
      for (let i = 0; i < lines; i++) {
        const width = i === lines - 1 ? '60%' : `${100 - Math.random() * 20}%`;
        container.innerHTML += `<div class="skeleton skeleton--text" style="width: ${width}"></div>`;
      }
  }
  
  return container;
}

// ==========================================
// EXPORTS
// ==========================================

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ToastManager,
    toast,
    ModalManager,
    modal,
    createStatusIndicator,
    createBadge,
    createEmptyState,
    FormValidation,
    createSkeleton
  };
}

// Export to global scope for vanilla JS
if (typeof window !== 'undefined') {
  window.ZoQoreComponents = {
    ToastManager,
    toast,
    ModalManager,
    modal,
    createStatusIndicator,
    createBadge,
    createEmptyState,
    FormValidation,
    createSkeleton
  };
}
