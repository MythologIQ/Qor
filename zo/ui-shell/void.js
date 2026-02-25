/**
 * Void UI Component - Phase 13 Enhanced
 *
 * Manages the creative capture interface with negotiation prompts.
 * Features: Auto-save, STT feedback, tag autocomplete, inline editing.
 */
(function() {
  'use strict';

  // Constants
  var SILENCE_THRESHOLD_MS = 5000;
  var MIN_THOUGHTS_FOR_OFFER = 3;
  var STORAGE_KEY = 'zoqore_void_session';
  var AUTOSAVE_DELAY_MS = 500;
  var TAG_AUTOCOMPLETE_DELAY_MS = 150;

  // State
  var sessionId = null;
  var mode = 'genesis';
  var state = 'idle';
  var thoughtCount = 0;
  var silenceTimer = null;
  var readyForReveal = false;
  var autosaveTimer = null;
  var tagAutocompleteTimer = null;
  var thoughts = [];
  var existingTags = [];
  var currentTags = [];
  var isEditing = null;

  // DOM Elements
  var container = null;
  var textarea = null;
  var promptEl = null;
  var promptTextEl = null;
  var offerEl = null;
  var countEl = null;
  var micBtn = null;
  var interimPreview = null;
  var saveIndicator = null;
  var tagInput = null;
  var tagSuggestions = null;
  var tagChips = null;
  var thoughtList = null;
  var thoughtListToggle = null;
  var sttPanel = null;
  var sttWaveform = null;
  var sttConfidence = null;

  // Calibrated questions for early silence
  var CALIBRATED_QUESTIONS = [
    'What else is rattling around?',
    "What's on your mind?",
    'What else feels important here?',
    'What would make this clearer?'
  ];

  // Soft offers for when structure is forming
  var SOFT_OFFERS = [
    "I'm seeing some shape here. Want to take a look?",
    'Some themes are emerging. Shall we peek?',
    'Structure is forming. Ready to see it?'
  ];

  // ==========================================
  // AUTO-SAVE FUNCTIONALITY
  // ==========================================

  function initAutoSave() {
    if (!textarea) return;
    
    textarea.addEventListener('input', function() {
      handleInput();
      scheduleAutoSave();
    });
  }

  function scheduleAutoSave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    
    var content = textarea.value.trim();
    if (!content) {
      hideSaveIndicator();
      return;
    }

    showSaveIndicator('waiting');
    autosaveTimer = setTimeout(function() {
      performAutoSave();
    }, AUTOSAVE_DELAY_MS);
  }

  function performAutoSave() {
    var content = textarea.value.trim();
    if (!content) {
      hideSaveIndicator();
      return;
    }

    showSaveIndicator('saving');
    
    submitThoughtAsDraft(content).then(function(success) {
      if (success) {
        showSaveIndicator('saved');
        setTimeout(hideSaveIndicator, 2000);
      } else {
        showSaveIndicator('error');
        setTimeout(function() { scheduleAutoSave(); }, 3000);
      }
    });
  }

  function submitThoughtAsDraft(content) {
    return new Promise(function(resolve) {
      if (typeof PlanningClient !== 'undefined') {
        PlanningClient.addThought(content, 'text', 'user', currentTags.slice())
          .then(function(thought) {
            thoughtCount++;
            thoughts.unshift(thought);
            updateThoughtCount();
            renderThoughtList();
            textarea.value = '';
            clearTags();
            resetSilenceTimer();
            resolve(true);
          })
          .catch(function() {
            resolve(false);
          });
      } else {
        // Fallback: local save
        var thought = {
          thoughtId: 'thought_' + Date.now().toString(36),
          projectId: getProjectId(),
          content: content,
          source: 'text',
          capturedAt: new Date().toISOString(),
          capturedBy: 'user',
          tags: currentTags.slice(),
          status: 'raw'
        };
        thoughts.unshift(thought);
        thoughtCount++;
        updateThoughtCount();
        renderThoughtList();
        textarea.value = '';
        clearTags();
        resolve(true);
      }
    });
  }

  function showSaveIndicator(status) {
    if (!saveIndicator) return;
    
    var messages = {
      'waiting': '<span class="autosave-dot waiting"></span> Typing...',
      'saving': '<span class="spinner spinner--sm"></span> Saving...',
      'saved': '<span class="autosave-check">✓</span> Saved',
      'error': '<span class="autosave-error">⚠</span> Save failed'
    };
    
    saveIndicator.innerHTML = messages[status] || '';
    saveIndicator.className = 'void-autosave-indicator ' + status;
    saveIndicator.style.display = 'flex';
  }

  function hideSaveIndicator() {
    if (saveIndicator) {
      saveIndicator.style.display = 'none';
    }
  }

  // ==========================================
  // TAG INPUT WITH AUTOCOMPLETE
  // ==========================================

  function initTagInput() {
    if (!tagInput) return;
    
    // Load existing tags from project
    loadExistingTags();
    
    tagInput.addEventListener('input', handleTagInput);
    tagInput.addEventListener('keydown', handleTagKeydown);
    tagInput.addEventListener('focus', function() {
      if (tagInput.value) showTagSuggestions([]);
    });
    
    // Close suggestions on outside click
    document.addEventListener('click', function(e) {
      if (tagSuggestions && !tagSuggestions.contains(e.target) && e.target !== tagInput) {
        hideTagSuggestions();
      }
    });
  }

  function loadExistingTags() {
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.getThoughts()
        .then(function(thoughts) {
          var tagSet = new Set();
          thoughts.forEach(function(t) {
            if (t.tags) t.tags.forEach(function(tag) { tagSet.add(tag); });
          });
          existingTags = Array.from(tagSet);
        })
        .catch(function() {
          existingTags = [];
        });
    }
  }

  function handleTagInput() {
    var value = tagInput.value.trim();
    
    if (tagAutocompleteTimer) clearTimeout(tagAutocompleteTimer);
    
    if (!value) {
      hideTagSuggestions();
      return;
    }
    
    tagAutocompleteTimer = setTimeout(function() {
      var filtered = existingTags.filter(function(tag) {
        return tag.toLowerCase().indexOf(value.toLowerCase()) !== -1;
      });
      showTagSuggestions(filtered);
    }, TAG_AUTOCOMPLETE_DELAY_MS);
  }

  function handleTagKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput.value.trim());
    } else if (e.key === 'Backspace' && !tagInput.value && currentTags.length > 0) {
      removeTag(currentTags.length - 1);
    } else if (e.key === 'ArrowDown' && tagSuggestions) {
      var first = tagSuggestions.querySelector('.tag-suggestion');
      if (first) first.focus();
    }
  }

  function addTag(tag) {
    if (!tag || currentTags.indexOf(tag) !== -1) return;
    
    currentTags.push(tag);
    renderTagChips();
    tagInput.value = '';
    hideTagSuggestions();
    
    // Add to existing tags if new
    if (existingTags.indexOf(tag) === -1) {
      existingTags.push(tag);
    }
  }

  function removeTag(index) {
    currentTags.splice(index, 1);
    renderTagChips();
  }

  function clearTags() {
    currentTags = [];
    renderTagChips();
  }

  function renderTagChips() {
    if (!tagChips) return;
    
    tagChips.innerHTML = currentTags.map(function(tag, index) {
      return '<span class="tag-chip" data-index="' + index + '">' +
        escapeHtml(tag) +
        '<button class="tag-chip-remove" aria-label="Remove tag">×</button>' +
        '</span>';
    }).join('');
    
    // Add remove handlers
    var removeBtns = tagChips.querySelectorAll('.tag-chip-remove');
    for (var i = 0; i < removeBtns.length; i++) {
      removeBtns[i].addEventListener('click', function(e) {
        var chip = e.target.closest('.tag-chip');
        if (chip) removeTag(parseInt(chip.dataset.index));
      });
    }
  }

  function showTagSuggestions(suggestions) {
    if (!tagSuggestions) return;
    
    var html = suggestions.map(function(tag) {
      return '<button class="tag-suggestion" data-tag="' + escapeHtml(tag) + '">' +
        escapeHtml(tag) + '</button>';
    }).join('');
    
    // Also show "Create new" option
    var value = tagInput.value.trim();
    if (value && suggestions.indexOf(value) === -1) {
      html = '<button class="tag-suggestion tag-suggestion-new" data-tag="' + escapeHtml(value) + '">' +
        'Create "' + escapeHtml(value) + '"</button>' + html;
    }
    
    if (!html) {
      hideTagSuggestions();
      return;
    }
    
    tagSuggestions.innerHTML = html;
    tagSuggestions.style.display = 'block';
    
    // Add click handlers
    var btns = tagSuggestions.querySelectorAll('.tag-suggestion');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function(e) {
        addTag(e.target.dataset.tag);
      });
    }
  }

  function hideTagSuggestions() {
    if (tagSuggestions) {
      tagSuggestions.style.display = 'none';
    }
  }

  // ==========================================
  // THOUGHT LIST WITH INLINE EDITING
  // ==========================================

  function initThoughtList() {
    if (!thoughtListToggle) return;
    
    thoughtListToggle.addEventListener('click', toggleThoughtList);
    
    // Load existing thoughts
    loadThoughts();
  }

  function loadThoughts() {
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.getThoughts()
        .then(function(data) {
          thoughts = data;
          thoughtCount = thoughts.length;
          updateThoughtCount();
          renderThoughtList();
        })
        .catch(function() {
          thoughts = [];
        });
    }
  }

  function toggleThoughtList() {
    if (!thoughtList) return;
    
    var isExpanded = thoughtList.classList.toggle('void-thought-list--expanded');
    thoughtListToggle.setAttribute('aria-expanded', isExpanded);
    
    if (isExpanded) {
      renderThoughtList();
    }
  }

  function renderThoughtList() {
    if (!thoughtList) return;
    
    if (thoughts.length === 0) {
      thoughtList.innerHTML = '<div class="void-thought-empty">' +
        '<span class="void-thought-empty-icon">💡</span>' +
        '<span class="void-thought-empty-text">No thoughts captured yet</span>' +
        '</div>';
      return;
    }
    
    thoughtList.innerHTML = thoughts.map(function(thought, index) {
      var sourceIcon = thought.source === 'voice' ? '🎤' : '⌨️';
      var isEditingThis = isEditing === thought.thoughtId;
      
      return '<div class="void-thought-item' + (isEditingThis ? ' void-thought-item--editing' : '') + '" data-thought-id="' + thought.thoughtId + '">' +
        '<div class="void-thought-header">' +
          '<span class="void-thought-source" title="' + (thought.source === 'voice' ? 'Voice capture' : 'Text capture') + '">' + sourceIcon + '</span>' +
          '<span class="void-thought-time">' + formatTimeAgo(thought.capturedAt) + '</span>' +
          '<div class="void-thought-actions">' +
            '<button class="void-thought-edit" title="Edit">✏️</button>' +
            '<button class="void-thought-delete" title="Delete">🗑️</button>' +
          '</div>' +
        '</div>' +
        (isEditingThis
          ? '<textarea class="void-thought-edit-input">' + escapeHtml(thought.content) + '</textarea>' +
            '<div class="void-thought-edit-actions">' +
              '<button class="btn btn--sm btn--secondary void-thought-cancel">Cancel</button>' +
              '<button class="btn btn--sm btn--primary void-thought-save">Save</button>' +
            '</div>'
          : '<div class="void-thought-content">' + escapeHtml(thought.content) + '</div>') +
        (thought.tags && thought.tags.length > 0
          ? '<div class="void-thought-tags">' +
              thought.tags.map(function(tag) { return '<span class="void-thought-tag">' + escapeHtml(tag) + '</span>'; }).join('') +
            '</div>'
          : '') +
      '</div>';
    }).join('');
    
    // Attach event handlers
    attachThoughtListHandlers();
  }

  function attachThoughtListHandlers() {
    if (!thoughtList) return;
    
    // Edit buttons
    var editBtns = thoughtList.querySelectorAll('.void-thought-edit');
    for (var i = 0; i < editBtns.length; i++) {
      editBtns[i].addEventListener('click', function(e) {
        var item = e.target.closest('.void-thought-item');
        if (item) startEditThought(item.dataset.thoughtId);
      });
    }
    
    // Delete buttons
    var deleteBtns = thoughtList.querySelectorAll('.void-thought-delete');
    for (var i = 0; i < deleteBtns.length; i++) {
      deleteBtns[i].addEventListener('click', function(e) {
        var item = e.target.closest('.void-thought-item');
        if (item) confirmDeleteThought(item.dataset.thoughtId);
      });
    }
    
    // Save buttons
    var saveBtns = thoughtList.querySelectorAll('.void-thought-save');
    for (var i = 0; i < saveBtns.length; i++) {
      saveBtns[i].addEventListener('click', function(e) {
        var item = e.target.closest('.void-thought-item');
        if (item) saveEditThought(item.dataset.thoughtId);
      });
    }
    
    // Cancel buttons
    var cancelBtns = thoughtList.querySelectorAll('.void-thought-cancel');
    for (var i = 0; i < cancelBtns.length; i++) {
      cancelBtns[i].addEventListener('click', function() {
        cancelEditThought();
      });
    }
  }

  function startEditThought(thoughtId) {
    isEditing = thoughtId;
    renderThoughtList();
    
    // Focus the textarea
    var item = thoughtList.querySelector('[data-thought-id="' + thoughtId + '"]');
    if (item) {
      var textarea = item.querySelector('.void-thought-edit-input');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }
  }

  function saveEditThought(thoughtId) {
    var item = thoughtList.querySelector('[data-thought-id="' + thoughtId + '"]');
    if (!item) return;
    
    var textarea = item.querySelector('.void-thought-edit-input');
    if (!textarea) return;
    
    var newContent = textarea.value.trim();
    if (!newContent) return;
    
    // Find and update the thought
    for (var i = 0; i < thoughts.length; i++) {
      if (thoughts[i].thoughtId === thoughtId) {
        thoughts[i].content = newContent;
        break;
      }
    }
    
    // TODO: Persist to API when available
    isEditing = null;
    renderThoughtList();
    
    if (typeof toast !== 'undefined') {
      toast.success('Thought updated');
    }
  }

  function cancelEditThought() {
    isEditing = null;
    renderThoughtList();
  }

  function confirmDeleteThought(thoughtId) {
    if (typeof modal !== 'undefined') {
      modal.confirm('Delete this thought?', {
        title: 'Confirm Delete',
        confirmLabel: 'Delete',
        confirmVariant: 'danger'
      }).then(function(confirmed) {
        if (confirmed) deleteThought(thoughtId);
      });
    } else {
      if (confirm('Delete this thought?')) {
        deleteThought(thoughtId);
      }
    }
  }

  function deleteThought(thoughtId) {
    thoughts = thoughts.filter(function(t) { return t.thoughtId !== thoughtId; });
    thoughtCount = thoughts.length;
    updateThoughtCount();
    renderThoughtList();
    
    // TODO: Call API to delete
    
    if (typeof toast !== 'undefined') {
      toast.success('Thought deleted');
    }
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

  // ==========================================
  // ENHANCED STT FEEDBACK
  // ==========================================

  function initSTTFeedback() {
    if (!sttPanel) return;
    
    // Create waveform visualization
    if (window.AudioContext || window.webkitAudioContext) {
      createWaveformVisualization();
    }
  }

  function createWaveformVisualization() {
    if (!sttWaveform) return;
    
    var bars = 5;
    sttWaveform.innerHTML = '';
    for (var i = 0; i < bars; i++) {
      var bar = document.createElement('div');
      bar.className = 'stt-waveform-bar';
      bar.style.animationDelay = (i * 0.1) + 's';
      sttWaveform.appendChild(bar);
    }
  }

  function showSTTPanel() {
    if (sttPanel) {
      sttPanel.classList.add('stt-panel--active');
    }
  }

  function hideSTTPanel() {
    if (sttPanel) {
      sttPanel.classList.remove('stt-panel--active');
    }
  }

  function updateSTTConfidence(confidence) {
    if (!sttConfidence) return;
    
    var percentage = Math.round(confidence * 100);
    sttConfidence.style.width = percentage + '%';
    sttConfidence.className = 'stt-confidence-bar' +
      (confidence > 0.8 ? ' stt-confidence--high' :
       confidence > 0.5 ? ' stt-confidence--medium' : ' stt-confidence--low');
  }

  // ==========================================
  // INTEGRITY INDICATOR
  // ==========================================

  function updateIntegrityIndicator() {
    var indicator = document.getElementById('integrity-indicator');
    if (!indicator) return;
    
    var projectId = typeof PlanningClient !== 'undefined' ? PlanningClient.getCurrentProjectId() : 'default-project';
    
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.checkIntegrity(projectId)
        .then(function(result) {
          var dot = indicator.querySelector('.integrity-dot');
          var tooltip = indicator.querySelector('.integrity-tooltip');
          if (dot) {
            dot.className = 'integrity-dot ' + (result.valid ? 'valid' : 'invalid');
          }
          if (tooltip && result.lastChecked) {
            tooltip.textContent = 'Integrity: ' + (result.valid ? 'Valid' : 'Invalid') + ' • Checked: ' + new Date(result.lastChecked).toLocaleTimeString();
          }
        })
        .catch(function() {
          var dot = indicator.querySelector('.integrity-dot');
          if (dot) dot.className = 'integrity-dot unknown';
        });
    }
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  // Initialize
  function init() {
    container = document.getElementById('void-container');
    if (!container) return;

    textarea = container.querySelector('.void-textarea');
    promptEl = container.querySelector('.void-prompt');
    promptTextEl = container.querySelector('.void-prompt-text');
    offerEl = container.querySelector('.void-offer');
    countEl = container.querySelector('.void-thought-count');
    micBtn = container.querySelector('.void-mic-btn');
    interimPreview = container.querySelector('.void-interim-preview');
    
    // New Phase 13 elements
    saveIndicator = container.querySelector('.void-autosave-indicator');
    tagInput = container.querySelector('.void-tag-input');
    tagSuggestions = container.querySelector('.void-tag-suggestions');
    tagChips = container.querySelector('.void-tag-chips');
    thoughtList = container.querySelector('.void-thought-list');
    thoughtListToggle = container.querySelector('.void-thought-list-toggle');
    sttPanel = container.querySelector('.stt-panel');
    sttWaveform = container.querySelector('.stt-waveform');
    sttConfidence = container.querySelector('.stt-confidence-bar');

    // Create missing elements if needed
    ensureUIElements();

    // Add integrity indicator if not present
    if (!document.getElementById('integrity-indicator')) {
      var indicator = document.createElement('div');
      indicator.id = 'integrity-indicator';
      indicator.className = 'integrity-indicator';
      indicator.innerHTML = '<span class="integrity-dot"></span><span class="integrity-tooltip">Checking integrity...</span>';
      indicator.style.cssText = 'position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 6px; cursor: help; z-index: 100;';
      var dot = indicator.querySelector('.integrity-dot');
      dot.style.cssText = 'width: 10px; height: 10px; border-radius: 50%; background: #64748b; transition: background 0.3s;';
      dot.className = 'integrity-dot checking';
      var tooltip = indicator.querySelector('.integrity-tooltip');
      tooltip.style.cssText = 'font-size: 11px; color: #94a3b8; white-space: nowrap;';
      container.style.position = 'relative';
      container.appendChild(indicator);
    }

    bindEvents();
    checkSavedSession();
    
    // Initialize Phase 13 features
    initAutoSave();
    initTagInput();
    initThoughtList();
    initSTTFeedback();
    initSTT();
    
    // Initialize integrity indicator
    updateIntegrityIndicator();
    setInterval(updateIntegrityIndicator, 60000); // Check every minute

    window.addEventListener('genesis:event', function(e) {
      if (e.detail && e.detail.type === 'ready_for_reveal') showOffer();
    });

    // Brainstorm Recording Controls
    initBrainstormRecording();
  }

  function ensureUIElements() {
    // Create auto-save indicator if missing
    if (!saveIndicator && textarea) {
      saveIndicator = document.createElement('div');
      saveIndicator.className = 'void-autosave-indicator';
      saveIndicator.style.cssText = 'display: none; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--color-muted); position: absolute; bottom: 8px; right: 8px;';
      textarea.parentElement.style.position = 'relative';
      textarea.parentElement.appendChild(saveIndicator);
    }
    
    // Create tag input section if missing
    if (!tagInput && textarea) {
      var tagSection = document.createElement('div');
      tagSection.className = 'void-tag-section';
      tagSection.innerHTML = 
        '<div class="void-tag-chips"></div>' +
        '<input type="text" class="void-tag-input form-field__input" placeholder="Add tags (comma separated)">' +
        '<div class="void-tag-suggestions" style="display: none;"></div>';
      textarea.parentElement.insertBefore(tagSection, textarea.nextSibling);
      
      tagChips = tagSection.querySelector('.void-tag-chips');
      tagInput = tagSection.querySelector('.void-tag-input');
      tagSuggestions = tagSection.querySelector('.void-tag-suggestions');
    }
    
    // Create thought list if missing
    if (!thoughtList && container) {
      var listSection = document.createElement('div');
      listSection.className = 'void-thought-list-section';
      listSection.innerHTML = 
        '<button class="void-thought-list-toggle btn btn--ghost" aria-expanded="false">' +
          '<span class="void-thought-list-icon">📝</span>' +
          '<span class="void-thought-count">0 thoughts</span>' +
          '<span class="void-thought-list-chevron">▼</span>' +
        '</button>' +
        '<div class="void-thought-list"></div>';
      
      // Insert after the input area
      var inputArea = container.querySelector('.brainstorm-input-area') || container.querySelector('.void-input-area');
      if (inputArea) {
        inputArea.parentElement.insertBefore(listSection, inputArea.nextSibling);
      } else {
        container.appendChild(listSection);
      }
      
      thoughtListToggle = listSection.querySelector('.void-thought-list-toggle');
      thoughtList = listSection.querySelector('.void-thought-list');
      countEl = listSection.querySelector('.void-thought-count');
    }
    
    // Create STT panel if missing
    if (!sttPanel && micBtn) {
      sttPanel = document.createElement('div');
      sttPanel.className = 'stt-panel';
      sttPanel.innerHTML = 
        '<div class="stt-waveform"></div>' +
        '<div class="stt-confidence">' +
          '<div class="stt-confidence-bar"></div>' +
        '</div>' +
        '<div class="stt-status">Listening...</div>';
      micBtn.parentElement.insertBefore(sttPanel, micBtn.nextSibling);
      
      sttWaveform = sttPanel.querySelector('.stt-waveform');
      sttConfidence = sttPanel.querySelector('.stt-confidence-bar');
      createWaveformVisualization();
    }
  }

  function bindEvents() {
    if (!textarea) return;

    textarea.addEventListener('keydown', handleKeydown);
    textarea.addEventListener('input', handleInput);

    // Mode toggle
    var modeBtns = container.querySelectorAll('.void-mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', handleModeClick);
    }

    // Prompt dismiss
    var dismissBtn = container.querySelector('.void-prompt-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismissPrompt);
    }

    // Offer buttons
    var acceptBtn = container.querySelector('.void-offer-accept');
    var declineBtn = container.querySelector('.void-offer-decline');
    if (acceptBtn) acceptBtn.addEventListener('click', acceptReveal);
    if (declineBtn) declineBtn.addEventListener('click', declineOffer);
  }

  function handleModeClick(e) {
    var newMode = e.target.dataset.mode;
    if (newMode) setMode(newMode);
  }

  function handleKeydown(e) {
    // Enter submits, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Cancel auto-save and submit immediately
      if (autosaveTimer) clearTimeout(autosaveTimer);
      submitThought();
    }
  }

  function handleInput() {
    resetSilenceTimer();
    hidePrompt();
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(handleSilence, SILENCE_THRESHOLD_MS);
  }

  function handleSilence() {
    if (state !== 'capturing') return;
    if (readyForReveal) return;

    var isEarly = thoughtCount < MIN_THOUGHTS_FOR_OFFER;

    if (isEarly) {
      showPrompt(randomFrom(CALIBRATED_QUESTIONS));
    } else {
      checkCompleteness();
    }

    resetSilenceTimer();
  }

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function checkCompleteness() {
    // New API: check if there are enough thoughts
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.getThoughts()
        .then(function(thoughtsData) {
          thoughtCount = thoughtsData.length;
          if (thoughtCount >= MIN_THOUGHTS_FOR_OFFER) {
            showOffer();
          } else {
            showPrompt(randomFrom(CALIBRATED_QUESTIONS));
          }
          updateThoughtCount();
        })
        .catch(function() {
          showPrompt(randomFrom(CALIBRATED_QUESTIONS));
        });
    } else {
      // Fallback: use local state
      if (thoughtCount >= MIN_THOUGHTS_FOR_OFFER) {
        showOffer();
      } else {
        showPrompt(randomFrom(CALIBRATED_QUESTIONS));
      }
    }
  }

  function submitThought() {
    var content = textarea.value.trim();
    if (!content) return;

    // Use PlanningClient if available, otherwise fallback
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.addThought(content, 'text', 'user', currentTags.slice())
        .then(function(thought) {
          thoughtCount++;
          thoughts.unshift(thought);
          updateThoughtCount();
          renderThoughtList();
          textarea.value = '';
          clearTags();
          hidePrompt();
          resetSilenceTimer();
        })
        .catch(function() {
          // Silently handle errors
        });
    } else {
      // Fallback: just increment local count
      var thought = {
        thoughtId: 'thought_' + Date.now().toString(36),
        projectId: getProjectId(),
        content: content,
        source: 'text',
        capturedAt: new Date().toISOString(),
        capturedBy: 'user',
        tags: currentTags.slice(),
        status: 'raw'
      };
      thoughts.unshift(thought);
      thoughtCount++;
      updateThoughtCount();
      renderThoughtList();
      textarea.value = '';
      clearTags();
      hidePrompt();
      resetSilenceTimer();
    }
  }

  function startSession() {
    var projectId = getProjectId();

    return fetch('/api/void/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: projectId, mode: mode })
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Failed to start session');
      return resp.json();
    })
    .then(function(data) {
      sessionId = data.sessionId;
      state = 'capturing';
      saveSession();
    });
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: sessionId,
        projectId: getProjectId(),
        mode: mode
      }));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  function checkSavedSession() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        sessionId = data.sessionId;
        mode = data.mode || 'genesis';
        state = 'capturing';
        updateModeUI();
        loadThoughtCount();
      }
    } catch (e) {
      // Ignore
    }
  }

  function loadThoughtCount() {
    if (typeof PlanningClient !== 'undefined') {
      PlanningClient.getThoughts()
        .then(function(thoughtsData) {
          thoughts = thoughtsData;
          thoughtCount = thoughts.length;
          updateThoughtCount();
          renderThoughtList();
        })
        .catch(function() {
          // Ignore - use local count
        });
    }
    // If PlanningClient not available, use local thoughtCount
  }

  function setMode(newMode) {
    mode = newMode;
    updateModeUI();
    container.dataset.mode = newMode;
    saveSession();
  }

  function updateModeUI() {
    var modeBtns = container.querySelectorAll('.void-mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      var btn = modeBtns[i];
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  function showPrompt(text) {
    if (!promptEl || !promptTextEl) return;

    promptTextEl.textContent = text;
    promptEl.classList.add('visible');
  }

  function hidePrompt() {
    if (!promptEl) return;
    promptEl.classList.remove('visible');
  }

  function dismissPrompt() {
    hidePrompt();

    if (sessionId) {
      fetch('/api/void/prompt/dismiss', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      }).catch(function() {});
    }
  }

  function showOffer() {
    if (!offerEl) return;
    readyForReveal = true;
    offerEl.classList.add('visible');
  }

  function hideOffer() {
    if (!offerEl) return;
    offerEl.classList.remove('visible');
  }

  function acceptReveal() {
    hideOffer();
    state = 'revealing';

    fetch('/api/void/accept-reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId })
    })
    .then(function() {
      // Trigger reveal transition via custom event
      window.dispatchEvent(new CustomEvent('void:reveal', {
        detail: { sessionId: sessionId }
      }));
    })
    .catch(function() {});
  }

  function declineOffer() {
    hideOffer();
    readyForReveal = false;

    showPrompt('Got it. Keep going.');
    setTimeout(hidePrompt, 3000);

    if (sessionId) {
      fetch('/api/void/decline-offer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      }).catch(function() {});
    }
  }

  function updateThoughtCount() {
    if (countEl) {
      countEl.textContent = thoughtCount + ' thought' + (thoughtCount !== 1 ? 's' : '');
    }
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  // ==========================================
  // SPEECH-TO-TEXT INTEGRATION
  // ==========================================

  function initSTT() {
    if (!window.VoidSTT || !VoidSTT.isSupported()) {
      if (micBtn) micBtn.style.display = 'none';
      return;
    }

    VoidSTT.init();
    if (micBtn) micBtn.disabled = false;

    VoidSTT.onTranscript = function(text, isFinal, confidence) {
      if (isFinal) {
        textarea.value += (textarea.value ? ' ' : '') + text;
        // Use PlanningClient if available, otherwise fallback
        if (typeof PlanningClient !== 'undefined') {
          PlanningClient.addThought(text, 'voice', 'user', [])
            .then(function(thought) {
              thoughtCount++;
              thoughts.unshift(thought);
              updateThoughtCount();
              renderThoughtList();
              window.dispatchEvent(new CustomEvent('void:thought-added', { detail: { source: 'voice' } }));
            })
            .catch(function() {
              // Fallback to local increment
              thoughtCount++;
              updateThoughtCount();
            });
        } else {
          // Fallback: just increment local count
          var thought = {
            thoughtId: 'thought_' + Date.now().toString(36),
            projectId: getProjectId(),
            content: text,
            source: 'voice',
            capturedAt: new Date().toISOString(),
            capturedBy: 'user',
            tags: [],
            status: 'raw'
          };
          thoughts.unshift(thought);
          thoughtCount++;
          updateThoughtCount();
          renderThoughtList();
        }
        hideInterimPreview();
        hideSTTPanel();
      } else {
        showInterimPreview(text);
        showSTTPanel();
        if (confidence) updateSTTConfidence(confidence);
      }
    };

    VoidSTT.onError = function(error) {
      if (micBtn) micBtn.classList.add('void-mic-btn--error');
      hideSTTPanel();
      setTimeout(function() {
        if (micBtn) micBtn.classList.remove('void-mic-btn--error');
      }, 2000);
    };

    VoidSTT.onStateChange = function(isListening) {
      if (micBtn) {
        if (isListening) {
          micBtn.classList.add('void-mic-btn--listening');
          showSTTPanel();
        } else {
          micBtn.classList.remove('void-mic-btn--listening');
          hideInterimPreview();
          hideSTTPanel();
        }
      }
    };

    if (micBtn) {
      micBtn.addEventListener('click', function() {
        VoidSTT.toggle();
      });
    }
  }

  function showInterimPreview(text) {
    if (!interimPreview) return;
    interimPreview.textContent = text;
    interimPreview.classList.add('void-interim-preview--visible');
  }

  function hideInterimPreview() {
    if (!interimPreview) return;
    interimPreview.textContent = '';
    interimPreview.classList.remove('void-interim-preview--visible');
  }

  // ==========================================
  // BRAINSTORM RECORDING CONTROLS
  // ==========================================

  function initBrainstormRecording() {
    var recordBtn = document.getElementById('brainstorm-record-btn');
    var sendBtn = document.getElementById('brainstorm-send-btn');
    var timerEl = document.getElementById('brainstorm-rec-timer');
    var statusEl = document.getElementById('brainstorm-rec-status');
    if (!recordBtn) return;

    var recorder = null;
    var recChunks = [];
    var recBlob = null;
    var recStart = 0;
    var recInterval = null;

    function setStatus(msg, cls) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = 'brainstorm-rec-status' + (cls ? ' ' + cls : '');
    }

    function updateTimer() {
      if (!timerEl) return;
      var sec = Math.floor((Date.now() - recStart) / 1000);
      var m = String(Math.floor(sec / 60)).padStart(2, '0');
      var s = String(sec % 60).padStart(2, '0');
      timerEl.textContent = m + ':' + s;
    }

    function startRecording() {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        recChunks = [];
        recBlob = null;
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        recorder.ondataavailable = function(e) { if (e.data.size > 0) recChunks.push(e.data); };
        recorder.onstop = function() {
          stream.getTracks().forEach(function(t) { t.stop(); });
          recBlob = new Blob(recChunks, { type: 'audio/webm' });
          if (sendBtn) sendBtn.disabled = false;
          setStatus('Recording complete. Ready to send.', '');
        };
        recorder.start(250);
        recStart = Date.now();
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.brainstorm-rec-label').textContent = 'Stop';
        if (sendBtn) sendBtn.disabled = true;
        setStatus('Recording...', '');
        recInterval = setInterval(updateTimer, 250);
      }).catch(function(err) {
        console.error('[Brainstorm] Mic access denied:', err);
        setStatus('Microphone access denied. Check browser permissions.', 'error');
      });
    }

    function stopRecording() {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
      }
      clearInterval(recInterval);
      recordBtn.classList.remove('recording');
      recordBtn.querySelector('.brainstorm-rec-label').textContent = 'Record';
    }

    recordBtn.addEventListener('click', function() {
      if (recorder && recorder.state === 'recording') {
        stopRecording();
      } else {
        startRecording();
      }
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        if (!recBlob) return;
        var projectId = getProjectId();
        sendBtn.disabled = true;
        sendBtn.classList.add('sending');
        sendBtn.querySelector('.brainstorm-send-label').textContent = 'Sending…';
        setStatus('Uploading and transcribing…', '');

        var fd = new FormData();
        fd.append('audio', recBlob, 'brainstorm-' + Date.now() + '.webm');
        fd.append('projectId', projectId);
        fd.append('target', 'constellation');

        fetch('/api/projects/brainstorm/ingest', { method: 'POST', body: fd })
          .then(function(res) {
            if (!res.ok) throw new Error('Ingest failed (' + res.status + ')');
            return res.json();
          })
          .then(function(data) {
            recBlob = null;
            if (timerEl) timerEl.textContent = '';
            sendBtn.querySelector('.brainstorm-send-label').textContent = 'Send to Mind Map';
            sendBtn.classList.remove('sending');
            setStatus('Sent! Ideas are being woven into your mind map.', 'success');
            setTimeout(function() { setStatus('', ''); }, 4000);
            window.dispatchEvent(new CustomEvent('brainstorm:recording-ingested', {
              detail: { projectId: projectId, data: data }
            }));
          })
          .catch(function(err) {
            console.error('[Brainstorm] Send error:', err);
            sendBtn.querySelector('.brainstorm-send-label').textContent = 'Send to Mind Map';
            sendBtn.classList.remove('sending');
            sendBtn.disabled = false;
            setStatus('Failed to send recording. Try again.', 'error');
          });
      });
    }
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.ZoVoid = {
    getState: function() {
      return {
        sessionId: sessionId,
        mode: mode,
        state: state,
        thoughtCount: thoughtCount,
        readyForReveal: readyForReveal,
        thoughts: thoughts,
        tags: currentTags
      };
    },
    submitThought: submitThought,
    setMode: setMode,
    addTag: addTag,
    removeTag: removeTag
  };
})();
