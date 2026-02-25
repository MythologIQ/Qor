/**
 * Reveal UI Component - Core (Phase 13 Enhanced)
 *
 * Main reveal UI state and rendering with split-pane layout.
 * Features: Split-pane, expandable thought lists, inline notes, claim animations.
 */
(function() {
  'use strict';

  // State (shared with reveal-drag.js via window.ZoRevealState)
  var state = window.ZoRevealState = {
    sessionId: null,
    clusters: [],
    thoughts: [],
    outliers: [],
    selectedClusterId: null,
    expandedClusters: {},
    viewMode: 'split' // 'split', 'clusters', 'outliers'
  };

  // DOM Elements
  var container = null;
  var canvas = null;
  var outliersEl = null;
  var splitPane = null;
  var leftPane = null;
  var rightPane = null;

  function init() {
    container = document.getElementById('reveal-container');
    if (!container) return;

    canvas = container.querySelector('.reveal-canvas');
    outliersEl = container.querySelector('.reveal-outliers');

    // Create split-pane layout if not present
    ensureSplitPaneLayout();

    window.addEventListener('void:reveal', function(e) {
      state.sessionId = e.detail.sessionId;
      showReveal();
    });
    
    // Listen for thought moves to animate
    window.addEventListener('reveal:thought-moved', function(e) {
      animateThoughtClaim(e.detail);
    });
  }

  function ensureSplitPaneLayout() {
    if (!container) return;
    
    // Check if split-pane already exists
    if (container.querySelector('.reveal-split-pane')) return;
    
    // Create split-pane structure
    var existingCanvas = container.querySelector('.reveal-canvas');
    var existingOutliers = container.querySelector('.reveal-outliers');
    var existingActions = container.querySelector('.reveal-actions');
    
    splitPane = document.createElement('div');
    splitPane.className = 'reveal-split-pane';
    
    // Left pane - Outliers / Unclaimed thoughts
    leftPane = document.createElement('div');
    leftPane.className = 'reveal-pane reveal-pane--outliers';
    leftPane.innerHTML = 
      '<div class="reveal-pane-header">' +
        '<h3 class="reveal-pane-title">Unclaimed Thoughts</h3>' +
        '<span class="reveal-outlier-count badge badge--default">0</span>' +
        '<button class="reveal-pane-toggle" aria-label="Toggle pane">' +
          '<span class="reveal-pane-toggle-icon">◀</span>' +
        '</button>' +
      '</div>' +
      '<div class="reveal-pane-content">' +
        '<div class="reveal-outlier-pool"></div>' +
        '<div class="reveal-outlier-empty empty-state" style="display: none;">' +
          '<div class="empty-state__icon">✨</div>' +
          '<h4 class="empty-state__title">All thoughts claimed!</h4>' +
          '<p class="empty-state__desc">All thoughts have been organized into clusters.</p>' +
        '</div>' +
      '</div>';
    
    // Right pane - Clusters workspace
    rightPane = document.createElement('div');
    rightPane.className = 'reveal-pane reveal-pane--clusters';
    rightPane.innerHTML = 
      '<div class="reveal-pane-header">' +
        '<h3 class="reveal-pane-title">Clusters</h3>' +
        '<button class="reveal-add-cluster btn btn--sm btn--ghost">' +
          '<span>+</span> New Cluster' +
        '</button>' +
      '</div>' +
      '<div class="reveal-pane-content">' +
        '<div class="reveal-cluster-workspace"></div>' +
      '</div>';
    
    // Move existing content
    if (existingCanvas) {
      var workspace = rightPane.querySelector('.reveal-cluster-workspace');
      workspace.innerHTML = existingCanvas.innerHTML;
      existingCanvas.remove();
    }
    
    if (existingOutliers) {
      var pool = leftPane.querySelector('.reveal-outlier-pool');
      pool.innerHTML = existingOutliers.innerHTML;
      existingOutliers.remove();
    }
    
    splitPane.appendChild(leftPane);
    splitPane.appendChild(rightPane);
    
    // Insert before actions
    if (existingActions) {
      container.insertBefore(splitPane, existingActions);
    } else {
      container.appendChild(splitPane);
    }
    
    // Update references
    canvas = rightPane.querySelector('.reveal-cluster-workspace');
    outliersEl = leftPane.querySelector('.reveal-outlier-pool');
    
    // Bind pane toggle
    var toggleBtn = leftPane.querySelector('.reveal-pane-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleLeftPane);
    }
    
    // Bind new cluster button
    var addClusterBtn = rightPane.querySelector('.reveal-add-cluster');
    if (addClusterBtn) {
      addClusterBtn.addEventListener('click', createNewCluster);
    }
    
    // Bind view mode toggle
    bindViewModeToggle();
  }

  function toggleLeftPane() {
    if (!leftPane) return;
    leftPane.classList.toggle('reveal-pane--collapsed');
    var icon = leftPane.querySelector('.reveal-pane-toggle-icon');
    if (icon) {
      icon.textContent = leftPane.classList.contains('reveal-pane--collapsed') ? '▶' : '◀';
    }
  }

  function bindViewModeToggle() {
    // Add view mode buttons if not present
    var header = container.querySelector('.reveal-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'reveal-header';
      header.innerHTML = 
        '<div class="reveal-view-modes">' +
          '<button class="reveal-view-mode-btn" data-mode="split" title="Split view">⚏</button>' +
          '<button class="reveal-view-mode-btn" data-mode="clusters" title="Clusters only">▦</button>' +
          '<button class="reveal-view-mode-btn" data-mode="outliers" title="Outliers only">▤</button>' +
        '</div>' +
        '<div class="reveal-search">' +
          '<input type="text" class="reveal-search-input form-field__input" placeholder="Search thoughts...">' +
        '</div>';
      
      if (splitPane) {
        container.insertBefore(header, splitPane);
      }
    }
    
    // Bind mode buttons
    var modeButtons = container.querySelectorAll('.reveal-view-mode-btn');
    modeButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        setViewMode(btn.dataset.mode);
      });
    });
    
    // Bind search
    var searchInput = container.querySelector('.reveal-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(function() {
        filterThoughts(searchInput.value);
      }, 200));
    }
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    
    // Update button states
    var modeButtons = container.querySelectorAll('.reveal-view-mode-btn');
    modeButtons.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Update pane visibility
    if (splitPane) {
      splitPane.className = 'reveal-split-pane reveal-split-pane--' + mode;
    }
    if (leftPane) {
      leftPane.style.display = (mode === 'clusters') ? 'none' : '';
    }
    if (rightPane) {
      rightPane.style.display = (mode === 'outliers') ? 'none' : '';
    }
  }

  function filterThoughts(query) {
    var q = query.toLowerCase().trim();
    
    // Filter outlier pills
    var outlierPills = outliersEl.querySelectorAll('.reveal-thought-card');
    outlierPills.forEach(function(pill) {
      var content = pill.dataset.content || '';
      pill.style.display = (!q || content.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    
    // Filter thought pills in clusters
    var clusterPills = canvas.querySelectorAll('.reveal-thought-pill');
    clusterPills.forEach(function(pill) {
      var content = pill.textContent || '';
      pill.style.display = (!q || content.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  function createNewCluster() {
    var newCluster = {
      id: 'cluster_' + Date.now().toString(36),
      name: 'New Cluster',
      theme: '',
      thoughtIds: [],
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 100 },
      notes: ''
    };
    
    state.clusters.push(newCluster);
    renderClusters();
    
    // Focus the name input
    var newEl = canvas.querySelector('[data-cluster-id="' + newCluster.id + '"] .reveal-cluster-name');
    if (newEl) {
      newEl.focus();
      newEl.select();
    }
    
    // API call to create cluster
    var projectId = getProjectId();
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.createCluster(projectId, newCluster)
        .catch(function(err) {
          console.error('Failed to create cluster:', err);
        });
    }
  }

  function showReveal() {
    container.classList.add('active');
    loadRevealData();
  }

  function hideReveal() {
    container.classList.remove('active');
    state.clusters = [];
    state.thoughts = [];
    state.outliers = [];
    state.selectedClusterId = null;
    state.expandedClusters = {};
    if (canvas) canvas.innerHTML = '';
  }

  function loadRevealData() {
    if (canvas) canvas.innerHTML = '<div class="reveal-loading"><div class="spinner"></div><span>Loading clusters...</span></div>';
    var projectId = getProjectId();

    // Use PlanningClient if available, otherwise fallback to legacy API
    if (typeof PlanningClient !== 'undefined') {
      Promise.all([
        PlanningClient.getThoughts(projectId),
        PlanningClient.getClusters(projectId)
      ])
        .then(function(results) {
          var thoughts = results[0] || [];
          var clusters = results[1] || [];
          
          // Separate thoughts that are in clusters vs outliers
          var clusterThoughtIds = {};
          clusters.forEach(function(c) {
            (c.thoughtIds || []).forEach(function(tid) {
              clusterThoughtIds[tid] = true;
            });
          });
          
          var outliers = thoughts.filter(function(t) {
            return !clusterThoughtIds[t.thoughtId] && t.status !== 'claimed';
          });
          
          state.clusters = clusters;
          state.thoughts = thoughts;
          state.outliers = outliers;
          renderClusters();
          renderOutliers();
          updateOutlierCount();
        })
        .catch(function() {
          if (canvas) canvas.innerHTML = '<div class="reveal-loading">Failed to load.</div>';
        });
    } else {
      // Fallback to legacy API
      fetch('/api/reveal/' + encodeURIComponent(state.sessionId))
        .then(function(resp) {
          if (!resp.ok) throw new Error('Failed to load reveal data');
          return resp.json();
        })
        .then(function(data) {
          state.clusters = data.clusters || [];
          state.thoughts = data.thoughts || [];
          state.outliers = data.outliers || [];
          renderClusters();
          renderOutliers();
          updateOutlierCount();
        })
        .catch(function() {
          if (canvas) canvas.innerHTML = '<div class="reveal-loading">Failed to load.</div>';
        });
    }
  }

  function renderClusters() {
    if (!canvas) return;
    canvas.innerHTML = '';
    
    if (state.clusters.length === 0) {
      canvas.innerHTML = 
        '<div class="reveal-empty-clusters">' +
          '<div class="empty-state">' +
            '<div class="empty-state__icon">🏷️</div>' +
            '<h4 class="empty-state__title">No clusters yet</h4>' +
            '<p class="empty-state__desc">Drag thoughts from the left panel to create clusters.</p>' +
            '<button class="btn btn--primary reveal-empty-create">Create First Cluster</button>' +
          '</div>' +
        '</div>';
      
      var createBtn = canvas.querySelector('.reveal-empty-create');
      if (createBtn) {
        createBtn.addEventListener('click', createNewCluster);
      }
      return;
    }
    
    state.clusters.forEach(function(cluster) {
      var el = window.ZoRevealDrag ? window.ZoRevealDrag.createClusterElement(cluster, state.thoughts) : null;
      if (el) {
        canvas.appendChild(el);
      } else {
        // Fallback if drag module not loaded
        el = createClusterElementFallback(cluster, state.thoughts);
        canvas.appendChild(el);
      }
    });
  }

  function createClusterElementFallback(cluster, thoughts) {
    var isExpanded = state.expandedClusters[cluster.id || cluster.clusterId];
    var inCluster = thoughts.filter(function(t) {
      return (t.clusterId === cluster.id || t.clusterId === cluster.clusterId) ||
             (cluster.thoughtIds && cluster.thoughtIds.indexOf(t.thoughtId) !== -1);
    });
    
    var el = document.createElement('div');
    el.className = 'reveal-cluster card' + (isExpanded ? ' reveal-cluster--expanded' : '');
    el.dataset.clusterId = cluster.id || cluster.clusterId;
    if (cluster.position) {
      el.style.left = cluster.position.x + 'px';
      el.style.top = cluster.position.y + 'px';
    }
    
    var pills = inCluster.slice(0, isExpanded ? 100 : 5).map(function(t) {
      return '<span class="reveal-thought-pill" data-thought-id="' + t.thoughtId + '" draggable="true">' +
        escapeHtml(truncate(t.content, 25)) + '</span>';
    }).join('');
    
    var moreCount = !isExpanded && inCluster.length > 5 ? inCluster.length - 5 : 0;
    
    el.innerHTML = 
      '<div class="card__header">' +
        '<input class="reveal-cluster-name form-field__input" type="text" value="' + 
          escapeHtml(cluster.name || cluster.label || 'Untitled') + '">' +
        '<span class="reveal-cluster-count badge badge--primary">' + inCluster.length + '</span>' +
        '<button class="reveal-cluster-expand" title="' + (isExpanded ? 'Collapse' : 'Expand') + '">' +
          (isExpanded ? '▼' : '▶') + '</button>' +
      '</div>' +
      '<div class="card__body">' +
        (cluster.theme || cluster.notes ?
          '<div class="reveal-cluster-notes">' +
            '<textarea class="reveal-cluster-notes-input form-field__textarea" placeholder="Add notes...">' +
              escapeHtml(cluster.notes || cluster.theme || '') + '</textarea>' +
          '</div>' : 
          '<div class="reveal-cluster-notes reveal-cluster-notes--empty">' +
            '<textarea class="reveal-cluster-notes-input form-field__textarea" placeholder="Add notes..."></textarea>' +
          '</div>') +
        '<div class="reveal-thoughts" data-drop-zone="cluster">' + pills + '</div>' +
        (moreCount > 0 ? '<button class="reveal-cluster-more">+ ' + moreCount + ' more thoughts</button>' : '') +
      '</div>';
    
    // Bind events
    bindClusterElementEvents(el, cluster);
    
    return el;
  }

  function bindClusterElementEvents(el, cluster) {
    var clusterId = cluster.id || cluster.clusterId;
    
    // Name change
    var nameInput = el.querySelector('.reveal-cluster-name');
    if (nameInput) {
      nameInput.addEventListener('change', function() {
        cluster.name = nameInput.value;
        updateCluster(clusterId, { name: nameInput.value });
      });
    }
    
    // Notes change
    var notesInput = el.querySelector('.reveal-cluster-notes-input');
    if (notesInput) {
      notesInput.addEventListener('change', function() {
        cluster.notes = notesInput.value;
        updateCluster(clusterId, { notes: notesInput.value });
      });
      notesInput.addEventListener('focus', function() {
        el.querySelector('.reveal-cluster-notes').classList.remove('reveal-cluster-notes--empty');
      });
    }
    
    // Expand/collapse
    var expandBtn = el.querySelector('.reveal-cluster-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', function() {
        state.expandedClusters[clusterId] = !state.expandedClusters[clusterId];
        renderClusters();
      });
    }
    
    // More button
    var moreBtn = el.querySelector('.reveal-cluster-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', function() {
        state.expandedClusters[clusterId] = true;
        renderClusters();
      });
    }
    
    // Drop zone
    el.addEventListener('dragover', function(e) {
      e.preventDefault();
      el.classList.add('drop-target');
    });
    
    el.addEventListener('dragleave', function(e) {
      el.classList.remove('drop-target');
    });
    
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      el.classList.remove('drop-target');
      var thoughtId = e.dataTransfer.getData('text/plain');
      if (thoughtId && window.ZoRevealDrag) {
        window.ZoRevealDrag.moveThoughtToCluster(thoughtId, clusterId);
      }
    });
  }

  function updateCluster(clusterId, updates) {
    // API call
    var projectId = getProjectId();
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.updateCluster(projectId, clusterId, updates)
        .catch(function(err) {
          console.error('Failed to update cluster:', err);
        });
    }
  }

  function renderOutliers() {
    if (!outliersEl) return;
    
    var emptyState = leftPane.querySelector('.reveal-outlier-empty');
    
    if (state.outliers.length === 0) {
      outliersEl.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    var cards = state.outliers.map(function(t) {
      return '<div class="reveal-thought-card" data-thought-id="' + t.thoughtId + '" ' +
        'data-content="' + escapeHtml(t.content) + '" draggable="true">' +
        '<div class="reveal-thought-card-header">' +
          '<span class="reveal-thought-source">' + (t.source === 'voice' ? '🎤' : '⌨️') + '</span>' +
          '<span class="reveal-thought-time">' + formatTimeAgo(t.capturedAt) + '</span>' +
        '</div>' +
        '<div class="reveal-thought-card-content">' + escapeHtml(truncate(t.content, 100)) + '</div>' +
        (t.tags && t.tags.length > 0 ?
          '<div class="reveal-thought-card-tags">' +
            t.tags.map(function(tag) { return '<span class="void-thought-tag">' + escapeHtml(tag) + '</span>'; }).join('') +
          '</div>' : '') +
      '</div>';
    }).join('');
    
    outliersEl.innerHTML = cards;
    
    // Bind drag events
    bindOutlierDragEvents();
    
    // Update count
    updateOutlierCount();
  }

  function bindOutlierDragEvents() {
    if (!outliersEl) return;
    
    var cards = outliersEl.querySelectorAll('.reveal-thought-card');
    cards.forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', card.dataset.thoughtId);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        
        // Highlight drop zones
        setTimeout(function() {
          var clusters = canvas.querySelectorAll('.reveal-cluster');
          clusters.forEach(function(c) { c.classList.add('drop-available'); });
        }, 0);
      });
      
      card.addEventListener('dragend', function() {
        card.classList.remove('dragging');
        var clusters = canvas.querySelectorAll('.reveal-cluster');
        clusters.forEach(function(c) {
          c.classList.remove('drop-available', 'drop-target');
        });
      });
    });
  }

  function updateOutlierCount() {
    var countEl = leftPane ? leftPane.querySelector('.reveal-outlier-count') : null;
    if (countEl) {
      countEl.textContent = state.outliers.length;
    }
  }

  function animateThoughtClaim(detail) {
    if (!detail || !detail.thoughtId || !detail.targetClusterId) return;
    
    // Find source element
    var sourceEl = outliersEl.querySelector('[data-thought-id="' + detail.thoughtId + '"]');
    if (!sourceEl) return;
    
    // Find target cluster
    var targetEl = canvas.querySelector('[data-cluster-id="' + detail.targetClusterId + '"]');
    if (!targetEl) return;
    
    // Create animated clone
    var rect = sourceEl.getBoundingClientRect();
    var targetRect = targetEl.getBoundingClientRect();
    
    var clone = sourceEl.cloneNode(true);
    clone.className = 'reveal-thought-card reveal-thought-animating';
    clone.style.cssText = 
      'position: fixed;' +
      'left: ' + rect.left + 'px;' +
      'top: ' + rect.top + 'px;' +
      'width: ' + rect.width + 'px;' +
      'z-index: 1000;' +
      'transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);';
    
    document.body.appendChild(clone);
    
    // Hide original
    sourceEl.style.opacity = '0';
    
    // Animate to target
    requestAnimationFrame(function() {
      clone.style.left = targetRect.left + targetRect.width / 2 - rect.width / 2 + 'px';
      clone.style.top = targetRect.top + targetRect.height / 2 + 'px';
      clone.style.transform = 'scale(0.5)';
      clone.style.opacity = '0.5';
    });
    
    // Cleanup after animation
    setTimeout(function() {
      clone.remove();
      refresh();
    }, 400);
  }

  function refresh() {
    renderClusters();
    renderOutliers();
  }

  function confirmOrganization() {
    fetch('/api/reveal/' + state.sessionId + '/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    .then(function() {
      hideReveal();
      window.dispatchEvent(new CustomEvent('reveal:confirmed', {
        detail: { sessionId: state.sessionId }
      }));
    })
    .catch(function() {});
  }

  function cancelReveal() {
    fetch('/api/reveal/' + state.sessionId + '/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    .then(function() { hideReveal(); })
    .catch(function() {});
  }

  // Utility functions
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    return str.length <= len ? str : str.substring(0, len) + '...';
  }

  function formatTimeAgo(timestamp) {
    var now = Date.now();
    var then = new Date(timestamp).getTime();
    var diff = Math.floor((now - then) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function debounce(fn, delay) {
    var timer = null;
    return function() {
      var args = arguments;
      var ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.ZoReveal = {
    show: showReveal,
    hide: hideReveal,
    confirm: confirmOrganization,
    cancel: cancelReveal,
    refresh: refresh,
    getState: function() { return state; },
    escapeHtml: escapeHtml,
    truncate: truncate,
    updateOutlierCount: updateOutlierCount,
    animateThoughtClaim: animateThoughtClaim
  };
})();
