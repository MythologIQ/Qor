/**
 * Risk Register UI Component
 *
 * Enhanced with API wiring, creation dialog, inline editing, and filtering.
 * WCAG 2.1 AA compliant with keyboard navigation and ARIA attributes.
 */
(function() {
  "use strict";

  // State
  var state = {
    projectId: null,
    risks: [],
    phases: [],
    filters: {
      phase: null,
      status: null,
      severity: null
    },
    matrix: null,
    loading: false,
    error: null,
    showAddDialog: false,
    editingRisk: null
  };

  // DOM Elements
  var container = null;

  // Initialize
  function init() {
    container = document.getElementById('risk-container');
    if (!container) return;

    state.projectId = getProjectId();
    loadRiskData();

    // Listen for project changes
    window.addEventListener('project:changed', function() {
      state.projectId = getProjectId();
      loadRiskData();
    });
    
    // Keyboard navigation
    container.addEventListener('keydown', handleKeydown);
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  function loadRiskData() {
    state.loading = true;
    state.error = null;
    render();

    // Fetch risks and phases in parallel
    var riskPromise = typeof PlanningClient !== 'undefined' 
      ? PlanningClient.getRisks() 
      : fallbackFetchRisks();

    var phasePromise = typeof PlanningClient !== 'undefined'
      ? PlanningClient.getPhases()
      : Promise.resolve([]);

    Promise.all([riskPromise, phasePromise])
      .then(function(results) {
        state.risks = results[0] || [];
        state.phases = results[1] || [];
        state.matrix = buildMatrix(state.risks);
        state.loading = false;
        render();
        announceToScreenReader('Risk register loaded with ' + state.risks.length + ' risks');
      })
      .catch(function(err) {
        state.error = err.message || 'Failed to load risk data';
        state.loading = false;
        render();
        announceToScreenReader('Error loading risk register: ' + state.error);
      });
  }

  function fallbackFetchRisks() {
    return fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/risk/register')
      .then(function(resp) {
        if (!resp.ok) {
          if (resp.status === 404) return [];
          throw new Error('Failed to load risks');
        }
        return resp.json();
      })
      .then(function(data) { return data.risks || []; });
  }

  function announceToScreenReader(message) {
    var announcer = document.getElementById('risk-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  }

  function buildMatrix(risks) {
    // 3x3 matrix: likelihood (low, medium, high) x impact (low, medium, high)
    var matrix = [
      [{ risks: [] }, { risks: [] }, { risks: [] }],
      [{ risks: [] }, { risks: [] }, { risks: [] }],
      [{ risks: [] }, { risks: [] }, { risks: [] }]
    ];

    risks.forEach(function(risk) {
      var lIdx = likelihoodToIndex(risk.likelihood);
      var iIdx = impactToIndex(risk.impact);
      if (lIdx >= 0 && iIdx >= 0) {
        matrix[2 - lIdx][iIdx].risks.push(risk);
      }
    });

    return matrix;
  }

  function likelihoodToIndex(l) {
    return l === 'high' ? 2 : l === 'medium' ? 1 : l === 'low' ? 0 : -1;
  }

  function impactToIndex(i) {
    return i === 'high' ? 2 : i === 'medium' ? 1 : i === 'low' ? 0 : -1;
  }

  function getSeverity(likelihood, impact) {
    var l = likelihoodToIndex(likelihood) + 1;
    var i = impactToIndex(impact) + 1;
    if (l < 1 || i < 1) return 'unknown';
    var score = l * i;
    return score <= 2 ? 'low' : score <= 6 ? 'medium' : 'high';
  }

  // === RENDERING ===

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

    var filteredRisks = applyFilters(state.risks);

    var html = '<div class="risk-register" role="region" aria-label="Risk register">';
    html += '<div id="risk-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>';
    html += renderHeader();
    html += renderFilters();
    html += renderMatrix();
    html += renderRiskList(filteredRisks);
    if (state.showAddDialog) {
      html += renderAddDialog();
    }
    html += '</div>';

    container.innerHTML = html;
    attachHandlers();
    
    // Focus management for dialog
    if (state.showAddDialog) {
      var firstInput = container.querySelector('#new-risk-description');
      if (firstInput) firstInput.focus();
    }
  }

  function renderLoading() {
    return '<div class="risk-loading" role="status" aria-label="Loading risk register">' +
      '<div class="risk-spinner" aria-hidden="true"></div>' +
      '<p>Loading risk register...</p>' +
      '</div>';
  }

  function renderError() {
    return '<div class="risk-error" role="alert">' +
      '<div class="risk-error-icon" aria-hidden="true">⚠️</div>' +
      '<h3>Error Loading Risks</h3>' +
      '<p>' + escapeHtml(state.error) + '</p>' +
      '<button class="btn btn-primary" onclick="window.ZoRiskRegister.refresh()" aria-label="Try loading risk register again">Try Again</button>' +
      '</div>';
  }

  function renderHeader() {
    var unresolvedCount = state.risks.filter(function(r) { 
      return r.status !== 'mitigated' && r.status !== 'accepted'; 
    }).length;
    var mitigatedCount = state.risks.filter(function(r) { 
      return r.status === 'mitigated'; 
    }).length;

    return '<div class="risk-register-header">' +
      '<div>' +
        '<h3 id="risk-register-title">Risk Register</h3>' +
        '<div class="risk-summary" aria-describedby="risk-register-title">' + state.risks.length + ' risks • ' +
          unresolvedCount + ' unresolved • ' +
          mitigatedCount + ' mitigated</div>' +
      '</div>' +
      '<button class="btn btn-primary" data-action="add" aria-label="Add new risk">+ Add Risk</button>' +
    '</div>';
  }

  function renderFilters() {
    var phaseOptions = '<option value="">All Phases</option>';
    state.phases.forEach(function(p) {
      phaseOptions += '<option value="' + p.phaseId + '">' + escapeHtml(p.name) + '</option>';
    });

    return '<div class="risk-filters" role="group" aria-label="Risk filters">' +
      '<label class="visually-hidden" for="risk-filter-phase">Filter by phase</label>' +
      '<select id="risk-filter-phase" class="risk-filter-select" data-filter="phase" aria-label="Filter by phase">' + phaseOptions + '</select>' +
      '<label class="visually-hidden" for="risk-filter-status">Filter by status</label>' +
      '<select id="risk-filter-status" class="risk-filter-select" data-filter="status" aria-label="Filter by status">' +
        '<option value="">All Statuses</option>' +
        '<option value="identified">Identified</option>' +
        '<option value="analyzing">Analyzing</option>' +
        '<option value="mitigating">Mitigating</option>' +
        '<option value="mitigated">Mitigated</option>' +
        '<option value="accepted">Accepted</option>' +
      '</select>' +
      '<label class="visually-hidden" for="risk-filter-severity">Filter by severity</label>' +
      '<select id="risk-filter-severity" class="risk-filter-select" data-filter="severity" aria-label="Filter by severity">' +
        '<option value="">All Severities</option>' +
        '<option value="high">High</option>' +
        '<option value="medium">Medium</option>' +
        '<option value="low">Low</option>' +
      '</select>' +
    '</div>';
  }

  function renderMatrix() {
    if (!state.matrix) return '';

    var html = '<div class="risk-matrix-container">';
    html += '<div class="risk-matrix-title" id="risk-matrix-title">Risk Matrix</div>';
    html += '<div class="risk-matrix" role="grid" aria-labelledby="risk-matrix-title">';
    
    // Header row
    html += '<div role="row">';
    html += '<div role="gridcell" class="risk-matrix-label"></div>';
    html += '<div role="columnheader" class="risk-matrix-label impact-label">Low Impact</div>';
    html += '<div role="columnheader" class="risk-matrix-label impact-label">Medium Impact</div>';
    html += '<div role="columnheader" class="risk-matrix-label impact-label">High Impact</div>';
    html += '</div>';

    var likelihoods = ['high', 'medium', 'low'];
    for (var i = 0; i < likelihoods.length; i++) {
      html += '<div role="row">';
      // Likelihood label
      html += '<div role="rowheader" class="risk-matrix-label likelihood-label">' + capitalize(likelihoods[i]) + ' Likelihood</div>';
      
      for (var j = 0; j < 3; j++) {
        var cell = state.matrix[2 - i][j];
        var impact = j === 0 ? 'low' : j === 1 ? 'medium' : 'high';
        var severity = getSeverity(likelihoods[i], impact);
        var riskCount = cell.risks.length;
        html += '<div role="gridcell" class="risk-matrix-cell severity-' + severity + '" ' +
          'data-likelihood="' + likelihoods[i] + '" data-impact="' + impact + '" ' +
          'aria-label="' + capitalize(likelihoods[i]) + ' likelihood, ' + impact + ' impact: ' + riskCount + ' risk' + (riskCount !== 1 ? 's' : '') + '" ' +
          'tabindex="0">';
        for (var k = 0; k < cell.risks.length; k++) {
          html += '<span class="risk-chip" data-risk-id="' + cell.risks[k].riskId + '" ' +
            'title="' + escapeHtml(cell.risks[k].description) + '" ' +
            'tabindex="0" role="button" aria-label="Risk: ' + escapeHtml(cell.risks[k].description.substring(0, 50)) + '">';
          html += (k + 1) + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderRiskList(risks) {
    var html = '<div class="risk-list" role="list" aria-label="Risk cards">';
    if (risks.length === 0) {
      html += '<div class="risk-empty" role="status">No risks match the current filters.</div>';
    } else {
      for (var i = 0; i < risks.length; i++) {
        html += renderRiskCard(risks[i]);
      }
    }
    html += '</div>';
    return html;
  }

  function renderRiskCard(risk) {
    var severity = getSeverity(risk.likelihood, risk.impact);
    var isEditing = state.editingRisk === risk.riskId;

    var html = '<div class="risk-card" role="listitem" data-risk-id="' + risk.riskId + '" ' +
      'aria-label="Risk: ' + escapeHtml(risk.description.substring(0, 50)) + ', Severity: ' + severity + ', Status: ' + risk.status + '">';
    html += '<div class="risk-card-header">';
    html += '<span class="risk-score score-' + severity + '" aria-label="Risk score: ' + ((likelihoodToIndex(risk.likelihood) + 1) * (impactToIndex(risk.impact) + 1)) + '">Score: ' + ((likelihoodToIndex(risk.likelihood) + 1) * (impactToIndex(risk.impact) + 1)) + '</span>';
    html += '<span class="risk-status-badge status-' + risk.status + '" aria-label="Status: ' + risk.status + '">' + risk.status + '</span>';
    html += '</div>';

    if (isEditing) {
      html += renderEditForm(risk);
    } else {
      html += '<p class="risk-description">' + escapeHtml(risk.description) + '</p>';
      
      if (risk.mitigation) {
        html += '<div class="risk-mitigation"><strong>Mitigation:</strong> ' + escapeHtml(risk.mitigation) + '</div>';
      }
      
      if (risk.owner) {
        html += '<div class="risk-owner"><strong>Owner:</strong> ' + escapeHtml(risk.owner) + '</div>';
      }

      html += '<div class="risk-card-actions">';
      html += '<button class="btn btn-sm" data-action="edit" data-risk-id="' + risk.riskId + '" aria-label="Edit this risk">Edit</button>';
      
      if (risk.status !== 'mitigated' && risk.status !== 'accepted') {
        html += '<button class="btn btn-sm btn-secondary" data-action="mitigate" data-risk-id="' + risk.riskId + '" aria-label="Mark this risk as mitigated">Mark Mitigated</button>';
      }
      
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderEditForm(risk) {
    return '<div class="risk-edit-form" role="form" aria-label="Edit risk form">' +
      '<div class="risk-edit-row">' +
        '<label for="edit-risk-description-' + risk.riskId + '">Description</label>' +
        '<textarea id="edit-risk-description-' + risk.riskId + '" class="risk-edit-input" data-field="description" aria-required="true">' + escapeHtml(risk.description) + '</textarea>' +
      '</div>' +
      '<div class="risk-edit-row">' +
        '<label for="edit-risk-mitigation-' + risk.riskId + '">Mitigation</label>' +
        '<textarea id="edit-risk-mitigation-' + risk.riskId + '" class="risk-edit-input" data-field="mitigation">' + escapeHtml(risk.mitigation || '') + '</textarea>' +
      '</div>' +
      '<div class="risk-edit-row">' +
        '<label for="edit-risk-status-' + risk.riskId + '">Status</label>' +
        '<select id="edit-risk-status-' + risk.riskId + '" class="risk-edit-select" data-field="status">' +
          '<option value="identified"' + (risk.status === 'identified' ? ' selected' : '') + '>Identified</option>' +
          '<option value="analyzing"' + (risk.status === 'analyzing' ? ' selected' : '') + '>Analyzing</option>' +
          '<option value="mitigating"' + (risk.status === 'mitigating' ? ' selected' : '') + '>Mitigating</option>' +
          '<option value="mitigated"' + (risk.status === 'mitigated' ? ' selected' : '') + '>Mitigated</option>' +
          '<option value="accepted"' + (risk.status === 'accepted' ? ' selected' : '') + '>Accepted</option>' +
        '</select>' +
      '</div>' +
      '<div class="risk-edit-actions">' +
        '<button class="btn btn-primary btn-sm" data-action="save" data-risk-id="' + risk.riskId + '" aria-label="Save changes">Save</button>' +
        '<button class="btn btn-sm" data-action="cancel-edit" aria-label="Cancel editing">Cancel</button>' +
      '</div>' +
    '</div>';
  }

  function renderAddDialog() {
    var phaseOptions = '<option value="">Select Phase</option>';
    state.phases.forEach(function(p) {
      phaseOptions += '<option value="' + p.phaseId + '">' + escapeHtml(p.name) + '</option>';
    });

    return '<div class="risk-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="risk-dialog-title">' +
      '<div class="risk-dialog">' +
        '<div class="risk-dialog-header">' +
          '<h3 id="risk-dialog-title">Add New Risk</h3>' +
          '<button class="risk-dialog-close" data-action="close-dialog" aria-label="Close dialog">&times;</button>' +
        '</div>' +
        '<div class="risk-dialog-body">' +
          '<div class="risk-dialog-row">' +
            '<label for="new-risk-phase">Phase</label>' +
            '<select id="new-risk-phase" class="risk-dialog-input" aria-label="Select phase for this risk">' + phaseOptions + '</select>' +
          '</div>' +
          '<div class="risk-dialog-row">' +
            '<label for="new-risk-description">Description <span aria-hidden="true">*</span><span class="sr-only">(required)</span></label>' +
            '<textarea id="new-risk-description" class="risk-dialog-input" placeholder="Describe the risk..." aria-required="true" required></textarea>' +
          '</div>' +
          '<div class="risk-dialog-row risk-dialog-row-half">' +
            '<div>' +
              '<label for="new-risk-likelihood">Likelihood</label>' +
              '<select id="new-risk-likelihood" class="risk-dialog-input" aria-label="Select likelihood level">' +
                '<option value="low">Low</option>' +
                '<option value="medium" selected>Medium</option>' +
                '<option value="high">High</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label for="new-risk-impact">Impact</label>' +
              '<select id="new-risk-impact" class="risk-dialog-input" aria-label="Select impact level">' +
                '<option value="low">Low</option>' +
                '<option value="medium" selected>Medium</option>' +
                '<option value="high">High</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="risk-dialog-row">' +
            '<label for="new-risk-mitigation">Mitigation</label>' +
            '<textarea id="new-risk-mitigation" class="risk-dialog-input" placeholder="How will this risk be mitigated?" aria-label="Enter mitigation plan"></textarea>' +
          '</div>' +
          '<div class="risk-dialog-row">' +
            '<label for="new-risk-owner">Owner</label>' +
            '<input type="text" id="new-risk-owner" class="risk-dialog-input" placeholder="Who is responsible?" aria-label="Enter risk owner name">' +
          '</div>' +
        '</div>' +
        '<div class="risk-dialog-footer">' +
          '<button class="btn" data-action="close-dialog" aria-label="Cancel and close dialog">Cancel</button>' +
          '<button class="btn btn-primary" data-action="create-risk" aria-label="Add this risk">Add Risk</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // === FILTERS ===

  function applyFilters(risks) {
    return risks.filter(function(risk) {
      if (state.filters.phase && risk.phaseId !== state.filters.phase) return false;
      if (state.filters.status && risk.status !== state.filters.status) return false;
      if (state.filters.severity) {
        var severity = getSeverity(risk.likelihood, risk.impact);
        if (severity !== state.filters.severity) return false;
      }
      return true;
    });
  }

  // === KEYBOARD NAVIGATION ===

  function handleKeydown(e) {
    // Escape to close dialog
    if (e.key === 'Escape' && state.showAddDialog) {
      state.showAddDialog = false;
      render();
      announceToScreenReader('Dialog closed');
      return;
    }
    
    // Tab trap for dialog
    if (state.showAddDialog && e.key === 'Tab') {
      var focusableElements = container.querySelectorAll('.risk-dialog button, .risk-dialog input, .risk-dialog select, .risk-dialog textarea');
      var firstElement = focusableElements[0];
      var lastElement = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
    
    // Enter/Space on risk chips
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('risk-chip')) {
      e.preventDefault();
      var riskId = e.target.getAttribute('data-risk-id');
      scrollToRisk(riskId);
    }
  }

  // === API ACTIONS ===

  function createRisk() {
    var phaseId = document.getElementById('new-risk-phase').value;
    var description = document.getElementById('new-risk-description').value;
    var likelihood = document.getElementById('new-risk-likelihood').value;
    var impact = document.getElementById('new-risk-impact').value;
    var mitigation = document.getElementById('new-risk-mitigation').value;
    var owner = document.getElementById('new-risk-owner').value;

    if (!description) {
      announceToScreenReader('Description is required');
      alert('Description is required');
      return;
    }

    var promise = typeof PlanningClient !== 'undefined'
      ? PlanningClient.addRisk(phaseId, description, likelihood, impact, mitigation, owner, 'user')
      : fallbackCreateRisk(phaseId, description, likelihood, impact, mitigation, owner);

    promise
      .then(function() {
        state.showAddDialog = false;
        loadRiskData();
        announceToScreenReader('Risk created successfully');
      })
      .catch(function(err) {
        announceToScreenReader('Failed to create risk: ' + err.message);
        alert('Failed to create risk: ' + err.message);
      });
  }

  function fallbackCreateRisk(phaseId, description, likelihood, impact, mitigation, owner) {
    return fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/risk/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phaseId: phaseId,
        description: description,
        likelihood: likelihood,
        impact: impact,
        mitigation: mitigation,
        owner: owner,
        actorId: 'user'
      })
    }).then(function(resp) {
      if (!resp.ok) throw new Error('Failed to create risk');
      return resp.json();
    });
  }

  function updateRisk(riskId, updates) {
    fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/risk/register/' + riskId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, updates, { actorId: 'user' }))
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Failed to update risk');
      state.editingRisk = null;
      loadRiskData();
      announceToScreenReader('Risk updated successfully');
    })
    .catch(function(err) {
      announceToScreenReader('Failed to update risk: ' + err.message);
      alert('Failed to update risk: ' + err.message);
    });
  }

  // === EVENT HANDLERS ===

  function attachHandlers() {
    var self = this;

    // Action buttons
    var buttons = container.querySelectorAll('[data-action]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function(e) {
        var action = e.target.getAttribute('data-action');
        var riskId = e.target.getAttribute('data-risk-id');
        handleAction(action, riskId, e.target);
      });
    }

    // Filter selects
    var filters = container.querySelectorAll('[data-filter]');
    for (var j = 0; j < filters.length; j++) {
      filters[j].addEventListener('change', function(e) {
        var filterType = e.target.getAttribute('data-filter');
        state.filters[filterType] = e.target.value || null;
        announceToScreenReader('Filter changed to ' + (e.target.value || 'all'));
        render();
      });
    }

    // Matrix cell clicks
    var cells = container.querySelectorAll('.risk-matrix-cell');
    for (var k = 0; k < cells.length; k++) {
      cells[k].addEventListener('click', function(e) {
        if (e.target.classList.contains('risk-chip')) {
          var riskId = e.target.getAttribute('data-risk-id');
          scrollToRisk(riskId);
        }
      });
    }
  }

  function handleAction(action, riskId, target) {
    switch (action) {
      case 'add':
        state.showAddDialog = true;
        render();
        announceToScreenReader('Add risk dialog opened');
        break;
      case 'close-dialog':
        state.showAddDialog = false;
        render();
        announceToScreenReader('Dialog closed');
        break;
      case 'create-risk':
        createRisk();
        break;
      case 'edit':
        state.editingRisk = riskId;
        render();
        announceToScreenReader('Editing risk');
        break;
      case 'cancel-edit':
        state.editingRisk = null;
        render();
        announceToScreenReader('Edit cancelled');
        break;
      case 'save':
        saveEditedRisk(riskId);
        break;
      case 'mitigate':
        updateRisk(riskId, { status: 'mitigated' });
        break;
    }
  }

  function saveEditedRisk(riskId) {
    var card = container.querySelector('[data-risk-id="' + riskId + '"]');
    var inputs = card.querySelectorAll('[data-field]');
    var updates = {};
    
    for (var i = 0; i < inputs.length; i++) {
      var field = inputs[i].getAttribute('data-field');
      updates[field] = inputs[i].value;
    }
    
    updateRisk(riskId, updates);
  }

  function scrollToRisk(riskId) {
    var card = container.querySelector('[data-risk-id="' + riskId + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight');
      card.focus();
      announceToScreenReader('Navigated to risk');
      setTimeout(function() { card.classList.remove('highlight'); }, 2000);
    }
  }

  // === UTILITIES ===

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.ZoRiskRegister = {
    refresh: loadRiskData,
    getState: function() { return state; }
  };
})();
