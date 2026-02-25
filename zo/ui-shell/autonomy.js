/**
 * Autonomy UI Component
 *
 * Guardrail configuration and readiness display.
 * Displays Victor mode selector, guardrails, approval gates, and blocking conditions.
 * 
 * WCAG 2.1 AA Compliant:
 * - All sections have role="region" and aria-labelledby
 * - All buttons have accessible labels
 * - All interactive elements are keyboard accessible
 * - Status changes are announced to screen readers
 */
(function() {
  'use strict';

  // State
  var state = {
    projectId: null,
    config: null,
    guardrails: [],
    approvalGates: [],
    allowedActions: [],
    blockedActions: [],
    victorMode: 'support',
    status: 'draft',
    loading: false,
    error: null,
    editingGuardrail: null,
    editingGate: null,
    addingGuardrail: false,
    addingGate: false
  };

  // Victor mode configurations
  var VICTOR_MODES = [
    {id: 'support', icon: '🤝', name: 'Support', description: 'Encouragement, reinforcement, refinement'},
    {id: 'challenge', icon: '🎯', name: 'Challenge', description: 'Skeptical, evidence-based opposition'},
    {id: 'mixed', icon: '⚖️', name: 'Mixed', description: 'Strengths and flaws clearly separated'},
    {id: 'red-flag', icon: '🚩', name: 'Red Flag', description: 'Faulty premise, high risk, stop motion'}
  ];

  // Default guardrails
  var DEFAULT_GUARDRAILS = [
    {guardrailId: 'gr_001', rule: 'Never delete user data without confirmation', enforcement: 'block', policyRef: 'POLICY-DATA-001'},
    {guardrailId: 'gr_002', rule: 'Require approval for external API calls', enforcement: 'warn', policyRef: 'POLICY-SEC-001'},
    {guardrailId: 'gr_003', rule: 'Log all autonomous decisions for audit', enforcement: 'log', policyRef: 'POLICY-AUDIT-001'}
  ];

  // DOM Elements
  var container = null;

  // Initialize
  function init() {
    container = document.getElementById('subpanel-autonomy');
    if (!container) return;

    state.projectId = getProjectId();
    loadConfig();

    // Listen for project changes
    window.addEventListener('project:changed', function() {
      state.projectId = getProjectId();
      loadConfig();
    });
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  function loadConfig() {
    state.loading = true;
    state.error = null;
    render();

    fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/autonomy/config')
      .then(function(resp) {
        if (!resp.ok) {
          if (resp.status === 404) {
            // No config yet, use defaults
            return {guardrails: DEFAULT_GUARDRAILS, approvalGates: [], allowedActions: [], blockedActions: [], victorMode: 'support', status: 'draft'};
          }
          throw new Error('Failed to load autonomy config');
        }
        return resp.json();
      })
      .then(function(data) {
        state.config = data;
        state.guardrails = data.guardrails || DEFAULT_GUARDRAILS;
        state.approvalGates = data.approvalGates || [];
        state.allowedActions = data.allowedActions || [];
        state.blockedActions = data.blockedActions || [];
        state.victorMode = data.victorMode || 'support';
        state.status = data.status || 'draft';
        state.loading = false;
        render();
      })
      .catch(function(err) {
        state.error = err.message || 'Failed to load autonomy config';
        state.loading = false;
        render();
      });
  }

  function saveConfig() {
    var config = {
      guardrails: state.guardrails,
      approvalGates: state.approvalGates,
      allowedActions: state.allowedActions,
      blockedActions: state.blockedActions,
      victorMode: state.victorMode,
      actorId: 'user'
    };

    fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/autonomy/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(config)
    })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Failed to save config');
        return resp.json();
      })
      .then(function() {
        state.status = 'active';
        render();
      })
      .catch(function(err) {
        console.error('Failed to save config:', err);
        state.error = err.message;
        render();
      });
  }

  function render() {
    if (!container) return;

    if (state.loading) {
      container.innerHTML = renderLoading();
      return;
    }

    if (state.error) {
      container.innerHTML = renderError();
      return;
    }

    var html = '<div class="autonomy-container" role="region" aria-label="Autonomy Configuration">';
    html += renderHeader();
    html += renderStanceIndicator();
    html += renderVictorModeSection();
    html += renderGuardrailsSection();
    html += renderApprovalGatesSection();
    html += renderBlockingSection();
    html += renderReadinessSummary();
    html += '</div>';

    container.innerHTML = html;
    attachHandlers();
  }

  function renderLoading() {
    return '<div class="autonomy-loading" role="status" aria-live="polite">' +
      '<div class="autonomy-spinner" aria-hidden="true"></div>' +
      '<p style="margin-top: var(--space-4);">Loading autonomy configuration...</p>' +
      '</div>';
  }

  function renderError() {
    return '<div class="autonomy-error" role="alert" aria-live="assertive">' +
      '<div class="autonomy-error-icon" aria-hidden="true">⚠️</div>' +
      '<h3 class="autonomy-error-title">Error Loading Configuration</h3>' +
      '<p class="autonomy-error-description">' + escapeHtml(state.error) + '</p>' +
      '<div class="autonomy-actions">' +
      '<button class="btn btn-primary" onclick="window.ZoAutonomy.refresh()">Try Again</button>' +
      '</div>' +
      '</div>';
  }

  function renderHeader() {
    var statusClass = state.status || 'draft';
    var statusLabel = state.status === 'active' ? 'Active' : state.status === 'suspended' ? 'Suspended' : 'Draft';

    return '<div class="autonomy-header">' +
      '<div>' +
      '<h2 class="autonomy-title" id="autonomy-main-title">Autonomy Configuration</h2>' +
      '<p class="autonomy-subtitle">Define guardrails and approval gates for autonomous execution</p>' +
      '</div>' +
      '<div class="autonomy-status ' + statusClass + '" role="status" aria-live="polite">' +
      '<span class="autonomy-status-dot" aria-hidden="true"></span>' +
      '<span>' + statusLabel + '</span>' +
      '</div>' +
      '</div>';
  }

  function renderStanceIndicator() {
    var mode = VICTOR_MODES.find(function(m) { return m.id === state.victorMode; }) || VICTOR_MODES[0];

    return '<div class="stance-indicator" role="status" aria-live="polite" aria-label="Current Victor stance">' +
      '<span class="stance-icon" aria-hidden="true">' + mode.icon + '</span>' +
      '<span class="stance-label">Victor Stance:</span>' +
      '<span class="stance-value">' + mode.name + '</span>' +
      '<span class="sr-only"> - ' + mode.description + '</span>' +
      '</div>';
  }

  function renderVictorModeSection() {
    var html = '<section class="victor-mode-section" role="region" aria-labelledby="victor-mode-title">' +
      '<h3 class="victor-mode-title" id="victor-mode-title">Victor Mode</h3>' +
      '<p class="victor-mode-description">Choose how Victor interacts with you during planning and execution.</p>' +
      '<div class="victor-mode-grid" role="radiogroup" aria-label="Victor mode selection">';

    VICTOR_MODES.forEach(function(mode) {
      var selected = state.victorMode === mode.id ? ' selected' : '';
      var ariaSelected = state.victorMode === mode.id ? 'true' : 'false';
      html += '<div class="victor-mode-option' + selected + '" ' +
        'data-mode="' + mode.id + '" ' +
        'role="radio" ' +
        'aria-checked="' + ariaSelected + '" ' +
        'tabindex="0" ' +
        'aria-label="' + mode.name + ': ' + mode.description + '">' +
        '<span class="victor-mode-icon" aria-hidden="true">' + mode.icon + '</span>' +
        '<span class="victor-mode-name">' + mode.name + '</span>' +
        '<span class="victor-mode-desc">' + mode.description + '</span>' +
        '</div>';
    });

    html += '</div></section>';
    return html;
  }

  function renderGuardrailsSection() {
    var html = '<section class="guardrails-section" role="region" aria-labelledby="guardrails-title">' +
      '<div class="section-header">' +
      '<h3 class="section-title" id="guardrails-title">Guardrails</h3>' +
      '<button class="btn btn-secondary btn-sm" id="add-guardrail-btn" aria-label="Add new guardrail">+ Add Guardrail</button>' +
      '</div>';

    if (state.guardrails.length === 0) {
      html += '<p class="autonomy-empty-description">No guardrails configured. Add rules to constrain autonomous execution.</p>';
    } else {
      html += '<div class="guardrails-list" role="list" aria-label="Guardrails list">';

      state.guardrails.forEach(function(guardrail, index) {
        html += '<div class="guardrail-item" data-guardrail-id="' + guardrail.guardrailId + '" role="listitem">' +
          '<div class="guardrail-content">' +
          '<p class="guardrail-rule">' + escapeHtml(guardrail.rule) + '</p>' +
          (guardrail.policyRef ? '<p class="guardrail-policy">Ref: ' + escapeHtml(guardrail.policyRef) + '</p>' : '') +
          '</div>' +
          '<div class="enforcement-toggle" role="group" aria-label="Enforcement level for guardrail ' + (index + 1) + '">' +
          renderEnforcementButton(guardrail, 'block', index) +
          renderEnforcementButton(guardrail, 'warn', index) +
          renderEnforcementButton(guardrail, 'log', index) +
          '</div>' +
          '<button class="btn-icon btn-delete-guardrail" data-index="' + index + '" aria-label="Remove guardrail: ' + escapeHtml(guardrail.rule.substring(0, 30)) + '">×</button>' +
          '</div>';
      });

      html += '</div>';
    }

    // Add form if adding
    if (state.addingGuardrail) {
      html += '<div class="add-form" id="new-guardrail-form" role="form" aria-label="Add new guardrail">' +
        '<input type="text" class="add-form-input" id="new-guardrail-rule" ' +
        'placeholder="Enter guardrail rule..." ' +
        'aria-label="Guardrail rule" ' +
        'aria-required="true" ' +
        'aria-describedby="guardrule-hint">' +
        '<span id="guardrule-hint" class="sr-only">Enter the rule that should constrain autonomous execution</span>' +
        '<button class="btn btn-primary btn-sm" id="save-guardrail-btn">Save</button>' +
        '<button class="btn btn-secondary btn-sm" id="cancel-guardrail-btn">Cancel</button>' +
        '</div>';
    }

    html += '</section>';
    return html;
  }

  function renderEnforcementButton(guardrail, enforcement, index) {
    var active = guardrail.enforcement === enforcement ? ' active ' + enforcement : '';
    var ariaPressed = guardrail.enforcement === enforcement ? 'true' : 'false';
    return '<button class="enforcement-btn' + active + '" ' +
      'data-enforcement="' + enforcement + '" ' +
      'data-index="' + index + '" ' +
      'role="button" ' +
      'aria-pressed="' + ariaPressed + '" ' +
      'aria-label="Set enforcement to ' + enforcement + '">' +
      enforcement.charAt(0).toUpperCase() + enforcement.slice(1) +
      '</button>';
  }

  function renderApprovalGatesSection() {
    var html = '<section class="approval-gates-section" role="region" aria-labelledby="approval-gates-title">' +
      '<div class="section-header">' +
      '<h3 class="section-title" id="approval-gates-title">Approval Gates</h3>' +
      '<button class="btn btn-secondary btn-sm" id="add-gate-btn" aria-label="Add new approval gate">+ Add Gate</button>' +
      '</div>';

    if (state.approvalGates.length === 0) {
      html += '<p class="autonomy-empty-description">No approval gates configured. Gates require human approval for specific triggers.</p>';
    } else {
      html += '<div class="approval-gates-list" role="list" aria-label="Approval gates list">';

      state.approvalGates.forEach(function(gate, index) {
        html += '<div class="approval-gate-item" data-gate-id="' + gate.gateId + '" role="listitem">' +
          '<p class="gate-trigger">' + escapeHtml(gate.trigger) + '</p>' +
          '<span class="gate-approver">' + escapeHtml(gate.approver) + '</span>' +
          '<div class="gate-timeout">' +
          '<span class="gate-timeout-label">Timeout:</span>' +
          '<span class="gate-timeout-value">' + formatTimeout(gate.timeout) + '</span>' +
          '</div>' +
          '<div class="gate-actions">' +
          '<button class="btn-icon btn-delete-gate" data-index="' + index + '" aria-label="Remove approval gate: ' + escapeHtml(gate.trigger.substring(0, 30)) + '">×</button>' +
          '</div>' +
          '</div>';
      });

      html += '</div>';
    }

    // Add form if adding
    if (state.addingGate) {
      html += '<div class="add-form" id="new-gate-form" role="form" aria-label="Add new approval gate">' +
        '<input type="text" class="add-form-input" id="new-gate-trigger" ' +
        'placeholder="Trigger condition..." ' +
        'aria-label="Trigger condition" ' +
        'aria-required="true" ' +
        'aria-describedby="gate-trigger-hint">' +
        '<span id="gate-trigger-hint" class="sr-only">Condition that triggers approval requirement</span>' +
        '<input type="text" class="add-form-input" id="new-gate-approver" ' +
        'placeholder="Approver role..." ' +
        'aria-label="Approver role" ' +
        'aria-required="true">' +
        '<input type="number" class="add-form-input" id="new-gate-timeout" ' +
        'placeholder="Timeout (seconds)" value="3600" ' +
        'aria-label="Timeout in seconds">' +
        '<button class="btn btn-primary btn-sm" id="save-gate-btn">Save</button>' +
        '<button class="btn btn-secondary btn-sm" id="cancel-gate-btn">Cancel</button>' +
        '</div>';
    }

    html += '</section>';
    return html;
  }

  function renderBlockingSection() {
    var blockingConditions = calculateBlockingConditions();

    if (blockingConditions.length === 0) {
      return '';
    }

    var html = '<section class="blocking-section" role="region" aria-labelledby="blocking-title">' +
      '<div class="section-header">' +
      '<h3 class="section-title" id="blocking-title">Blocking Conditions</h3>' +
      '</div>' +
      '<div class="blocking-list" role="list" aria-label="Blocking conditions list">';

    blockingConditions.forEach(function(condition) {
      html += '<div class="blocking-item" role="listitem">' +
        '<span class="blocking-icon" aria-hidden="true">⚠️</span>' +
        '<div class="blocking-content">' +
        '<h4 class="blocking-title">' + escapeHtml(condition.title) + '</h4>' +
        '<p class="blocking-description">' + escapeHtml(condition.description) + '</p>' +
        '</div>' +
        '<a class="btn btn-secondary btn-sm blocking-action" data-navigate="' + condition.navigate + '" href="#" role="button">Resolve</a>' +
        '</div>';
    });

    html += '</div></section>';
    return html;
  }

  function calculateBlockingConditions() {
    var conditions = [];

    // Check if no guardrails
    if (state.guardrails.length === 0) {
      conditions.push({
        title: 'No Guardrails Defined',
        description: 'Add at least one guardrail before activating autonomy.',
        navigate: 'autonomy'
      });
    }

    // Check if all guardrails are 'log' only
    var hasBlocking = state.guardrails.some(function(g) { return g.enforcement === 'block'; });
    if (state.guardrails.length > 0 && !hasBlocking) {
      conditions.push({
        title: 'No Blocking Guardrails',
        description: 'At least one guardrail should enforce blocking for safety.',
        navigate: 'autonomy'
      });
    }

    return conditions;
  }

  function renderReadinessSummary() {
    var guardrailsReady = state.guardrails.length > 0;
    var gatesReady = true; // Gates are optional
    var victorModeReady = !!state.victorMode;

    var readyCount = [guardrailsReady, gatesReady, victorModeReady].filter(Boolean).length;
    var totalCount = 3;
    var percentage = Math.round((readyCount / totalCount) * 100);

    var html = '<section class="blocking-section" style="background: var(--color-surface);" role="region" aria-labelledby="readiness-title">' +
      '<div class="section-header">' +
      '<h3 class="section-title" id="readiness-title">Readiness Summary</h3>' +
      '<span class="autonomy-status ' + (percentage === 100 ? 'active' : 'draft') + '" role="status" aria-live="polite">' + readyCount + '/' + totalCount + ' Ready</span>' +
      '</div>' +
      '<div class="readiness-summary" role="list" aria-label="Readiness checklist">' +
      '<div class="readiness-card" role="listitem">' +
      '<h4 class="readiness-card-title">' +
      '<span class="' + (guardrailsReady ? 'ready' : 'blocked') + '" aria-hidden="true">' + (guardrailsReady ? '✓' : '○') + '</span> ' +
      'Guardrails' +
      (guardrailsReady ? '<span class="sr-only">Complete</span>' : '<span class="sr-only">Incomplete</span>') +
      '</h4>' +
      '<div class="readiness-list">' +
      '<div class="readiness-item">' +
      '<span class="readiness-item-icon ' + (guardrailsReady ? 'ready' : 'blocked') + '" aria-hidden="true">' + (guardrailsReady ? '✓' : '○') + '</span>' +
      '<span>' + state.guardrails.length + ' guardrails defined</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="readiness-card" role="listitem">' +
      '<h4 class="readiness-card-title">' +
      '<span class="' + (victorModeReady ? 'ready' : 'blocked') + '" aria-hidden="true">' + (victorModeReady ? '✓' : '○') + '</span> ' +
      'Configuration' +
      (victorModeReady ? '<span class="sr-only">Complete</span>' : '<span class="sr-only">Incomplete</span>') +
      '</h4>' +
      '<div class="readiness-list">' +
      '<div class="readiness-item">' +
      '<span class="readiness-item-icon ' + (victorModeReady ? 'ready' : 'blocked') + '" aria-hidden="true">' + (victorModeReady ? '✓' : '○') + '</span>' +
      '<span>Victor mode: ' + escapeHtml(state.victorMode || 'not set') + '</span>' +
      '</div>' +
      '<div class="readiness-item">' +
      '<span class="readiness-item-icon ready" aria-hidden="true">○</span>' +
      '<span>' + state.approvalGates.length + ' approval gates</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div style="margin-top: var(--space-4);">' +
      '<button class="btn btn-primary" id="save-config-btn" aria-label="' + (state.status === 'active' ? 'Update Configuration' : 'Activate Autonomy') + '">' + (state.status === 'active' ? 'Update Configuration' : 'Activate Autonomy') + '</button>' +
      '</div>' +
      '</section>';

    return html;
  }

  function formatTimeout(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm';
    return Math.round(seconds / 3600) + 'h';
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function attachHandlers() {
    // Victor mode selection with keyboard support
    var modeOptions = container.querySelectorAll('.victor-mode-option');
    modeOptions.forEach(function(option) {
      option.addEventListener('click', function() {
        state.victorMode = option.dataset.mode;
        render();
      });
      option.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.victorMode = option.dataset.mode;
          render();
        }
      });
    });

    // Enforcement toggles
    var enforcementBtns = container.querySelectorAll('.enforcement-btn');
    enforcementBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var index = parseInt(btn.dataset.index, 10);
        var enforcement = btn.dataset.enforcement;
        if (state.guardrails[index]) {
          state.guardrails[index].enforcement = enforcement;
          render();
        }
      });
    });

    // Add guardrail
    var addGuardrailBtn = container.querySelector('#add-guardrail-btn');
    if (addGuardrailBtn) {
      addGuardrailBtn.addEventListener('click', function() {
        state.addingGuardrail = true;
        render();
        setTimeout(function() {
          var input = document.getElementById('new-guardrail-rule');
          if (input) input.focus();
        }, 50);
      });
    }

    // Save guardrail
    var saveGuardrailBtn = container.querySelector('#save-guardrail-btn');
    if (saveGuardrailBtn) {
      saveGuardrailBtn.addEventListener('click', function() {
        var ruleInput = document.getElementById('new-guardrail-rule');
        if (ruleInput && ruleInput.value.trim()) {
          state.guardrails.push({
            guardrailId: 'gr_' + Date.now().toString(36),
            rule: ruleInput.value.trim(),
            enforcement: 'warn',
            policyRef: null
          });
          state.addingGuardrail = false;
          render();
        }
      });
    }

    // Cancel guardrail
    var cancelGuardrailBtn = container.querySelector('#cancel-guardrail-btn');
    if (cancelGuardrailBtn) {
      cancelGuardrailBtn.addEventListener('click', function() {
        state.addingGuardrail = false;
        render();
      });
    }

    // Delete guardrail
    var deleteGuardrailBtns = container.querySelectorAll('.btn-delete-guardrail');
    deleteGuardrailBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var index = parseInt(btn.dataset.index, 10);
        state.guardrails.splice(index, 1);
        render();
      });
    });

    // Add gate
    var addGateBtn = container.querySelector('#add-gate-btn');
    if (addGateBtn) {
      addGateBtn.addEventListener('click', function() {
        state.addingGate = true;
        render();
        setTimeout(function() {
          var input = document.getElementById('new-gate-trigger');
          if (input) input.focus();
        }, 50);
      });
    }

    // Save gate
    var saveGateBtn = container.querySelector('#save-gate-btn');
    if (saveGateBtn) {
      saveGateBtn.addEventListener('click', function() {
        var triggerInput = document.getElementById('new-gate-trigger');
        var approverInput = document.getElementById('new-gate-approver');
        var timeoutInput = document.getElementById('new-gate-timeout');

        if (triggerInput && triggerInput.value.trim() && approverInput && approverInput.value.trim()) {
          state.approvalGates.push({
            gateId: 'gate_' + Date.now().toString(36),
            trigger: triggerInput.value.trim(),
            approver: approverInput.value.trim(),
            timeout: parseInt(timeoutInput ? timeoutInput.value : 3600, 10) || 3600
          });
          state.addingGate = false;
          render();
        }
      });
    }

    // Cancel gate
    var cancelGateBtn = container.querySelector('#cancel-gate-btn');
    if (cancelGateBtn) {
      cancelGateBtn.addEventListener('click', function() {
        state.addingGate = false;
        render();
      });
    }

    // Delete gate
    var deleteGateBtns = container.querySelectorAll('.btn-delete-gate');
    deleteGateBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var index = parseInt(btn.dataset.index, 10);
        state.approvalGates.splice(index, 1);
        render();
      });
    });

    // Save configuration
    var saveConfigBtn = container.querySelector('#save-config-btn');
    if (saveConfigBtn) {
      saveConfigBtn.addEventListener('click', function() {
        saveConfig();
      });
    }

    // Navigation buttons
    var navBtns = container.querySelectorAll('[data-navigate]');
    navBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var route = btn.dataset.navigate;
        window.dispatchEvent(new CustomEvent('navigate', {detail: {route: route}}));
      });
    });
  }

  // Expose public API
  window.ZoAutonomy = {
    refresh: loadConfig,
    getState: function() {
      return state;
    },
    setVictorMode: function(mode) {
      if (['support', 'challenge', 'mixed', 'red-flag'].includes(mode)) {
        state.victorMode = mode;
        render();
      }
    },
    addGuardrail: function(rule, enforcement) {
      state.guardrails.push({
        guardrailId: 'gr_' + Date.now().toString(36),
        rule: rule,
        enforcement: enforcement || 'warn',
        policyRef: null
      });
      render();
    },
    removeGuardrail: function(index) {
      state.guardrails.splice(index, 1);
      render();
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
