/**
 * Zo Navigation Sidebar Component
 * Provides persistent navigation to all project views.
 * @module zo/ui-shell/shared/zo-nav
 */
(function() {
  "use strict";

  var NAV_ITEMS = [
    { route: "void", label: "Brainstorm", icon: "\u270F", desc: "Capture and explore ideas" },
    { route: "constellation", label: "Mind Map", icon: "\u2606", desc: "Visualize idea connections" },
    { route: "path", label: "Roadmap", icon: "\u2192", desc: "Gantt sheet and phases" },
    { route: "risk", label: "Risk Register", icon: "\u26A0", desc: "Track project risks" },
    { route: "autonomy", label: "All Projects", icon: "\u2630", desc: "Manage workspaces" }
  ];

  var PIPELINE_STAGES = ["void", "constellation", "path", "risk", "autonomy"];

  // Pipeline order for breadcrumb navigation
  var PIPELINE_ORDER = ["void", "constellation", "path", "risk", "autonomy"];

  var state = {
    currentRoute: "void",
    projectId: null,
    projectName: "Current Project",
    projects: [],
    routeStates: {},
    recommendedNext: null,
    collapsed: false,
    integrityStatus: "healthy",
    victorStance: "support"
  };

  function ZoNav() {
    this.container = null;
    this.onNavigate = null;
    this.breadcrumbContainer = null;
    this.progressContainer = null;
    this.promptContainer = null;
    this.headerContainer = null;
  }

  ZoNav.prototype.mount = function(container) {
    this.container = container;
    this.render();
    this.attachHandlers();
    this.checkResponsive();
    this.showSubpanel(state.currentRoute);
    window.addEventListener("resize", this.checkResponsive.bind(this));

    // Refresh nav badges on clustering completion
    var self = this;
    window.addEventListener("genesis:event", function(e) {
      if (e.detail && e.detail.type === "clustering_completed") {
        self.fetchNavState();
      }
    });

    // Listen for navigation from other components
    document.addEventListener("click", function(e) {
      var navBtn = e.target.closest("[data-navigate]");
      if (navBtn) {
        var route = navBtn.getAttribute("data-navigate");
        self.navigateTo(route);
      }
    });

    // Listen for cross-view cluster navigation
    document.addEventListener("click", function(e) {
      var clusterLink = e.target.closest("[data-cluster-id]");
      if (clusterLink) {
        var clusterId = clusterLink.getAttribute("data-cluster-id");
        self.navigateToCluster(clusterId);
      }
    });
  };

  ZoNav.prototype.setRoute = function(route) {
    state.currentRoute = route;
    this.render();
    this.showSubpanel(route);
  };

  ZoNav.prototype.setProjectId = function(projectId, projectName) {
    state.projectId = projectId;
    state.projectName = projectName || "Project";
    this.render();
    this.fetchNavState();
  };

  ZoNav.prototype.setProjects = function(projects) {
    state.projects = projects || [];
    this.render();
  };

  ZoNav.prototype.setIntegrityStatus = function(status) {
    state.integrityStatus = status || "healthy";
    this.render();
  };

  ZoNav.prototype.setVictorStance = function(stance) {
    state.victorStance = stance || "support";
    this.render();
  };

  ZoNav.prototype.updateRouteStates = function(routeStates, recommendedNext) {
    state.routeStates = routeStates || {};
    state.recommendedNext = recommendedNext;
    this.render();
  };

  ZoNav.prototype.fetchNavState = function() {
    var self = this;
    if (!state.projectId) return;
    fetch("/api/project/" + state.projectId + "/nav-state")
      .then(function(res) { return res.json(); })
      .then(function(data) {
        self.updateRouteStates(data.routes, data.recommendedNext);
        if (data.integrityStatus) self.setIntegrityStatus(data.integrityStatus);
        if (data.victorStance) self.setVictorStance(data.victorStance);
      })
      .catch(function() {});
  };

  ZoNav.prototype.showSubpanel = function(route, direction) {
    // Hide all subpanels and remove transition classes
    var subpanels = document.querySelectorAll(".projects-subpanel");
    subpanels.forEach(function(panel) {
      panel.classList.remove("active", "slide-left-enter", "slide-right-enter", "fade-enter");
    });

    // Show the target subpanel with appropriate transition
    var target = document.getElementById("subpanel-" + route);
    if (target) {
      target.classList.add("active");
      
      // Apply directional transition class
      if (direction === "forward") {
        target.classList.add("slide-left-enter");
      } else if (direction === "backward") {
        target.classList.add("slide-right-enter");
      }
      // Default is fade (handled by .active animation)
    }
  };

  ZoNav.prototype.navigateToCluster = function(clusterId) {
    // Navigate to constellation view and highlight cluster
    this.navigateTo("constellation");
    window.dispatchEvent(new CustomEvent("zo-highlight-cluster", { 
      detail: { clusterId: clusterId } 
    }));
  };

  ZoNav.prototype.render = function() {
    if (!this.container) return;
    var html = '<nav class="zo-nav' + (state.collapsed ? ' zo-nav--collapsed' : '') + '">';

    // Project header with integrity and Victor stance
    html += this.renderProjectHeader();

    // Breadcrumb trail
    html += this.renderBreadcrumbs();

    // Pipeline progress bar
    html += this.renderProgressBar();

    // Navigation list
    html += this.renderNavList();

    // Next step prompt
    html += this.renderNextPrompt();

    html += '</nav>';
    this.container.innerHTML = html;
    this.attachHandlers();
  };

  ZoNav.prototype.renderProjectHeader = function() {
    var html = '<div class="zo-nav__project-selector">';
    html += '<button class="zo-nav__project-btn" type="button">';
    
    // Integrity status dot
    var statusClass = "zo-nav__status-dot--" + state.integrityStatus;
    html += '<span class="zo-nav__status-dot ' + statusClass + '"></span>';
    
    if (!state.collapsed) {
      html += '<span class="zo-nav__project-name">' + this.escapeHtml(state.projectName) + '</span>';
      
      // Victor stance badge
      var stanceLabels = { support: "S", challenge: "C", mixed: "M", "red-flag": "R" };
      var stanceColors = { 
        support: "zo-nav__stance--support", 
        challenge: "zo-nav__stance--challenge", 
        mixed: "zo-nav__stance--mixed", 
        "red-flag": "zo-nav__stance--red-flag" 
      };
      html += '<span class="zo-nav__stance ' + (stanceColors[state.victorStance] || "") + '" title="Victor: ' + state.victorStance + '">';
      html += stanceLabels[state.victorStance] || "S";
      html += '</span>';
      
      html += '<span class="zo-nav__project-chevron">\u25BC</span>';
    }
    html += '</button>';
    html += '</div>';
    return html;
  };

  ZoNav.prototype.renderBreadcrumbs = function() {
    if (state.collapsed) return "";
    
    // Find current view label
    var currentItem = NAV_ITEMS.find(function(item) {
      return item.route === state.currentRoute;
    });
    var currentLabel = currentItem ? currentItem.label : "Unknown";
    
    // Build breadcrumb: Project > Current View
    var html = '<div class="zo-nav__breadcrumbs" role="navigation" aria-label="Breadcrumb">';
    html += '<ol class="zo-nav__breadcrumb-list">';
    
    // Project name (root)
    html += '<li class="zo-nav__breadcrumb-item">';
    html += '<button class="zo-nav__breadcrumb-link" data-breadcrumb-route="autonomy" type="button">';
    html += this.escapeHtml(state.projectName);
    html += '</button>';
    html += '</li>';
    
    // Pipeline stages before current (clickable)
    var currentIndex = PIPELINE_ORDER.indexOf(state.currentRoute);
    if (currentIndex > 0) {
      for (var i = 0; i < currentIndex; i++) {
        var prevRoute = PIPELINE_ORDER[i];
        var prevItem = NAV_ITEMS.find(function(item) { return item.route === prevRoute; });
        if (prevItem && prevRoute !== "autonomy") {
          html += '<li class="zo-nav__breadcrumb-separator" aria-hidden="true">\u203A</li>';
          html += '<li class="zo-nav__breadcrumb-item">';
          html += '<button class="zo-nav__breadcrumb-link" data-breadcrumb-route="' + prevRoute + '" type="button">';
          html += prevItem.label;
          html += '</button>';
          html += '</li>';
        }
      }
    }
    
    // Current view (not clickable)
    html += '<li class="zo-nav__breadcrumb-separator" aria-hidden="true">\u203A</li>';
    html += '<li class="zo-nav__breadcrumb-item zo-nav__breadcrumb-current" aria-current="page">';
    html += '<span>' + currentLabel + '</span>';
    html += '</li>';
    
    html += '</ol>';
    html += '</div>';
    return html;
  };

  ZoNav.prototype.renderProgressBar = function() {
    if (state.collapsed) return "";
    
    var completed = 0;
    var total = PIPELINE_STAGES.length;
    
    for (var i = 0; i < PIPELINE_STAGES.length; i++) {
      var route = PIPELINE_STAGES[i];
      var routeState = state.routeStates[route] || {};
      if (routeState.hasData) completed++;
    }
    
    var percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    var html = '<div class="zo-nav__progress">';
    html += '<div class="zo-nav__progress-bar">';
    html += '<div class="zo-nav__progress-fill" style="width: ' + percent + '%"></div>';
    html += '</div>';
    html += '<span class="zo-nav__progress-text">' + completed + '/' + total + ' stages</span>';
    html += '</div>';
    return html;
  };

  ZoNav.prototype.renderNavList = function() {
    var html = '<ul class="zo-nav__list">';

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      var isActive = state.currentRoute === item.route;
      var routeState = state.routeStates[item.route] || {};
      var hasData = routeState.hasData;
      var isRecommended = state.recommendedNext === item.route;
      var classes = "zo-nav__item";
      if (isActive) classes += " zo-nav__item--active";
      if (hasData) classes += " zo-nav__item--has-data";
      if (isRecommended) classes += " zo-nav__item--recommended";

      html += '<li class="' + classes + '" data-route="' + item.route + '" tabindex="0">';
      html += '<span class="zo-nav__icon">' + item.icon + '</span>';
      html += '<span class="zo-nav__label">' + item.label + '</span>';
      if (hasData && routeState.count !== undefined) {
        html += '<span class="zo-nav__badge">' + routeState.count + '</span>';
      }
      if (isRecommended) {
        html += '<span class="zo-nav__pulse"></span>';
      }
      html += '<span class="zo-nav__tooltip">' + item.desc + '</span>';
      html += '</li>';
    }

    html += '</ul>';
    return html;
  };

  ZoNav.prototype.renderNextPrompt = function() {
    if (state.collapsed || !state.recommendedNext) return "";
    
    var nextItem = NAV_ITEMS.find(function(item) {
      return item.route === state.recommendedNext;
    });
    
    if (!nextItem) return "";
    
    var html = '<div class="zo-nav__prompt">';
    html += '<span class="zo-nav__prompt-icon">\u2192</span>';
    html += '<span class="zo-nav__prompt-text">Next: <strong>' + nextItem.label + '</strong></span>';
    html += '<button class="zo-nav__prompt-btn" data-goto="' + state.recommendedNext + '">Go</button>';
    html += '</div>';
    return html;
  };

  ZoNav.prototype.escapeHtml = function(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  ZoNav.prototype.attachHandlers = function() {
    var self = this;
    var items = this.container.querySelectorAll(".zo-nav__item");
    items.forEach(function(item) {
      item.addEventListener("click", function() {
        var route = item.getAttribute("data-route");
        self.navigateTo(route);
      });
      item.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var route = item.getAttribute("data-route");
          self.navigateTo(route);
        }
      });
    });

    // Project selector click
    var projectBtn = this.container.querySelector(".zo-nav__project-btn");
    if (projectBtn) {
      projectBtn.addEventListener("click", function() {
        // Navigate to All Projects view
        self.navigateTo("autonomy");
      });
    }

    // Next prompt button
    var promptBtn = this.container.querySelector(".zo-nav__prompt-btn");
    if (promptBtn) {
      promptBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        var route = promptBtn.getAttribute("data-goto");
        if (route) self.navigateTo(route);
      });
    }

    // Breadcrumb navigation
    var breadcrumbLinks = this.container.querySelectorAll("[data-breadcrumb-route]");
    breadcrumbLinks.forEach(function(link) {
      link.addEventListener("click", function(e) {
        e.preventDefault();
        var route = link.getAttribute("data-breadcrumb-route");
        self.navigateTo(route);
      });
    });
  };

  ZoNav.prototype.navigateTo = function(route) {
    var previousRoute = state.currentRoute;
    var direction = this.getTransitionDirection(previousRoute, route);
    state.currentRoute = route;
    this.render();
    this.showSubpanel(route, direction);
    
    // Dispatch navigation event with transition info
    window.dispatchEvent(new CustomEvent("zo-navigate", { 
      detail: { 
        route: route, 
        previousRoute: previousRoute,
        direction: direction
      } 
    }));
    
    if (typeof this.onNavigate === "function") {
      this.onNavigate(route);
    }
  };

  ZoNav.prototype.getTransitionDirection = function(fromRoute, toRoute) {
    var fromIndex = PIPELINE_ORDER.indexOf(fromRoute);
    var toIndex = PIPELINE_ORDER.indexOf(toRoute);
    if (toIndex > fromIndex) return "forward";
    if (toIndex < fromIndex) return "backward";
    return "none";
  };

  ZoNav.prototype.checkResponsive = function() {
    var wasCollapsed = state.collapsed;
    state.collapsed = window.innerWidth < 768;
    if (wasCollapsed !== state.collapsed) {
      this.render();
    }
  };

  window.ZoNav = new ZoNav();
})();
