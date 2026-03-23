/**
 * Zo-Qore Onboarding Wizard
 * 
 * Provides guided first-time user experience with:
 * - Welcome modal
 * - View-by-view guided tour
 * - Example project creation
 * - Persistent completion state
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'zoqore_onboarding_complete';
  var EXAMPLE_PROJECT_KEY = 'zoqore_example_project_created';
  var TOUR_STEP_KEY = 'zoqore_tour_step';

  // Tour steps for each view
  var TOUR_STEPS = [
    {
      view: 'void',
      title: 'Brainstorm & Capture',
      description: 'This is where ideas begin. Type or dictate thoughts freely. Everything you capture here will become the raw material for your project.',
      highlights: [
        { selector: '.void-textarea', label: 'Type your thoughts here' },
        { selector: '.mic-button', label: 'Or use voice capture' },
        { selector: '.tag-input', label: 'Add tags to organize' }
      ],
      action: 'Try capturing your first thought'
    },
    {
      view: 'constellation',
      title: 'Mind Map Connections',
      description: 'Your thoughts become a visual constellation. Drag nodes to position them, draw edges to show relationships, and watch themes emerge.',
      highlights: [
        { selector: '.constellation-canvas', label: 'Your idea graph lives here' },
        { selector: '.cluster-card', label: 'Related thoughts group into clusters' },
        { selector: '.edge-controls', label: 'Draw connections between ideas' }
      ],
      action: 'Try connecting two thoughts'
    },
    {
      view: 'path',
      title: 'Build Your Roadmap',
      description: 'Transform clusters into actionable phases. Each phase contains tasks with acceptance criteria. Drag to reorder, check off as you go.',
      highlights: [
        { selector: '.phase-timeline', label: 'Phases appear in order' },
        { selector: '.task-list', label: 'Tasks within each phase' },
        { selector: '.progress-bar', label: 'Track your progress' }
      ],
      action: 'Add a task to your first phase'
    },
    {
      view: 'risk',
      title: 'Manage Risks',
      description: 'Every project has risks. Log them here, assess likelihood and impact, and track mitigations. The risk matrix visualizes exposure.',
      highlights: [
        { selector: '.risk-table', label: 'Your risk register' },
        { selector: '.risk-matrix', label: 'Visual risk assessment' },
        { selector: '.risk-status', label: 'Track mitigation status' }
      ],
      action: 'Identify a potential risk'
    },
    {
      view: 'autonomy',
      title: 'Set Guardrails',
      description: 'Configure project-level policies: approval gates, Victor stance, and enforcement levels. This keeps your project on track.',
      highlights: [
        { selector: '.guardrail-list', label: 'Policy enforcement rules' },
        { selector: '.victor-mode', label: 'Choose Victor\'s behavior' },
        { selector: '.approval-gates', label: 'Required approvals' }
      ],
      action: 'Set your preferred Victor stance'
    }
  ];

  // State
  var state = {
    isActive: false,
    currentStep: 0,
    isComplete: false,
    exampleProjectCreated: false,
    overlay: null,
    tooltip: null,
    spotlight: null
  };

  // ==========================================
  // INITIALIZATION
  // ==========================================

  /**
   * Initialize the onboarding system
   * @param {Object} options - Configuration options
   * @param {boolean} options.forceShow - Force show even if already complete
   * @param {Function} options.onCreateExample - Callback to create example project
   * @param {Function} options.onNavigate - Callback to navigate to a view
   */
  function init(options) {
    options = options || {};
    
    // Check if onboarding was already completed
    var stored = localStorage.getItem(STORAGE_KEY);
    state.isComplete = stored === 'true';
    
    var exampleStored = localStorage.getItem(EXAMPLE_PROJECT_KEY);
    state.exampleProjectCreated = exampleStored === 'true';

    // Resume incomplete tour
    var tourStep = localStorage.getItem(TOUR_STEP_KEY);
    if (tourStep !== null) {
      state.currentStep = parseInt(tourStep, 10);
    }

    // Show onboarding if not complete or forced
    if (!state.isComplete || options.forceShow) {
      // Delay to ensure DOM is ready
      setTimeout(function() {
        showWelcome(options);
      }, 500);
    }

    return {
      show: function() { showWelcome(options); },
      reset: function() { resetOnboarding(); },
      nextStep: function() { nextTourStep(options); },
      prevStep: function() { prevTourStep(options); },
      endTour: function() { endTour(); },
      getState: function() { return { ...state }; }
    };
  }

  // ==========================================
  // WELCOME MODAL
  // ==========================================

  function showWelcome(options) {
    if (state.isActive) return;
    state.isActive = true;

    var welcomeHtml = '\
      <div class="onboarding-welcome">\
        <div class="onboarding-welcome__icon">✨</div>\
        <h1 class="onboarding-welcome__title">Welcome to Zo-Qore</h1>\
        <p class="onboarding-welcome__subtitle">Your AI-powered planning companion</p>\
        \
        <div class="onboarding-welcome__features">\
          <div class="onboarding-feature">\
            <span class="onboarding-feature__icon">💭</span>\
            <h3>Capture Ideas</h3>\
            <p>Brainstorm freely with voice or text</p>\
          </div>\
          <div class="onboarding-feature">\
            <span class="onboarding-feature__icon">🔗</span>\
            <h3>Find Connections</h3>\
            <p>See how your thoughts relate</p>\
          </div>\
          <div class="onboarding-feature">\
            <span class="onboarding-feature__icon">📋</span>\
            <h3>Build Plans</h3>\
            <p>Turn ideas into actionable roadmaps</p>\
          </div>\
        </div>\
        \
        <div class="onboarding-welcome__actions">\
          <button class="btn btn--primary btn--lg onboarding-btn-start">\
            Start Guided Tour\
          </button>\
          <button class="btn btn--ghost onboarding-btn-skip">\
            Skip for now\
          </button>\
        </div>\
        \
        <div class="onboarding-welcome__example">\
          <label class="onboarding-checkbox">\
            <input type="checkbox" class="onboarding-create-example" checked>\
            <span class="onboarding-checkbox__label">Create example project to explore</span>\
          </label>\
        </div>\
      </div>\
    ';

    var modal = window.ZoQoreComponents && window.ZoQoreComponents.modal;
    if (modal) {
      modal.show({
        title: '',
        content: welcomeHtml,
        size: 'lg',
        closeOnBackdrop: false,
        closeOnEscape: false
      });

      // Attach handlers
      setTimeout(function() {
        var startBtn = document.querySelector('.onboarding-btn-start');
        var skipBtn = document.querySelector('.onboarding-btn-skip');

        if (startBtn) {
          startBtn.addEventListener('click', function() {
            var createExample = document.querySelector('.onboarding-create-example');
            if (createExample && createExample.checked) {
              createExampleProject(options);
            }
            modal.close();
            startTour(options);
          });
        }

        if (skipBtn) {
          skipBtn.addEventListener('click', function() {
            modal.close();
            completeOnboarding();
          });
        }
      }, 100);
    } else {
      // Fallback if modal component not available
      console.warn('Modal component not available, onboarding skipped');
      state.isActive = false;
    }
  }

  // ==========================================
  // GUIDED TOUR
  // ==========================================

  function startTour(options) {
    state.currentStep = 0;
    showTourStep(options);
  }

  function showTourStep(options) {
    var step = TOUR_STEPS[state.currentStep];
    if (!step) {
      endTour();
      return;
    }

    // Navigate to the view
    if (options.onNavigate) {
      options.onNavigate(step.view);
    }

    // Save progress
    localStorage.setItem(TOUR_STEP_KEY, state.currentStep.toString());

    // Create overlay and tooltip
    createOverlay();
    createTooltip(step);
    highlightElements(step.highlights);
  }

  function nextTourStep(options) {
    state.currentStep++;
    if (state.currentStep >= TOUR_STEPS.length) {
      endTour();
    } else {
      clearTourUI();
      showTourStep(options);
    }
  }

  function prevTourStep(options) {
    if (state.currentStep > 0) {
      state.currentStep--;
      clearTourUI();
      showTourStep(options);
    }
  }

  function endTour() {
    clearTourUI();
    localStorage.removeItem(TOUR_STEP_KEY);
    completeOnboarding();
    showCompletionMessage();
  }

  // ==========================================
  // TOUR UI COMPONENTS
  // ==========================================

  function createOverlay() {
    if (state.overlay) return;

    state.overlay = document.createElement('div');
    state.overlay.className = 'onboarding-overlay';
    state.overlay.innerHTML = '<div class="onboarding-overlay__backdrop"></div>';
    document.body.appendChild(state.overlay);
  }

  function createTooltip(step) {
    if (state.tooltip) {
      state.tooltip.remove();
    }

    state.tooltip = document.createElement('div');
    state.tooltip.className = 'onboarding-tooltip';
    state.tooltip.innerHTML = '\
      <div class="onboarding-tooltip__content">\
        <div class="onboarding-tooltip__header">\
          <span class="onboarding-tooltip__step">' + (state.currentStep + 1) + ' of ' + TOUR_STEPS.length + '</span>\
          <button class="onboarding-tooltip__close" aria-label="Close tour">×</button>\
        </div>\
        <h2 class="onboarding-tooltip__title">' + escapeHtml(step.title) + '</h2>\
        <p class="onboarding-tooltip__desc">' + escapeHtml(step.description) + '</p>\
        <p class="onboarding-tooltip__action">' + escapeHtml(step.action) + '</p>\
        <div class="onboarding-tooltip__nav">\
          <button class="btn btn--ghost onboarding-tooltip__prev">← Back</button>\
          <button class="btn btn--primary onboarding-tooltip__next">Next →</button>\
        </div>\
      </div>\
    ';

    document.body.appendChild(state.tooltip);

    // Position tooltip
    positionTooltip();

    // Attach handlers
    var closeBtn = state.tooltip.querySelector('.onboarding-tooltip__close');
    var prevBtn = state.tooltip.querySelector('.onboarding-tooltip__prev');
    var nextBtn = state.tooltip.querySelector('.onboarding-tooltip__next');

    if (closeBtn) {
      closeBtn.addEventListener('click', endTour);
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        prevTourStep({ onNavigate: window.onboardingNavigate });
      });
      prevBtn.disabled = state.currentStep === 0;
      if (state.currentStep === 0) {
        prevBtn.classList.add('btn--disabled');
      }
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        nextTourStep({ onNavigate: window.onboardingNavigate });
      });
      if (state.currentStep === TOUR_STEPS.length - 1) {
        nextBtn.textContent = 'Finish';
      }
    }
  }

  function positionTooltip() {
    if (!state.tooltip) return;

    // Default position: center-right
    var left = window.innerWidth / 2;
    var top = window.innerHeight / 2;

    // Try to position near the first highlight
    var firstHighlight = document.querySelector(TOUR_STEPS[state.currentStep].highlights[0]?.selector);
    if (firstHighlight) {
      var rect = firstHighlight.getBoundingClientRect();
      left = rect.right + 20;
      top = rect.top;

      // Adjust if off screen
      if (left + 400 > window.innerWidth) {
        left = rect.left - 420;
      }
      if (top + 300 > window.innerHeight) {
        top = window.innerHeight - 320;
      }
      if (top < 20) {
        top = 20;
      }
    } else {
      // Center of screen
      left = (window.innerWidth - 400) / 2;
      top = (window.innerHeight - 300) / 2;
    }

    state.tooltip.style.left = left + 'px';
    state.tooltip.style.top = top + 'px';
  }

  function highlightElements(highlights) {
    if (!highlights || highlights.length === 0) return;

    // Create spotlight containers
    highlights.forEach(function(highlight) {
      var el = document.querySelector(highlight.selector);
      if (!el) return;

      // Add highlight class
      el.classList.add('onboarding-highlight');

      // Create label
      var label = document.createElement('div');
      label.className = 'onboarding-highlight-label';
      label.textContent = highlight.label;
      el.parentNode.insertBefore(label, el.nextSibling);

      // Position label
      var rect = el.getBoundingClientRect();
      label.style.top = (rect.bottom + 8) + 'px';
      label.style.left = rect.left + 'px';
    });
  }

  function clearTourUI() {
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }

    if (state.tooltip) {
      state.tooltip.remove();
      state.tooltip = null;
    }

    // Remove highlights
    document.querySelectorAll('.onboarding-highlight').forEach(function(el) {
      el.classList.remove('onboarding-highlight');
    });

    document.querySelectorAll('.onboarding-highlight-label').forEach(function(el) {
      el.remove();
    });
  }

  // ==========================================
  // EXAMPLE PROJECT
  // ==========================================

  function createExampleProject(options) {
    if (state.exampleProjectCreated) return;

    // Example project data
    var exampleProject = {
      id: 'example-' + Date.now(),
      name: 'Example: Personal Website Redesign',
      description: 'A sample project demonstrating the Zo-Qore workflow',
      thoughts: [
        { id: 't1', content: 'Need to update the portfolio section with recent projects', tags: ['portfolio', 'content'] },
        { id: 't2', content: 'Mobile responsiveness is poor on the about page', tags: ['mobile', 'bug'] },
        { id: 't3', content: 'Want to add a blog section for technical articles', tags: ['blog', 'new-feature'] },
        { id: 't4', content: 'Contact form submissions are going to spam', tags: ['bug', 'urgent'] },
        { id: 't5', content: 'Consider adding dark mode toggle', tags: ['ux', 'enhancement'] },
        { id: 't6', content: 'Page load time is over 3 seconds', tags: ['performance', 'urgent'] },
        { id: 't7', content: 'Add testimonials from clients', tags: ['content', 'marketing'] },
        { id: 't8', content: 'SEO meta tags need updating', tags: ['seo', 'marketing'] }
      ],
      clusters: [
        { id: 'c1', name: 'Content Updates', thoughtIds: ['t1', 't7', 't8'], notes: 'Marketing-focused improvements' },
        { id: 'c2', name: 'Technical Issues', thoughtIds: ['t2', 't4', 't6'], notes: 'Require immediate attention' },
        { id: 'c3', name: 'New Features', thoughtIds: ['t3', 't5'], notes: 'Future enhancements' }
      ],
      phases: [
        { id: 'p1', name: 'Fix Critical Issues', ordinal: 1, tasks: [
          { id: 'pt1', name: 'Fix contact form spam', status: 'pending' },
          { id: 'pt2', name: 'Optimize page load time', status: 'pending' }
        ]},
        { id: 'p2', name: 'Content Refresh', ordinal: 2, tasks: [
          { id: 'pt3', name: 'Update portfolio section', status: 'pending' },
          { id: 'pt4', name: 'Add testimonials', status: 'pending' },
          { id: 'pt5', name: 'Update SEO meta tags', status: 'pending' }
        ]},
        { id: 'p3', name: 'Enhancements', ordinal: 3, tasks: [
          { id: 'pt6', name: 'Add blog section', status: 'pending' },
          { id: 'pt7', name: 'Implement dark mode', status: 'pending' }
        ]}
      ],
      risks: [
        { id: 'r1', name: 'Timeline overrun', likelihood: 'medium', impact: 'high', mitigation: 'Prioritize critical issues first', status: 'open' },
        { id: 'r2', name: 'SEO ranking drop during redesign', likelihood: 'low', impact: 'medium', mitigation: 'Implement proper redirects', status: 'mitigated' }
      ]
    };

    // Call the create callback if provided
    if (options.onCreateExample) {
      options.onCreateExample(exampleProject);
    }

    state.exampleProjectCreated = true;
    localStorage.setItem(EXAMPLE_PROJECT_KEY, 'true');

    // Show toast notification
    var toast = window.ZoQoreComponents && window.ZoQoreComponents.toast;
    if (toast) {
      toast.success('Example project created! Explore it to learn the workflow.', { duration: 5000 });
    }
  }

  // ==========================================
  // COMPLETION
  // ==========================================

  function completeOnboarding() {
    state.isComplete = true;
    state.isActive = false;
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  function showCompletionMessage() {
    var toast = window.ZoQoreComponents && window.ZoQoreComponents.toast;
    if (toast) {
      toast.success('You\'re all set! Start capturing your ideas in the Brainstorm view.', { duration: 6000 });
    }

    // Navigate to void view
    if (window.onboardingNavigate) {
      window.onboardingNavigate('void');
    }
  }

  function resetOnboarding() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXAMPLE_PROJECT_KEY);
    localStorage.removeItem(TOUR_STEP_KEY);
    state.isComplete = false;
    state.exampleProjectCreated = false;
    state.currentStep = 0;
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==========================================
  // GLOBAL EXPORT
  // ==========================================

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.ZoQoreOnboarding = {
      init: init,
      reset: resetOnboarding,
      show: function(options) { showWelcome(options); },
      isActive: function() { return state.isActive; },
      isComplete: function() { return state.isComplete; }
    };
  }

  // Also export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      init: init,
      reset: resetOnboarding
    };
  }

})();
