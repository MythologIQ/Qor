/**
 * Path UI Component
 *
 * Phase timeline and task management.
 * Displays phases as cards with tasks, progress bars, and drag-to-reorder.
 * 
 * WCAG 2.1 AA compliant with keyboard navigation and ARIA attributes.
 */
(function() {
  'use strict';

  // State
  var state = {
    projectId: null,
    phases: [],
    loading: false,
    error: null,
    draggingPhaseId: null,
    dropTargetId: null,
    focusedPhaseIndex: 0
  };

  // DOM Elements
  var container = null;

  // Initialize
  function init() {
    container = document.getElementById('subpanel-path');
    if (!container) return;

    state.projectId = getProjectId();
    loadPhases();

    // Listen for constellation updates
    window.addEventListener('genesis:event', function(e) {
      if (e.detail && e.detail.type === 'clustering_completed') {
        loadPhases();
      }
    });
    
    // Keyboard navigation
    container.addEventListener('keydown', handleKeydown);
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  function loadPhases() {
    state.loading = true;
    render();

    if (typeof PlanningClient !== 'undefined' && PlanningClient.fetchPath) {
      PlanningClient.fetchPath(state.projectId)
        .then(function(data) {
          state.phases = data.phases || [];
          state.loading = false;
          render();
          announceToScreenReader('Roadmap loaded with ' + state.phases.length + ' phases');
        })
        .catch(function(err) {
          state.error = err.message || 'Failed to load phases';
          state.loading = false;
          render();
          announceToScreenReader('Error loading roadmap: ' + state.error);
        });
    } else {
      // Fallback to direct API call
      fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/path/phases')
        .then(function(resp) {
          if (!resp.ok) throw new Error('Failed to load phases');
          return resp.json();
        })
        .then(function(data) {
          state.phases = data.phases || [];
          state.loading = false;
          render();
          announceToScreenReader('Roadmap loaded with ' + state.phases.length + ' phases');
        })
        .catch(function(err) {
          state.error = err.message || 'Failed to load phases';
          state.loading = false;
          render();
          announceToScreenReader('Error loading roadmap: ' + state.error);
        });
    }
  }

  function announceToScreenReader(message) {
    var announcer = document.getElementById('path-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  }

  function isTaskDone(task) {
    return task && (task.status === 'done' || task.status === 'completed');
  }

  function isPhaseComplete(phase) {
    return phase && (phase.status === 'complete' || phase.status === 'completed');
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

    if (state.phases.length === 0) {
      container.innerHTML = renderEmpty();
      return;
    }

    var html = '<div class="path-container" role="region" aria-label="Project roadmap">';
    html += '<div id="path-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>';
    html += renderHeader();
    html += renderProgress();
    html += '<div class="phases-list" role="list" aria-label="Project phases">';

    // Sort phases by ordinal
    var sortedPhases = state.phases.slice().sort(function(a, b) {
      return (a.ordinal || 0) - (b.ordinal || 0);
    });

    for (var i = 0; i < sortedPhases.length; i++) {
      html += renderPhaseCard(sortedPhases[i], i);
    }

    html += '</div></div>';

    container.innerHTML = html;
    attachHandlers();
  }

  function renderLoading() {
    return '<div class="path-loading" role="status" aria-label="Loading roadmap">' +
      '<div class="path-spinner" aria-hidden="true"></div>' +
      '<p style="margin-top: var(--space-4);">Loading roadmap...</p>' +
      '</div>';
  }

  function renderError() {
    return '<div class="path-empty" role="alert">' +
      '<div class="path-empty-icon" aria-hidden="true">⚠️</div>' +
      '<h3 class="path-empty-title">Error Loading Roadmap</h3>' +
      '<p class="path-empty-description">' + escapeHtml(state.error) + '</p>' +
      '<div class="path-actions">' +
      '<button class="btn btn-primary" onclick="window.ZoPath.refresh()" aria-label="Try loading roadmap again">Try Again</button>' +
      '</div>' +
      '</div>';
  }

  function renderEmpty() {
    return '<div class="path-empty" role="status">' +
      '<div class="path-empty-icon" aria-hidden="true">🗺️</div>' +
      '<h3 class="path-empty-title">No Phases Yet</h3>' +
      '<p class="path-empty-description">' +
      'Your mind map needs clusters before generating a roadmap. ' +
      'Clusters become phases in your project timeline.' +
      '</p>' +
      '<div class="path-actions">' +
      '<button class="btn btn-primary" data-navigate="constellation" aria-label="Navigate to mind map to create clusters">Go to Mind Map</button>' +
      '</div>' +
      '</div>';
  }

  function renderHeader() {
    var completedCount = state.phases.filter(function(p) {
      return isPhaseComplete(p);
    }).length;

    return '<div class="path-header">' +
      '<div>' +
      '<h2 class="path-title" id="path-title">Roadmap</h2>' +
      '<p class="path-summary" aria-describedby="path-title">' + state.phases.length + ' phases • ' +
      completedCount + ' completed</p>' +
      '</div>' +
      '</div>';
  }

  function renderProgress() {
    var totalTasks = 0;
    var completedTasks = 0;

    state.phases.forEach(function(phase) {
      if (phase.tasks) {
        totalTasks += phase.tasks.length;
        completedTasks += phase.tasks.filter(function(t) {
          return isTaskDone(t);
        }).length;
      }
    });

    var percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return '<div class="path-progress" role="progressbar" aria-valuenow="' + percentage + '" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-label="Overall progress: ' + 
      completedTasks + ' of ' + totalTasks + ' tasks completed">' +
      '<div class="path-progress-bar">' +
      '<div class="path-progress-fill" style="width: ' + percentage + '%"></div>' +
      '</div>' +
      '<div class="path-progress-label">' +
      '<span>' + completedTasks + ' of ' + totalTasks + ' tasks completed</span>' +
      '<span>' + percentage + '%</span>' +
      '</div>' +
      '</div>';
  }

  function renderPhaseCard(phase, index) {
    var tasks = phase.tasks || [];
    var completedTasks = tasks.filter(function(t) {
      return isTaskDone(t);
    }).length;
    var progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    var html = '<div class="phase-card" role="listitem" tabindex="0" ' +
      'data-phase-id="' + phase.phaseId + '" ' +
      'draggable="true" ' +
      'aria-label="Phase ' + (phase.ordinal || index + 1) + ': ' + escapeHtml(phase.name) + ', status: ' + formatStatus(phase.status) + '">';
    
    html += '<div class="phase-card-header">';
    html += '<div class="phase-info">';
    html += '<span class="phase-ordinal" aria-hidden="true">' + (phase.ordinal || index + 1) + '</span>';
    html += '<h3 class="phase-name">' + escapeHtml(phase.name) + '</h3>';
    html += '<p class="phase-objective">' + escapeHtml(phase.objective || '') + '</p>';
    html += '</div>';
    html += '<span class="phase-status-badge ' + (phase.status || 'planned') + '" aria-label="Status: ' + formatStatus(phase.status) + '">' +
      formatStatus(phase.status) + '</span>';
    html += '</div>';

    // Progress bar
    if (tasks.length > 0) {
      html += '<div class="phase-progress" role="progressbar" ' +
        'aria-valuenow="' + progress + '" aria-valuemin="0" aria-valuemax="100" ' +
        'aria-label="' + completedTasks + ' of ' + tasks.length + ' tasks completed">';
      html += '<div class="phase-progress-bar">';
      html += '<div class="phase-progress-fill" style="width: ' + progress + '%"></div>';
      html += '</div>';
      html += '<p class="phase-progress-text">' + completedTasks + ' of ' + tasks.length +
        ' tasks completed</p>';
      html += '</div>';
    }

    // Tasks
    if (tasks.length > 0) {
      html += '<div class="tasks-section">';
      html += '<div class="tasks-header">';
      html += '<h4 class="tasks-title">Tasks</h4>';
      html += '</div>';
      html += '<div class="task-list" role="list" aria-label="Tasks for ' + escapeHtml(phase.name) + '">';

      tasks.forEach(function(task) {
        html += renderTask(task, phase.phaseId);
      });

      html += '</div></div>';
    }

    // Source clusters
    if (phase.sourceClusterIds && phase.sourceClusterIds.length > 0) {
      html += '<div class="source-clusters">';
      html += '<p class="source-clusters-label" id="source-label-' + phase.phaseId + '">Source Clusters</p>';
      html += '<div role="list" aria-labelledby="source-label-' + phase.phaseId + '">';

      phase.sourceClusterIds.forEach(function(clusterId) {
        html += '<a class="source-cluster-link" role="listitem" data-cluster-id="' + clusterId + '" ' +
          'aria-label="Navigate to cluster ' + clusterId.replace('cluster_', 'Cluster ') + '">' +
          clusterId.replace('cluster_', 'Cluster ') + '</a>';
      });

      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  function renderTask(task, phaseId) {
    var isCompleted = isTaskDone(task);

    var html = '<div class="task-item' + (isCompleted ? ' completed' : '') + '" role="listitem">';
    html += '<label class="task-label">';
    html += '<input type="checkbox" class="task-checkbox" ' +
      'data-task-id="' + task.taskId + '" ' +
      'data-phase-id="' + phaseId + '" ' +
      (isCompleted ? 'checked aria-checked="true"' : 'aria-checked="false"') + '>';
    html += '<span class="task-checkbox-label">' + escapeHtml(task.title) + '</span>';
    html += '</label>';
    html += '<div class="task-content">';

    if (task.description) {
      html += '<p class="task-description">' + escapeHtml(task.description) + '</p>';
    }

    // Acceptance criteria
    if (task.acceptance && task.acceptance.length > 0) {
      html += '<ul class="acceptance-criteria" aria-label="Acceptance criteria">';
      task.acceptance.forEach(function(criterion) {
        html += '<li class="acceptance-item">' + escapeHtml(criterion) + '</li>';
      });
      html += '</ul>';
    }

    html += '</div></div>';
    return html;
  }

  function formatStatus(status) {
    var statusMap = {
      'planned': 'Planned',
      'in-progress': 'In Progress',
      'done': 'Completed',
      'complete': 'Completed',
      'completed': 'Completed',
      'blocked': 'Blocked'
    };
    return statusMap[status] || 'Planned';
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function handleKeydown(e) {
    var phases = container.querySelectorAll('.phase-card');
    var focusedElement = document.activeElement;
    var currentIndex = -1;
    
    phases.forEach(function(phase, i) {
      if (phase === focusedElement) {
        currentIndex = i;
      }
    });
    
    switch(e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        if (currentIndex < phases.length - 1) {
          phases[currentIndex + 1].focus();
          announceToScreenReader('Phase ' + (currentIndex + 2) + ' of ' + phases.length);
        }
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        if (currentIndex > 0) {
          phases[currentIndex - 1].focus();
          announceToScreenReader('Phase ' + currentIndex + ' of ' + phases.length);
        }
        break;
      case 'Home':
        e.preventDefault();
        if (phases.length > 0) {
          phases[0].focus();
          announceToScreenReader('Phase 1 of ' + phases.length);
        }
        break;
      case 'End':
        e.preventDefault();
        if (phases.length > 0) {
          phases[phases.length - 1].focus();
          announceToScreenReader('Phase ' + phases.length + ' of ' + phases.length);
        }
        break;
      case ' ':
      case 'Enter':
        // Toggle task if focused on checkbox
        if (focusedElement.classList.contains('task-checkbox')) {
          // Let the default behavior handle it
          return;
        }
        break;
    }
  }

  function attachHandlers() {
    // Task checkbox toggles
    var checkboxes = container.querySelectorAll('.task-checkbox');
    checkboxes.forEach(function(checkbox) {
      checkbox.addEventListener('change', handleTaskToggle);
    });

    // Phase drag-and-drop
    var phaseCards = container.querySelectorAll('.phase-card');
    phaseCards.forEach(function(card) {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragleave', handleDragLeave);
    });

    // Source cluster links
    var clusterLinks = container.querySelectorAll('.source-cluster-link');
    clusterLinks.forEach(function(link) {
      link.addEventListener('click', handleClusterClick);
    });
  }

  function handleTaskToggle(e) {
    var checkbox = e.target;
    var taskId = checkbox.dataset.taskId;
    var phaseId = checkbox.dataset.phaseId;
    var isChecked = checkbox.checked;

    // Update aria-checked
    checkbox.setAttribute('aria-checked', isChecked ? 'true' : 'false');

    // Optimistic update
    var phase = state.phases.find(function(p) {
      return p.phaseId === phaseId;
    });

    if (phase && phase.tasks) {
      var task = phase.tasks.find(function(t) {
        return t.taskId === taskId;
      });

      if (task) {
        var nextStatus = isChecked ? 'done' : 'pending';
        var previousStatus = task.status;
        task.status = nextStatus;
        announceToScreenReader('Task "' + task.title + '" marked as ' + (isChecked ? 'completed' : 'incomplete'));
        render();

        var request = null;
        if (typeof PlanningClient !== 'undefined' && PlanningClient.updateTaskStatus) {
          request = PlanningClient.updateTaskStatus(phaseId, taskId, nextStatus, 'victor-ui');
        } else {
          request = fetch('/api/projects/' + encodeURIComponent(state.projectId) + '/path/phases/' +
            encodeURIComponent(phaseId) + '/tasks/' + encodeURIComponent(taskId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus, actorId: 'victor-ui' })
          }).then(function(resp) {
            if (!resp.ok) throw new Error('Failed to update task');
            return resp.json();
          });
        }

        request.catch(function(err) {
          task.status = previousStatus;
          render();
          state.error = err.message || 'Failed to update task';
          announceToScreenReader('Error updating task status');
        });
      }
    }
  }

  function handleDragStart(e) {
    state.draggingPhaseId = e.target.dataset.phaseId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    announceToScreenReader('Started dragging phase');
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    state.draggingPhaseId = null;
    state.dropTargetId = null;

    // Remove all drop-target classes
    var cards = container.querySelectorAll('.phase-card');
    cards.forEach(function(card) {
      card.classList.remove('drop-target');
    });
    announceToScreenReader('Stopped dragging phase');
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var targetId = e.currentTarget.dataset.phaseId;
    if (targetId !== state.draggingPhaseId) {
      e.currentTarget.classList.add('drop-target');
      state.dropTargetId = targetId;
    }
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');

    if (!state.draggingPhaseId || !state.dropTargetId) return;
    if (state.draggingPhaseId === state.dropTargetId) return;

    // Swap ordinals
    var draggingPhase = state.phases.find(function(p) {
      return p.phaseId === state.draggingPhaseId;
    });
    var targetPhase = state.phases.find(function(p) {
      return p.phaseId === state.dropTargetId;
    });

    if (draggingPhase && targetPhase) {
      var tempOrdinal = draggingPhase.ordinal;
      draggingPhase.ordinal = targetPhase.ordinal;
      targetPhase.ordinal = tempOrdinal;

      announceToScreenReader('Swapped phases ' + draggingPhase.name + ' and ' + targetPhase.name);

      // TODO: Send ordinal updates to API

      render();
    }
  }

  function handleClusterClick(e) {
    var clusterId = e.target.dataset.clusterId;
    if (!clusterId) return;

    // Navigate to constellation view with cluster highlighted
    window.dispatchEvent(new CustomEvent('path:navigate-to-cluster', {
      detail: { clusterId: clusterId }
    }));

    // Also trigger navigation
    var navEvent = new CustomEvent('navigate', {
      detail: { route: 'constellation', highlight: clusterId }
    });
    window.dispatchEvent(navEvent);
  }

  // Expose public API
  window.ZoPath = {
    refresh: loadPhases,
    getState: function() {
      return state;
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
