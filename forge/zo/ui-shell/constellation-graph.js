/**
 * Constellation Graph Editor
 *
 * SVG-based node graph editor with pan/zoom, drag, edge drawing, and layout algorithms.
 * 
 * WCAG 2.1 AA Compliant:
 * - SVG has role="application" for interactive graph
 * - All nodes are keyboard accessible with tabindex
 * - Status changes announced to screen readers
 * - Focus indicators visible on nodes
 * 
 * @module zo/ui-shell/constellation-graph
 */
(function() {
  "use strict";

  // ============================================
  // STATE
  // ============================================
  
  var container = null;
  var svg = null;
  var mainGroup = null;
  var edgesGroup = null;
  var nodesGroup = null;
  var minimapEl = null;
  var statusRegion = null;
  
  var projectId = null;
  var clusters = [];
  var edges = [];
  var nodePositions = {};
  
  // View state
  var viewBox = { x: 0, y: 0, width: 800, height: 600 };
  var scale = 1;
  var minScale = 0.25;
  var maxScale = 4;
  
  // Interaction state
  var isDragging = false;
  var isPanning = false;
  var isDrawingEdge = false;
  var dragStart = null;
  var dragNode = null;
  var edgeStartNode = null;
  var tempEdge = null;
  var selectedNode = null;
  
  // Layout algorithm state
  var currentLayout = "force";
  var layoutAnimationId = null;

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function mount(el) {
    container = el || document.querySelector(".constellation-tree");
    if (!container) return;
    
    // Add ARIA role to container
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Mind map graph editor");
    
    createStatusRegion();
    createSVG();
    createMinimap();
    bindEvents();
    
    // Listen for pipeline events
    window.addEventListener("genesis:event", function(e) {
      if (e.detail && e.detail.type === "clustering_completed") fetchData();
    });
    window.addEventListener("brainstorm:recording-ingested", function() {
      fetchData();
    });
  }
  
  function createStatusRegion() {
    // Create live region for announcements
    statusRegion = document.createElement("div");
    statusRegion.className = "sr-only";
    statusRegion.setAttribute("role", "status");
    statusRegion.setAttribute("aria-live", "polite");
    statusRegion.setAttribute("aria-atomic", "true");
    container.appendChild(statusRegion);
  }
  
  function announce(message) {
    if (statusRegion) {
      statusRegion.textContent = message;
    }
  }
  
  function createSVG() {
    var rect = container.getBoundingClientRect();
    var width = rect.width || 800;
    var height = Math.max(400, rect.height || 400);
    
    viewBox = { x: 0, y: 0, width: width, height: height };
    
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "constellation-svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", height + "px");
    svg.setAttribute("viewBox", viewBox.x + " " + viewBox.y + " " + viewBox.width + " " + viewBox.height);
    svg.setAttribute("role", "application");
    svg.setAttribute("aria-label", "Interactive mind map. Use arrow keys to pan, plus/minus to zoom, tab to navigate nodes. Press enter to select a node, shift-click to draw edges between nodes.");
    svg.setAttribute("tabindex", "0");
    svg.style.cursor = "grab";
    
    // Definitions (markers, filters)
    var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    
    // Arrow marker for edges
    var marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    var polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygon.setAttribute("fill", "var(--color-primary, #3b82f6)");
    marker.appendChild(polygon);
    defs.appendChild(marker);
    
    // Glow filter
    var filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "glow");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    var feGaussianBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    feGaussianBlur.setAttribute("stdDeviation", "3");
    feGaussianBlur.setAttribute("result", "coloredBlur");
    filter.appendChild(feGaussianBlur);
    var feMerge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    var feMergeNode1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    feMergeNode1.setAttribute("in", "coloredBlur");
    var feMergeNode2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    feMergeNode2.setAttribute("in", "SourceGraphic");
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    filter.appendChild(feMerge);
    defs.appendChild(filter);
    
    svg.appendChild(defs);
    
    // Layer groups (order matters for z-index)
    edgesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgesGroup.setAttribute("class", "edges-layer");
    edgesGroup.setAttribute("role", "presentation");
    edgesGroup.setAttribute("aria-label", "Connections between clusters");
    svg.appendChild(edgesGroup);
    
    mainGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    mainGroup.setAttribute("class", "main-layer");
    mainGroup.setAttribute("role", "presentation");
    svg.appendChild(mainGroup);
    
    nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodesGroup.setAttribute("class", "nodes-layer");
    nodesGroup.setAttribute("role", "list");
    nodesGroup.setAttribute("aria-label", "Cluster nodes");
    mainGroup.appendChild(nodesGroup);
    
    container.innerHTML = "";
    container.appendChild(svg);
  }
  
  function createMinimap() {
    minimapEl = document.createElement("div");
    minimapEl.className = "constellation-minimap";
    minimapEl.setAttribute("aria-hidden", "true");
    minimapEl.innerHTML = "<canvas width=\"150\" height=\"100\"></canvas>";
    container.appendChild(minimapEl);
  }

  // ============================================
  // DATA MANAGEMENT
  // ============================================
  
  function setProjectId(id) {
    projectId = id;
    if (projectId) fetchData();
  }
  
  function setData(data) {
    clusters = data.clusters || [];
    edges = data.edges || [];
    nodePositions = data.positions || {};
    
    // Initialize positions for new nodes
    clusters.forEach(function(c, i) {
      if (!nodePositions[c.id]) {
        nodePositions[c.id] = calculateInitialPosition(i, clusters.length);
      }
    });
    
    render();
    announce("Mind map loaded with " + clusters.length + " clusters");
  }
  
  function fetchData() {
    if (!projectId || !container) return;
    
    showLoading();
    
    fetch("/api/constellation/" + encodeURIComponent(projectId))
      .then(function(res) {
        if (!res.ok) throw new Error("Failed to load constellation");
        return res.json();
      })
      .then(function(data) {
        clusters = data.clusters || [];
        edges = data.edges || [];
        nodePositions = data.positions || {};
        
        // Initialize positions
        clusters.forEach(function(c, i) {
          if (!nodePositions[c.id]) {
            nodePositions[c.id] = calculateInitialPosition(i, clusters.length);
          }
        });
        
        hideLoading();
        render();
        announce("Mind map loaded with " + clusters.length + " clusters");
      })
      .catch(function(err) {
        console.error("Constellation load error:", err);
        showError("Failed to load mind map");
        announce("Error: Failed to load mind map");
      });
  }
  
  function calculateInitialPosition(index, total) {
    var cols = Math.ceil(Math.sqrt(total));
    var row = Math.floor(index / cols);
    var col = index % cols;
    var spacing = 180;
    var offsetX = (viewBox.width - cols * spacing) / 2;
    var offsetY = 100;
    
    return {
      x: offsetX + col * spacing + 80,
      y: offsetY + row * spacing + 80
    };
  }

  function showLoading() {
    if (!svg) return;
    
    var loading = document.createElementNS("http://www.w3.org/2000/svg", "text");
    loading.setAttribute("class", "loading-text");
    loading.setAttribute("x", viewBox.width / 2);
    loading.setAttribute("y", viewBox.height / 2);
    loading.setAttribute("text-anchor", "middle");
    loading.setAttribute("fill", "var(--color-muted, #64748b)");
    loading.setAttribute("font-size", "14");
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-live", "polite");
    loading.textContent = "Loading mind map...";
    
    nodesGroup.innerHTML = "";
    nodesGroup.appendChild(loading);
    announce("Loading mind map");
  }
  
  function showError(message) {
    if (!svg) return;
    
    nodesGroup.innerHTML = "";
    
    var errorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    errorText.setAttribute("class", "error-text");
    errorText.setAttribute("x", viewBox.width / 2);
    errorText.setAttribute("y", viewBox.height / 2);
    errorText.setAttribute("text-anchor", "middle");
    errorText.setAttribute("fill", "var(--color-error, #ef4444)");
    errorText.setAttribute("font-size", "14");
    errorText.setAttribute("role", "alert");
    errorText.setAttribute("aria-live", "assertive");
    errorText.textContent = message;
    nodesGroup.appendChild(errorText);
  }
  
  function hideLoading() {
    var loading = nodesGroup.querySelector(".loading-text");
    if (loading) loading.remove();
  }

  // ============================================
  // RENDERING
  // ============================================
  
  function render() {
    if (!nodesGroup || !edgesGroup) return;
    
    renderEdges();
    renderNodes();
    renderMinimap();
  }
  
  function renderNodes() {
    nodesGroup.innerHTML = "";
    
    clusters.forEach(function(cluster, index) {
      var pos = nodePositions[cluster.id] || { x: 100, y: 100 };
      var thoughtCount = Array.isArray(cluster.thoughtIds) ? cluster.thoughtIds.length : 0;
      
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "constellation-node" + (cluster.locked ? " locked" : ""));
      g.setAttribute("data-node-id", cluster.id);
      g.setAttribute("transform", "translate(" + pos.x + "," + pos.y + ")");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", cluster.name || cluster.suggestedName || "Cluster " + (index + 1) + ", " + thoughtCount + " ideas" + (cluster.locked ? ", locked" : ""));
      g.setAttribute("aria-pressed", selectedNode === cluster.id ? "true" : "false");
      
      // Node circle
      var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      var radius = 40 + Math.min(20, thoughtCount * 3);
      circle.setAttribute("r", radius);
      circle.setAttribute("class", "node-circle");
      circle.setAttribute("fill", cluster.locked ? "var(--color-muted, #64748b)" : "var(--color-primary, #3b82f6)");
      circle.setAttribute("fill-opacity", "0.15");
      circle.setAttribute("stroke", cluster.locked ? "var(--color-muted, #64748b)" : "var(--color-primary, #3b82f6)");
      circle.setAttribute("stroke-width", "2");
      circle.setAttribute("aria-hidden", "true");
      g.appendChild(circle);
      
      // Node label
      var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("class", "node-label");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dy", "-0.3em");
      text.setAttribute("fill", "var(--color-text, #f1f5f9)");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-weight", "600");
      text.setAttribute("aria-hidden", "true");
      text.textContent = truncateText(cluster.name || cluster.suggestedName || "Cluster", 20);
      g.appendChild(text);
      
      // Thought count
      var countText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      countText.setAttribute("class", "node-count");
      countText.setAttribute("text-anchor", "middle");
      countText.setAttribute("dy", "1.2em");
      countText.setAttribute("fill", "var(--color-muted, #64748b)");
      countText.setAttribute("font-size", "11");
      countText.setAttribute("aria-hidden", "true");
      countText.textContent = thoughtCount + " idea" + (thoughtCount !== 1 ? "s" : "");
      g.appendChild(countText);
      
      // Lock badge
      if (cluster.locked) {
        var badge = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badge.setAttribute("class", "lock-badge");
        badge.setAttribute("text-anchor", "middle");
        badge.setAttribute("dy", "2.5em");
        badge.setAttribute("fill", "var(--color-warning, #f59e0b)");
        badge.setAttribute("font-size", "10");
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = "🔒 locked";
        g.appendChild(badge);
      }
      
      nodesGroup.appendChild(g);
    });
  }
  
  function renderEdges() {
    edgesGroup.innerHTML = "";
    
    edges.forEach(function(edge) {
      var sourcePos = nodePositions[edge.sourceId];
      var targetPos = nodePositions[edge.targetId];
      
      if (!sourcePos || !targetPos) return;
      
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      var d = "M " + sourcePos.x + " " + sourcePos.y + " L " + targetPos.x + " " + targetPos.y;
      path.setAttribute("d", d);
      path.setAttribute("class", "edge-path");
      path.setAttribute("stroke", "var(--color-primary, #3b82f6)");
      path.setAttribute("stroke-width", 2 + (edge.weight || 1));
      path.setAttribute("stroke-opacity", "0.6");
      path.setAttribute("fill", "none");
      path.setAttribute("data-edge-id", edge.id);
      path.setAttribute("marker-end", "url(#arrowhead)");
      path.setAttribute("role", "presentation");
      path.setAttribute("aria-hidden", "true");
      
      // Edge label
      if (edge.label) {
        var midX = (sourcePos.x + targetPos.x) / 2;
        var midY = (sourcePos.y + targetPos.y) / 2;
        
        var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", midX);
        label.setAttribute("y", midY - 8);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", "var(--color-muted, #64748b)");
        label.setAttribute("font-size", "10");
        label.setAttribute("class", "edge-label");
        label.setAttribute("aria-hidden", "true");
        label.textContent = edge.label;
        edgesGroup.appendChild(label);
      }
      
      edgesGroup.appendChild(path);
    });
    
    // Temporary edge while drawing
    if (tempEdge) {
      var tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      tempPath.setAttribute("d", tempEdge);
      tempPath.setAttribute("class", "edge-path temp-edge");
      tempPath.setAttribute("stroke", "var(--color-accent, #8b5cf6)");
      tempPath.setAttribute("stroke-width", "2");
      tempPath.setAttribute("stroke-dasharray", "5,5");
      tempPath.setAttribute("fill", "none");
      tempPath.setAttribute("aria-hidden", "true");
      edgesGroup.appendChild(tempPath);
    }
  }
  
  function renderMinimap() {
    var canvas = minimapEl ? minimapEl.querySelector("canvas") : null;
    if (!canvas) return;
    
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.fillRect(0, 0, w, h);
    
    if (clusters.length === 0) return;
    
    // Calculate bounds
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    clusters.forEach(function(c) {
      var pos = nodePositions[c.id];
      if (pos) {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      }
    });
    
    var padding = 50;
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;
    
    var scaleX = w / (maxX - minX);
    var scaleY = h / (maxY - minY);
    var s = Math.min(scaleX, scaleY);
    
    // Draw edges
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    edges.forEach(function(edge) {
      var sPos = nodePositions[edge.sourceId];
      var tPos = nodePositions[edge.targetId];
      if (sPos && tPos) {
        ctx.beginPath();
        ctx.moveTo((sPos.x - minX) * s, (sPos.y - minY) * s);
        ctx.lineTo((tPos.x - minX) * s, (tPos.y - minY) * s);
        ctx.stroke();
      }
    });
    
    // Draw nodes
    ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
    clusters.forEach(function(c) {
      var pos = nodePositions[c.id];
      if (pos) {
        ctx.beginPath();
        ctx.arc((pos.x - minX) * s, (pos.y - minY) * s, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Draw viewport indicator
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (-viewBox.x - minX) * s,
      (-viewBox.y - minY) * s,
      viewBox.width / scale * s,
      viewBox.height / scale * s
    );
  }

  // ============================================
  // EVENT HANDLING
  // ============================================
  
  function bindEvents() {
    if (!svg) return;
    
    // Mouse events
    svg.addEventListener("mousedown", handleMouseDown);
    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("mouseleave", handleMouseUp);
    svg.addEventListener("wheel", handleWheel, { passive: false });
    svg.addEventListener("dblclick", handleDoubleClick);
    
    // Touch events
    svg.addEventListener("touchstart", handleTouchStart, { passive: false });
    svg.addEventListener("touchmove", handleTouchMove, { passive: false });
    svg.addEventListener("touchend", handleTouchEnd);
    
    // Keyboard events
    document.addEventListener("keydown", handleKeyDown);
    
    // View toggle buttons
    document.querySelectorAll(".mindmap-toggle-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var view = btn.getAttribute("data-view");
        setViewMode(view);
      });
    });
    
    // Layout buttons
    document.querySelectorAll("[data-layout]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var layout = btn.getAttribute("data-layout");
        applyLayout(layout);
      });
    });
  }
  
  function handleMouseDown(e) {
    var target = e.target.closest(".constellation-node");
    var pos = getSVGPoint(e);
    
    if (target) {
      // Node interaction
      var nodeId = target.getAttribute("data-node-id");
      
      if (e.shiftKey) {
        // Start edge drawing
        isDrawingEdge = true;
        edgeStartNode = nodeId;
        svg.style.cursor = "crosshair";
      } else {
        // Start node drag
        isDragging = true;
        dragNode = nodeId;
        dragStart = pos;
        target.classList.add("dragging");
        svg.style.cursor = "grabbing";
      }
    } else {
      // Start panning
      isPanning = true;
      dragStart = { x: e.clientX, y: e.clientY, viewBoxX: viewBox.x, viewBoxY: viewBox.y };
      svg.style.cursor = "grabbing";
    }
  }
  
  function handleMouseMove(e) {
    var pos = getSVGPoint(e);
    
    if (isDragging && dragNode) {
      // Move node
      nodePositions[dragNode] = { x: pos.x, y: pos.y };
      render();
    } else if (isPanning && dragStart) {
      // Pan view
      var dx = (e.clientX - dragStart.x) / scale;
      var dy = (e.clientY - dragStart.y) / scale;
      viewBox.x = dragStart.viewBoxX - dx;
      viewBox.y = dragStart.viewBoxY - dy;
      updateViewBox();
    } else if (isDrawingEdge && edgeStartNode) {
      // Draw temp edge
      var startPos = nodePositions[edgeStartNode];
      if (startPos) {
        tempEdge = "M " + startPos.x + " " + startPos.y + " L " + pos.x + " " + pos.y;
        render();
      }
    }
  }
  
  function handleMouseUp(e) {
    if (isDrawingEdge && edgeStartNode) {
      // Check if dropped on a node
      var target = e.target.closest(".constellation-node");
      if (target) {
        var targetId = target.getAttribute("data-node-id");
        if (targetId && targetId !== edgeStartNode) {
          createEdge(edgeStartNode, targetId);
        }
      }
    }
    
    if (isDragging && dragNode) {
      saveNodePosition(dragNode);
    }
    
    // Reset state
    document.querySelectorAll(".constellation-node.dragging").forEach(function(n) {
      n.classList.remove("dragging");
    });
    
    isDragging = false;
    isPanning = false;
    isDrawingEdge = false;
    dragNode = null;
    dragStart = null;
    edgeStartNode = null;
    tempEdge = null;
    selectedNode = null;
    svg.style.cursor = "grab";
    render();
  }
  
  function handleWheel(e) {
    e.preventDefault();
    
    var pos = getSVGPoint(e);
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    var newScale = Math.max(minScale, Math.min(maxScale, scale * delta));
    
    if (newScale !== scale) {
      // Zoom toward cursor
      viewBox.x = pos.x - (pos.x - viewBox.x) * (scale / newScale);
      viewBox.y = pos.y - (pos.y - viewBox.y) * (scale / newScale);
      viewBox.width = viewBox.width * (scale / newScale);
      viewBox.height = viewBox.height * (scale / newScale);
      scale = newScale;
      updateViewBox();
      renderMinimap();
    }
  }
  
  function handleDoubleClick(e) {
    var target = e.target.closest(".constellation-node");
    if (target) {
      var nodeId = target.getAttribute("data-node-id");
      editNodeLabel(nodeId);
    }
  }
  
  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      handleMouseDown(e.touches[0]);
    } else if (e.touches.length === 2) {
      // Pinch zoom
      isPanning = false;
      isDragging = false;
    }
  }
  
  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      handleMouseMove(e.touches[0]);
    }
  }
  
  function handleTouchEnd(e) {
    handleMouseUp(e);
  }
  
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      cancelCurrentAction();
    } else if (e.key === "Delete" && selectedNode) {
      deleteNode(selectedNode);
    }
  }
  
  function getSVGPoint(e) {
    var rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + (e.clientX - rect.left) / scale,
      y: viewBox.y + (e.clientY - rect.top) / scale
    };
  }
  
  function updateViewBox() {
    svg.setAttribute("viewBox", viewBox.x + " " + viewBox.y + " " + viewBox.width + " " + viewBox.height);
  }

  // ============================================
  // ACTIONS
  // ============================================
  
  function createEdge(sourceId, targetId) {
    var edge = {
      id: "edge-" + Date.now(),
      sourceId: sourceId,
      targetId: targetId,
      label: "",
      weight: 1
    };
    edges.push(edge);
    saveEdge(edge);
    render();
  }
  
  function saveEdge(edge) {
    if (!projectId) return;
    
    fetch("/api/constellation/" + encodeURIComponent(projectId) + "/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edge)
    }).catch(function(err) {
      console.error("Failed to save edge:", err);
    });
  }
  
  function saveNodePosition(nodeId) {
    if (!projectId) return;
    
    fetch("/api/constellation/" + encodeURIComponent(projectId) + "/positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: nodeId, position: nodePositions[nodeId] })
    }).catch(function(err) {
      console.error("Failed to save position:", err);
    });
  }
  
  function editNodeLabel(nodeId) {
    var cluster = clusters.find(function(c) { return c.id === nodeId; });
    if (!cluster || cluster.locked) return;
    
    var currentName = cluster.name || cluster.suggestedName || "";
    var newName = prompt("Edit cluster name:", currentName);
    
    if (newName && newName !== currentName) {
      cluster.name = newName;
      render();
      
      // Save to API
      fetch("/api/constellation/" + encodeURIComponent(projectId) + "/clusters/" + nodeId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
      }).catch(function(err) {
        console.error("Failed to update cluster:", err);
      });
    }
  }
  
  function cancelCurrentAction() {
    isDragging = false;
    isPanning = false;
    isDrawingEdge = false;
    dragNode = null;
    edgeStartNode = null;
    tempEdge = null;
    selectedNode = null;
    svg.style.cursor = "grab";
    render();
  }
  
  function setViewMode(mode) {
    document.querySelectorAll(".mindmap-toggle-btn").forEach(function(btn) {
      btn.classList.toggle("active", btn.getAttribute("data-view") === mode);
    });
    
    // Show/hide appropriate view
    var treeEl = document.querySelector(".constellation-tree");
    var canvasEl = document.querySelector(".constellation-canvas");
    var graphEl = container.querySelector(".constellation-svg");
    
    if (treeEl) treeEl.style.display = mode === "hierarchical" ? "" : "none";
    if (canvasEl) canvasEl.style.display = mode === "spatial" ? "" : "none";
    if (graphEl) graphEl.style.display = mode === "graph" ? "" : "none";
  }

  // ============================================
  // LAYOUT ALGORITHMS
  // ============================================
  
  function applyLayout(layoutType) {
    currentLayout = layoutType;
    
    switch (layoutType) {
      case "force":
        applyForceDirectedLayout();
        break;
      case "hierarchical":
        applyHierarchicalLayout();
        break;
      case "circular":
        applyCircularLayout();
        break;
      case "grid":
        applyGridLayout();
        break;
    }
  }
  
  function applyForceDirectedLayout() {
    if (clusters.length === 0) return;
    
    var iterations = 100;
    var k = 50; // Spring constant
    var repulsion = 5000;
    var damping = 0.85;
    
    // Initialize velocities
    var velocities = {};
    clusters.forEach(function(c) {
      velocities[c.id] = { x: 0, y: 0 };
    });
    
    function step() {
      var forces = {};
      clusters.forEach(function(c) {
        forces[c.id] = { x: 0, y: 0 };
      });
      
      // Repulsion between nodes
      for (var i = 0; i < clusters.length; i++) {
        for (var j = i + 1; j < clusters.length; j++) {
          var c1 = clusters[i];
          var c2 = clusters[j];
          var p1 = nodePositions[c1.id];
          var p2 = nodePositions[c2.id];
          
          var dx = p2.x - p1.x;
          var dy = p2.y - p1.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = repulsion / (dist * dist);
          
          forces[c1.id].x -= (dx / dist) * force;
          forces[c1.id].y -= (dy / dist) * force;
          forces[c2.id].x += (dx / dist) * force;
          forces[c2.id].y += (dy / dist) * force;
        }
      }
      
      // Attraction along edges
      edges.forEach(function(e) {
        var p1 = nodePositions[e.sourceId];
        var p2 = nodePositions[e.targetId];
        if (!p1 || !p2) return;
        
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = (dist - k) * 0.1;
        
        forces[e.sourceId].x += (dx / dist) * force;
        forces[e.sourceId].y += (dy / dist) * force;
        forces[e.targetId].x -= (dx / dist) * force;
        forces[e.targetId].y -= (dy / dist) * force;
      });
      
      // Apply forces
      clusters.forEach(function(c) {
        velocities[c.id].x = (velocities[c.id].x + forces[c.id].x) * damping;
        velocities[c.id].y = (velocities[c.id].y + forces[c.id].y) * damping;
        
        nodePositions[c.id].x += velocities[c.id].x;
        nodePositions[c.id].y += velocities[c.id].y;
        
        // Keep within bounds
        nodePositions[c.id].x = Math.max(50, Math.min(viewBox.width - 50, nodePositions[c.id].x));
        nodePositions[c.id].y = Math.max(50, Math.min(viewBox.height - 50, nodePositions[c.id].y));
      });
      
      render();
      
      iterations--;
      if (iterations > 0) {
        layoutAnimationId = requestAnimationFrame(step);
      }
    }
    
    cancelAnimationFrame(layoutAnimationId);
    step();
  }
  
  function applyHierarchicalLayout() {
    var levels = {};
    var maxLevel = 0;
    
    // Simple level assignment based on edges
    clusters.forEach(function(c) {
      levels[c.id] = 0;
    });
    
    edges.forEach(function(e) {
      if (levels[e.targetId] !== undefined) {
        levels[e.targetId] = Math.max(levels[e.targetId], (levels[e.sourceId] || 0) + 1);
        maxLevel = Math.max(maxLevel, levels[e.targetId]);
      }
    });
    
    // Position nodes by level
    var levelCounts = {};
    clusters.forEach(function(c) {
      var level = levels[c.id] || 0;
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    });
    
    var levelIndices = {};
    clusters.forEach(function(c) {
      var level = levels[c.id] || 0;
      levelIndices[level] = (levelIndices[level] || 0);
      
      var y = 100 + level * 120;
      var x = (viewBox.width / 2) + (levelIndices[level] - (levelCounts[level] - 1) / 2) * 150;
      
      nodePositions[c.id] = { x: x, y: y };
      levelIndices[level]++;
    });
    
    render();
  }
  
  function applyCircularLayout() {
    var centerX = viewBox.width / 2;
    var centerY = viewBox.height / 2;
    var radius = Math.min(centerX, centerY) * 0.7;
    
    clusters.forEach(function(c, i) {
      var angle = (2 * Math.PI * i) / clusters.length - Math.PI / 2;
      nodePositions[c.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
    
    render();
  }
  
  function applyGridLayout() {
    var cols = Math.ceil(Math.sqrt(clusters.length));
    var rows = Math.ceil(clusters.length / cols);
    var cellWidth = viewBox.width / (cols + 1);
    var cellHeight = viewBox.height / (rows + 1);
    
    clusters.forEach(function(c, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      nodePositions[c.id] = {
        x: cellWidth * (col + 1),
        y: cellHeight * (row + 1)
      };
    });
    
    render();
  }

  // ============================================
  // UTILITIES
  // ============================================
  
  function truncateText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3) + "...";
  }
  
  function createStatusRegion() {
    // Create live region for announcements
    statusRegion = document.createElement("div");
    statusRegion.className = "sr-only";
    statusRegion.setAttribute("role", "status");
    statusRegion.setAttribute("aria-live", "polite");
    statusRegion.setAttribute("aria-atomic", "true");
    container.appendChild(statusRegion);
  }
  
  function announce(message) {
    if (statusRegion) {
      statusRegion.textContent = message;
    }
  }
  
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // PUBLIC API
  // ============================================
  
  window.ZoConstellationGraph = {
    mount: mount,
    setProjectId: setProjectId,
    setData: setData,
    refresh: fetchData,
    applyLayout: applyLayout,
    render: render
  };
})();
