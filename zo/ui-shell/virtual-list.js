/**
 * VirtualList - Efficient rendering for large lists
 * 
 * Renders only visible items, enabling smooth scrolling with thousands of entries.
 * Used by Void thoughts list, Risk register, and other data-heavy views.
 * 
 * Features:
 * - O(visible) DOM nodes instead of O(total)
 * - Smooth scrolling with position caching
 * - Variable height support with measurement
 * - Keyboard navigation
 * - ARIA accessibility
 */
(function() {
  'use strict';

  var ITEM_ESTIMATED_HEIGHT = 80; // Default estimate, adjusts with measurement
  var OVERSCAN_COUNT = 3; // Extra items rendered above/below viewport
  var RESIZE_DEBOUNCE_MS = 100;

  /**
   * Create a new VirtualList instance
   * @param {Object} options
   * @param {HTMLElement} options.container - Scrollable container element
   * @param {Function} options.renderItem - Function to render an item: (item, index) => HTMLElement
   * @param {Function} options.getItemKey - Function to get unique key for an item
   * @param {number} [options.itemHeight] - Fixed or estimated item height
   * @param {number} [options.overscan] - Number of extra items to render
   * @param {Function} [options.onItemClick] - Click handler for items
   * @param {Function} [options.onItemKeyDown] - Keyboard handler for items
   */
  function VirtualList(options) {
    this.container = options.container;
    this.renderItem = options.renderItem;
    this.getItemKey = options.getItemKey || function(item, index) { return index; };
    this.itemHeight = options.itemHeight || ITEM_ESTIMATED_HEIGHT;
    this.overscan = options.overscan || OVERSCAN_COUNT;
    this.onItemClick = options.onItemClick;
    this.onItemKeyDown = options.onItemKeyDown;

    this.items = [];
    this.positions = []; // Cached positions for variable heights
    this.measuredHeights = new Map(); // Measured heights by key
    this.visibleRange = { start: 0, end: 0 };
    this.scrollTop = 0;
    this.scrollContainer = null;
    this.contentEl = null;
    this.itemsEl = null;

    this._scrollHandler = null;
    this._resizeObserver = null;
    this._mutationObserver = null;

    this.init();
  }

  VirtualList.prototype = {
    init: function() {
      // Create structure
      this.container.innerHTML = '';
      this.container.setAttribute('role', 'list');
      this.container.setAttribute('aria-label', 'Virtual list');
      
      // Scroll container
      this.scrollContainer = document.createElement('div');
      this.scrollContainer.className = 'virtual-list-scroll';
      this.scrollContainer.style.cssText = 'overflow-y: auto; height: 100%; position: relative;';
      
      // Content wrapper (total height)
      this.contentEl = document.createElement('div');
      this.contentEl.className = 'virtual-list-content';
      this.contentEl.style.cssText = 'position: relative; min-height: 100%;';
      
      // Items container (visible items)
      this.itemsEl = document.createElement('div');
      this.itemsEl.className = 'virtual-list-items';
      this.itemsEl.style.cssText = 'position: absolute; top: 0; left: 0; right: 0;';
      
      this.contentEl.appendChild(this.itemsEl);
      this.scrollContainer.appendChild(this.contentEl);
      this.container.appendChild(this.scrollContainer);

      // Bind scroll handler
      this._scrollHandler = this._onScroll.bind(this);
      this.scrollContainer.addEventListener('scroll', this._scrollHandler, { passive: true });

      // Resize observer for container
      this._resizeObserver = new ResizeObserver(this._onResize.bind(this));
      this._resizeObserver.observe(this.container);

      // Measure items after render
      this._mutationObserver = new MutationObserver(this._onMutation.bind(this));
      this._mutationObserver.observe(this.itemsEl, { childList: true, subtree: true });
    },

    /**
     * Set items and re-render
     * @param {Array} items - Array of data items
     */
    setItems: function(items) {
      this.items = items || [];
      this._calculatePositions();
      this._updateContentHeight();
      this._render();
    },

    /**
     * Get current items
     */
    getItems: function() {
      return this.items;
    },

    /**
     * Scroll to a specific item by index
     * @param {number} index - Item index
     * @param {string} [align] - 'start', 'center', 'end', or 'auto'
     */
    scrollToIndex: function(index, align) {
      if (index < 0 || index >= this.items.length) return;
      
      align = align || 'auto';
      var pos = this._getItemPosition(index);
      var height = this._getItemHeight(index);
      var containerHeight = this.scrollContainer.clientHeight;

      var targetTop;
      if (align === 'start') {
        targetTop = pos;
      } else if (align === 'center') {
        targetTop = pos - (containerHeight / 2) + (height / 2);
      } else if (align === 'end') {
        targetTop = pos - containerHeight + height;
      } else {
        // auto: ensure visible
        var visibleTop = this.scrollTop;
        var visibleBottom = this.scrollTop + containerHeight;
        if (pos < visibleTop) {
          targetTop = pos;
        } else if (pos + height > visibleBottom) {
          targetTop = pos - containerHeight + height;
        } else {
          return; // Already visible
        }
      }

      this.scrollContainer.scrollTop = Math.max(0, targetTop);
    },

    /**
     * Scroll to a specific item by key
     * @param {string|number} key - Item key
     * @param {string} [align] - Alignment
     */
    scrollToKey: function(key, align) {
      for (var i = 0; i < this.items.length; i++) {
        if (this.getItemKey(this.items[i], i) === key) {
          this.scrollToIndex(i, align);
          return;
        }
      }
    },

    /**
     * Get the currently visible range
     */
    getVisibleRange: function() {
      return {
        start: this.visibleRange.start,
        end: this.visibleRange.end,
        totalCount: this.items.length
      };
    },

    /**
     * Force a re-render (e.g., after data change)
     */
    refresh: function() {
      this._calculatePositions();
      this._updateContentHeight();
      this._render();
    },

    /**
     * Clean up and remove event listeners
     */
    destroy: function() {
      if (this._scrollHandler) {
        this.scrollContainer.removeEventListener('scroll', this._scrollHandler);
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
      if (this._mutationObserver) {
        this._mutationObserver.disconnect();
      }
      this.container.innerHTML = '';
    },

    // =========================================
    // Private methods
    // =========================================

    _onScroll: function() {
      this.scrollTop = this.scrollContainer.scrollTop;
      this._render();
    },

    _onResize: function() {
      this._render();
    },

    _onMutation: function(mutations) {
      var self = this;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && node.dataset && node.dataset.virtualKey) {
              self._measureItem(node);
            }
          });
        }
      });
    },

    _measureItem: function(el) {
      var key = el.dataset.virtualKey;
      if (!key) return;

      var measuredHeight = el.offsetHeight;
      var previousHeight = this.measuredHeights.get(key);

      if (previousHeight !== measuredHeight) {
        this.measuredHeights.set(key, measuredHeight);
        // Recalculate positions if height changed significantly
        if (Math.abs((previousHeight || this.itemHeight) - measuredHeight) > 5) {
          this._calculatePositions();
          this._updateContentHeight();
        }
      }
    },

    _calculatePositions: function() {
      this.positions = [];
      var offset = 0;

      for (var i = 0; i < this.items.length; i++) {
        this.positions.push(offset);
        var key = this.getItemKey(this.items[i], i);
        var height = this.measuredHeights.get(key) || this.itemHeight;
        offset += height;
      }
    },

    _getItemPosition: function(index) {
      return this.positions[index] || 0;
    },

    _getItemHeight: function(index) {
      if (index >= this.items.length) return this.itemHeight;
      var key = this.getItemKey(this.items[index], index);
      return this.measuredHeights.get(key) || this.itemHeight;
    },

    _getTotalHeight: function() {
      if (this.items.length === 0) return 0;
      var lastIdx = this.items.length - 1;
      return this._getItemPosition(lastIdx) + this._getItemHeight(lastIdx);
    },

    _updateContentHeight: function() {
      var totalHeight = this._getTotalHeight();
      this.contentEl.style.height = totalHeight + 'px';
    },

    _findStartIndex: function() {
      var scrollTop = this.scrollTop;
      var low = 0;
      var high = this.items.length - 1;

      // Binary search for first visible item
      while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var pos = this._getItemPosition(mid);
        var height = this._getItemHeight(mid);

        if (pos + height < scrollTop) {
          low = mid + 1;
        } else if (pos > scrollTop) {
          high = mid - 1;
        } else {
          low = mid;
          break;
        }
      }

      // Apply overscan
      return Math.max(0, low - this.overscan);
    },

    _findEndIndex: function(startIndex) {
      var viewportBottom = this.scrollTop + this.scrollContainer.clientHeight;
      var index = startIndex;
      var pos = this._getItemPosition(startIndex);

      while (index < this.items.length && pos < viewportBottom) {
        pos += this._getItemHeight(index);
        index++;
      }

      // Apply overscan
      return Math.min(this.items.length - 1, index + this.overscan);
    },

    _render: function() {
      if (this.items.length === 0) {
        this.itemsEl.innerHTML = '';
        return;
      }

      var startIndex = this._findStartIndex();
      var endIndex = this._findEndIndex(startIndex);

      // Check if range changed
      var rangeChanged = startIndex !== this.visibleRange.start || endIndex !== this.visibleRange.end;
      this.visibleRange = { start: startIndex, end: endIndex };

      // Render only visible items
      var fragment = document.createDocumentFragment();
      var offsetY = this._getItemPosition(startIndex);

      for (var i = startIndex; i <= endIndex; i++) {
        var item = this.items[i];
        var key = this.getItemKey(item, i);
        
        var el = this.renderItem(item, i);
        el.dataset.virtualKey = key;
        el.dataset.virtualIndex = i;
        el.style.position = 'absolute';
        el.style.top = (this._getItemPosition(i) - offsetY) + 'px';
        el.style.left = '0';
        el.style.right = '0';
        
        // Accessibility
        el.setAttribute('role', 'listitem');
        el.setAttribute('aria-setsize', this.items.length);
        el.setAttribute('aria-posinset', i + 1);
        
        // Event handlers
        if (this.onItemClick) {
          (function(item, index) {
            el.addEventListener('click', function(e) {
              this.onItemClick(e, item, index);
            }.bind(this));
          }.bind(this))(item, i);
        }
        
        if (this.onItemKeyDown) {
          (function(item, index) {
            el.addEventListener('keydown', function(e) {
              this.onItemKeyDown(e, item, index);
            }.bind(this));
          }.bind(this))(item, i);
        }

        fragment.appendChild(el);
      }

      // Position the items container
      this.itemsEl.style.top = offsetY + 'px';
      this.itemsEl.innerHTML = '';
      this.itemsEl.appendChild(fragment);
    }
  };

  // Expose globally
  window.VirtualList = VirtualList;

})();
