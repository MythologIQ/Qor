/**
 * Reveal UI Component - Drag Interaction
 *
 * Cluster element creation, selection, renaming, and drag handling.
 * Enhanced with thought drag-and-drop for clustering.
 */
(function() {
  'use strict';

  var state = null;
  var canvas = null;
  var dragState = null;
  var thoughtDragState = null;
  var dragGhost = null;

  function init() {
    state = window.ZoRevealState;
    canvas = document.querySelector('.reveal-canvas');
    
    // Set up global drag handlers
    document.addEventListener('mousemove', onThoughtDrag);
    document.addEventListener('mouseup', endThoughtDrag);
  }

  // === CLUSTER DRAG (existing functionality) ===

  function createClusterElement(cluster, thoughts) {
    var el = document.createElement('div');
    el.className = 'reveal-cluster';
    el.dataset.clusterId = cluster.id;
    el.style.left = cluster.position.x + 'px';
    el.style.top = cluster.position.y + 'px';

    var inCluster = thoughts.filter(function(t) {
      return t.clusterId === cluster.id;
    });

    var pills = inCluster.slice(0, 5).map(function(t) {
      return '<span class="reveal-thought-pill" data-thought-id="' + t.thoughtId + '" draggable="true">' +
        window.ZoReveal.escapeHtml(window.ZoReveal.truncate(t.content, 20)) + '</span>';
    }).join('');

    if (inCluster.length > 5) {
      pills += '<span class="reveal-thought-more">+' + (inCluster.length - 5) + ' more</span>';
    }

    el.innerHTML = [
      '<input class="reveal-cluster-name" type="text" value="' +
        window.ZoReveal.escapeHtml(cluster.name) + '">',
      '<div class="reveal-cluster-theme">' +
        window.ZoReveal.escapeHtml(cluster.theme || '') + '</div>',
      '<div class="reveal-cluster-count">' + inCluster.length + ' thoughts</div>',
      '<div class="reveal-thoughts" data-drop-zone="cluster">' + pills + '</div>'
    ].join('');

    bindClusterEvents(el, cluster);
    bindThoughtPills(el);
    return el;
  }

  function bindClusterEvents(el, cluster) {
    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('reveal-cluster-name')) return;
      if (e.target.classList.contains('reveal-thought-pill')) return;
      selectCluster(cluster.id);
    });

    var nameInput = el.querySelector('.reveal-cluster-name');
    nameInput.addEventListener('change', function() {
      renameCluster(cluster.id, nameInput.value);
    });

    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('reveal-cluster-name')) return;
      if (e.target.classList.contains('reveal-thought-pill')) return;
      startDrag(el, cluster, e);
    });

    // Drop zone events for thought drag
    el.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (thoughtDragState) {
        el.classList.add('drop-target');
      }
    });

    el.addEventListener('dragleave', function(e) {
      el.classList.remove('drop-target');
    });

    el.addEventListener('drop', function(e) {
      e.preventDefault();
      el.classList.remove('drop-target');
      if (thoughtDragState && thoughtDragState.thoughtId) {
        moveThoughtToCluster(thoughtDragState.thoughtId, cluster.id);
      }
    });
  }

  function selectCluster(clusterId) {
    state.selectedClusterId = clusterId;
    var all = canvas.querySelectorAll('.reveal-cluster');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('selected', all[i].dataset.clusterId === clusterId);
    }
  }

  function renameCluster(clusterId, name) {
    var cluster = state.clusters.find(function(c) { return c.id === clusterId; });
    if (cluster) cluster.name = name;

    fetch('/api/reveal/' + state.sessionId + '/cluster/' + clusterId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name })
    }).catch(function() {});
  }

  function startDrag(el, cluster, e) {
    dragState = {
      el: el,
      cluster: cluster,
      startX: e.clientX,
      startY: e.clientY,
      origX: cluster.position.x,
      origY: cluster.position.y
    };
    el.classList.add('dragging');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    dragState.cluster.position.x = dragState.origX + dx;
    dragState.cluster.position.y = dragState.origY + dy;
    dragState.el.style.left = dragState.cluster.position.x + 'px';
    dragState.el.style.top = dragState.cluster.position.y + 'px';
  }

  function endDrag() {
    if (!dragState) return;
    dragState.el.classList.remove('dragging');

    fetch('/api/reveal/' + state.sessionId + '/cluster/' + dragState.cluster.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: dragState.cluster.position })
    }).catch(function() {});

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    dragState = null;
  }

  // === THOUGHT DRAG (new functionality) ===

  function bindThoughtPills(clusterEl) {
    var pills = clusterEl.querySelectorAll('.reveal-thought-pill');
    pills.forEach(function(pill) {
      pill.addEventListener('dragstart', onThoughtDragStart);
      pill.addEventListener('dragend', onThoughtDragEnd);
    });
  }

  function bindOutlierPills(outlierEl) {
    var pills = outlierEl.querySelectorAll('.reveal-thought-pill');
    pills.forEach(function(pill) {
      pill.addEventListener('dragstart', onThoughtDragStart);
      pill.addEventListener('dragend', onThoughtDragEnd);
    });
  }

  function onThoughtDragStart(e) {
    var thoughtId = e.target.dataset.thoughtId;
    var content = e.target.textContent;
    
    thoughtDragState = {
      thoughtId: thoughtId,
      content: content,
      sourceClusterId: findThoughtCluster(thoughtId)
    };

    e.target.classList.add('dragging');
    
    // Set drag data and image
    e.dataTransfer.setData('text/plain', thoughtId);
    e.dataTransfer.effectAllowed = 'move';
    
    // Create custom drag ghost
    createDragGhost(content);
    e.dataTransfer.setDragImage(dragGhost, 0, 0);
    
    // Highlight all clusters as potential drop targets
    setTimeout(function() {
      var clusters = canvas.querySelectorAll('.reveal-cluster');
      clusters.forEach(function(c) {
        c.classList.add('drop-available');
      });
    }, 0);
  }

  function onThoughtDragEnd(e) {
    e.target.classList.remove('dragging');
    
    // Clean up visual states
    var clusters = canvas.querySelectorAll('.reveal-cluster');
    clusters.forEach(function(c) {
      c.classList.remove('drop-target', 'drop-available');
    });
    
    // Remove drag ghost
    if (dragGhost && dragGhost.parentNode) {
      dragGhost.parentNode.removeChild(dragGhost);
      dragGhost = null;
    }
    
    thoughtDragState = null;
  }

  function createDragGhost(content) {
    dragGhost = document.createElement('div');
    dragGhost.className = 'reveal-drag-ghost';
    dragGhost.textContent = content;
    document.body.appendChild(dragGhost);
  }

  function onThoughtDrag(e) {
    if (!dragGhost || !thoughtDragState) return;
    dragGhost.style.left = e.clientX + 10 + 'px';
    dragGhost.style.top = e.clientY + 10 + 'px';
  }

  function endThoughtDrag() {
    // Handled by dragend event
  }

  function findThoughtCluster(thoughtId) {
    for (var i = 0; i < state.clusters.length; i++) {
      var cluster = state.clusters[i];
      if (cluster.thoughtIds && cluster.thoughtIds.indexOf(thoughtId) !== -1) {
        return cluster.id;
      }
    }
    return null; // Outlier
  }

  function moveThoughtToCluster(thoughtId, targetClusterId) {
    var sourceClusterId = thoughtDragState ? thoughtDragState.sourceClusterId : findThoughtCluster(thoughtId);
    
    // Optimistic UI update
    var thought = state.thoughts.find(function(t) { return t.thoughtId === thoughtId; });
    if (thought) {
      thought.clusterId = targetClusterId;
      thought.status = 'claimed';
    }
    
    // Update cluster thought lists
    var targetCluster = state.clusters.find(function(c) { return c.id === targetClusterId; });
    if (targetCluster) {
      if (!targetCluster.thoughtIds) targetCluster.thoughtIds = [];
      if (targetCluster.thoughtIds.indexOf(thoughtId) === -1) {
        targetCluster.thoughtIds.push(thoughtId);
      }
    }
    
    // Remove from source cluster
    if (sourceClusterId) {
      var sourceCluster = state.clusters.find(function(c) { return c.id === sourceClusterId; });
      if (sourceCluster && sourceCluster.thoughtIds) {
        var idx = sourceCluster.thoughtIds.indexOf(thoughtId);
        if (idx !== -1) {
          sourceCluster.thoughtIds.splice(idx, 1);
        }
      }
    } else {
      // Remove from outliers
      var outlierIdx = state.outliers.findIndex(function(t) { return t.thoughtId === thoughtId; });
      if (outlierIdx !== -1) {
        state.outliers.splice(outlierIdx, 1);
      }
    }
    
    // API call to persist
    var projectId = getProjectId();
    fetch('/api/projects/' + encodeURIComponent(projectId) + '/reveal/thoughts/' + thoughtId + '/cluster', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 
        clusterId: targetClusterId,
        sessionId: state.sessionId 
      })
    })
    .then(function(resp) {
      if (!resp.ok) {
        console.error('Failed to move thought');
        // Could rollback here
      }
    })
    .catch(function(err) {
      console.error('Error moving thought:', err);
    });
    
    // Re-render
    if (window.ZoReveal) {
      window.ZoReveal.refresh();
    }
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
  window.ZoRevealDrag = {
    createClusterElement: createClusterElement,
    selectCluster: selectCluster,
    bindOutlierPills: bindOutlierPills,
    moveThoughtToCluster: moveThoughtToCluster
  };
})();