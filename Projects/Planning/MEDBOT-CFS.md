

# Zo-Qore Accessibility Service Layer: Adaptive Sensory Governance for ME/CFS

## Understanding the Problem First

Before architecture, the people.

ME/CFS patients experience something standard accessibility frameworks don't model: **fluctuating, dynamic disability** where sensory tolerance changes hour to hour, day to day. A screen that was tolerable at 10am becomes physically painful by 2pm. A notification sound that was fine yesterday triggers a symptom crash today that lasts three days.

Standard WCAG compliance addresses **static** accessibility: "can a blind user navigate this?" That's necessary but radically insufficient here. What's needed is a system that asks:

> "Given what this specific person can tolerate *right now*, how should every pixel, every sound, every decision demand, and every interaction be mediated — and how should the system act autonomously when the person cannot engage at all?"

Zo-Qore's governance architecture — policy enforcement, risk evaluation, decision contracts, actor-aware auditing, Victor's adversarial review, and the autonomous action pipeline — maps to this problem with startling directness. The same machinery that asks "should this code deployment be allowed?" can ask "should this notification be delivered to this person right now?"

---

## The Core Abstraction: Capacity State

Everything flows from one concept: the user has a **Capacity State** that is dynamic, multidimensional, and governs what the system is allowed to present.

```typescript
interface CapacityState {
  capacityId: string;
  userId: string;
  timestamp: string;                    // ISO 8601
  source: 'self-report' | 'inferred' | 'caregiver' | 'scheduled';
  
  // Sensory dimensions — each 0.0 (no tolerance) to 1.0 (full tolerance)
  visual: {
    brightnessThreshold: number;        // max screen brightness tolerable
    contrastTolerance: number;          // how much contrast is comfortable
    motionTolerance: number;            // animation/transition tolerance
    colorSaturationLimit: number;       // how vivid colors can be
    informationDensity: number;         // how much can be on screen at once
    blueLight: number;                  // blue light tolerance
    screenDuration: number;             // minutes of screen time remaining today
  };
  
  auditory: {
    volumeThreshold: number;            // max volume tolerable
    frequencyRange: {                   // tolerable frequency band
      lowHz: number;
      highHz: number;
    };
    suddenSoundTolerance: number;       // tolerance for unexpected sounds
    continuousAudioDuration: number;    // minutes of audio tolerable
    notificationTolerance: number;      // can they handle alerts right now
  };
  
  cognitive: {
    decisionCapacity: number;           // how many decisions before fatigue
    complexityTolerance: number;        // information processing capacity
    memoryLoad: number;                 // how much can they hold in working memory
    contextSwitchCost: number;          // how expensive is changing tasks
    readingCapacity: number;            // text processing ability right now
    timePressTolerance: number;         // can they handle deadlines/countdowns
  };
  
  physical: {
    fineMotorCapacity: number;          // precision clicking/tapping ability
    typingCapacity: number;             // keystroke budget
    sessionDuration: number;            // total minutes they can engage
    interactionBudget: number;          // total interactions remaining today
  };
  
  // Overall energy envelope
  energyLevel: 'crisis' | 'very-low' | 'low' | 'moderate' | 'adequate';
  
  // What triggered this state assessment
  trigger: 'session-start' | 'periodic-check' | 'user-initiated' | 
           'symptom-report' | 'pattern-detected' | 'caregiver-update';
  
  // Hard boundaries that override everything
  hardLimits: {
    noScreenAfter?: string;             // time of day
    maxDailyScreenMinutes?: number;
    noAudioToday?: boolean;
    noNotifications?: boolean;
    emergencyContactOnly?: boolean;     // only allow critical communications
  };
}
```

This isn't a settings page. It's a **governance input** — the same way Zo-Qore's policy engine evaluates deployment risk, it evaluates whether a given interaction is safe for this person right now.

---

## Architectural Design

### Service Layer Position

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER SURFACE                               │
│  (Adaptive UI  ·  Voice Interface  ·  Caregiver Portal)          │
└──────────────┬───────────────────────────────────────┬───────────┘
               │                                       │
┌──────────────▼───────────────────────────────────────▼───────────┐
│              SENSORY GOVERNANCE SERVICE LAYER                     │
│                                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Capacity    │  │  Sensory     │  │  Interaction             │ │
│  │  State       │  │  Policy      │  │  Mediator                │ │
│  │  Manager     │  │  Engine      │  │  (every UI action        │ │
│  │              │  │              │  │   passes through here)   │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬──────────────┘ │
│         │                │                       │                 │
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌───────────▼──────────────┐ │
│  │  Pattern    │  │  Cognitive   │  │  Autonomous              │ │
│  │  Tracker    │  │  Load        │  │  Delegate                │ │
│  │  (symptom ↔ │  │  Manager     │  │  (acts when user         │ │
│  │   tech      │  │  (decision   │  │   cannot engage)         │ │
│  │   correlation│ │   budgeting) │  │                          │ │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘ │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Communication Mediator                                      │  │
│  │  (emails, messages, appointments — paced and adapted)        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────┬───────────────────────────────────────┬───────────┘
               │                                       │
┌──────────────▼───────────────────────────────────────▼───────────┐
│                    ZO-QORE GOVERNANCE RUNTIME                     │
│  Policy Engine · Risk Engine · Ledger · Victor · Decision Contracts│
└──────────────────────────────────────────────────────────────────┘
```

### How It Maps to Existing Zo-Qore Systems

| Zo-Qore System | ME/CFS Service Layer Use |
|---|---|
| **Policy Engine** | Enforces sensory policies: "no notification above 40dB when auditory.volumeThreshold < 0.3" — same evaluation pattern as deployment policies |
| **Risk Engine** | Evaluates interaction risk: "this action requires 4 decisions; user has 2 remaining cognitive capacity — HIGH RISK of post-exertional malaise" |
| **Decision Contracts** | Every UI render, notification delivery, and content presentation is a `DecisionRequest` evaluated against capacity state |
| **Ledger** | Append-only record of every interaction, capacity state change, symptom report — enables pattern discovery |
| **Victor** | Reviews interaction patterns for harm: "User has exceeded screen time 3 of last 5 days — Red Flag. Recommend enforced break." |
| **Autonomy Config** | Defines what the system can do without user input — reply to emails, reschedule appointments, manage queued tasks |
| **Planning Pipeline** | Breaks user goals into capacity-appropriate micro-tasks sized to current energy |
| **Integrity Checks** | Validates capacity state consistency — detects contradictions, ensures hard limits are never violated |

---

## The Six Service Components

### 1. Capacity State Manager

This is the system's understanding of what the user can tolerate right now.

**Input sources (least to most invasive):**

```
Scheduled patterns         User knows they crash after 2pm → encode as rule
  │
  ▼
Self-report check-ins      "How are you right now?" — minimal interaction
  │                         (single slider, emoji scale, or voice "I'm at a 3")
  ▼
Caregiver updates          Trusted person reports "they're having a bad day"
  │
  ▼
Behavioral inference       Interaction speed slowing, error rate increasing,
                           response times lengthening → system detects decline
  │
  ▼
Environmental sensors      (Future) ambient light, noise level, time of day,
                           weather/barometric pressure (known ME/CFS trigger)
```

**The check-in interaction itself must be governed by capacity:**

At `energyLevel: 'adequate'`:
```
┌──────────────────────────────┐
│  How are you doing?          │
│                              │
│  Visual: ████████░░ 80%      │
│  Sound:  ██████░░░░ 60%      │
│  Energy: ██████████ 100%     │
│  Focus:  ████████░░ 80%      │
│                              │
│  [Looks right]  [Adjust]     │
└──────────────────────────────┘
```

At `energyLevel: 'very-low'`:
```
┌──────────────────────────────┐
│                              │
│  Tap how you feel:           │
│                              │
│    😰    😕    😐    🙂      │
│                              │
└──────────────────────────────┘
```
(Large touch targets, no text to read, minimal brightness, auto-dismisses after 10 seconds with "I'll check later")

At `energyLevel: 'crisis'`:
No check-in at all. System uses last known state with decay toward maximum protection. Only a caregiver or scheduled recovery pattern can update state.

**Capacity State as a Governed Entity:**

```typescript
// Capacity mutations are DecisionRequests — the system governs itself
const capacityUpdate: DecisionRequest = {
  requestId: uuid(),
  actorId: 'capacity-state-manager',
  action: 'accessibility:capacity:update',
  targetPath: `user://${userId}/capacity`,
  context: {
    previousState: currentCapacity,
    proposedState: newCapacity,
    source: 'behavioral-inference',
    confidence: 0.7
  }
};

// Policy rules for capacity updates:
// - Inferred states cannot INCREASE tolerance (only self-report can)
// - Hard limits cannot be overridden by inference
// - Caregiver updates are logged but require user confirmation 
//   to REDUCE protection (preventing well-meaning override)
// - State changes produce ledger entries for pattern analysis
```

**Why this matters for ME/CFS specifically:** Patients report that "pushing through" sensory discomfort causes crashes that can last days or weeks. The system must err toward overprotection. A false negative (allowing an interaction that causes a crash) is far more costly than a false positive (blocking an interaction that would have been fine). The risk engine's asymmetric cost model handles this directly.

---

### 2. Sensory Policy Engine

Every element the user perceives passes through sensory policy evaluation. This extends Zo-Qore's existing policy engine with accessibility-specific rules.

**Visual Policies:**

```typescript
const SENSORY_VISUAL_POLICIES = [
  {
    id: 'sv-001',
    name: 'brightness-cap',
    description: 'Screen brightness cannot exceed user tolerance',
    scope: 'accessibility:visual:*',
    evaluate: (ctx) => {
      const maxBrightness = ctx.capacity.visual.brightnessThreshold;
      return {
        allowed: ctx.proposedBrightness <= maxBrightness,
        enforcement: 'block',
        adaptation: {
          // Don't just deny — adapt
          recommendedBrightness: maxBrightness * 0.8, // 20% safety margin
          cssFilter: `brightness(${maxBrightness})`,
          backgroundColor: brightnessToBackground(maxBrightness)
          // low brightness → dark mode with warm tones
          // very low → near-black with amber text
        }
      };
    }
  },
  {
    id: 'sv-002',
    name: 'motion-restriction',
    description: 'Animations disabled or reduced based on tolerance',
    scope: 'accessibility:visual:motion',
    evaluate: (ctx) => {
      if (ctx.capacity.visual.motionTolerance < 0.2) {
        return { animations: 'none', transitions: 'none' };
      }
      if (ctx.capacity.visual.motionTolerance < 0.5) {
        return { 
          animations: 'none', 
          transitions: 'opacity-only',  // no spatial movement
          transitionDuration: '500ms'   // slow, gentle
        };
      }
      if (ctx.capacity.visual.motionTolerance < 0.8) {
        return {
          animations: 'reduced',
          transitions: 'gentle',
          transitionDuration: '300ms'
        };
      }
      return { animations: 'full' };
    }
  },
  {
    id: 'sv-003',
    name: 'information-density-limit',
    description: 'Content visible at once limited by cognitive + visual capacity',
    scope: 'accessibility:visual:layout',
    evaluate: (ctx) => {
      const density = Math.min(
        ctx.capacity.visual.informationDensity,
        ctx.capacity.cognitive.complexityTolerance
      );
      
      if (density < 0.2) {
        // One thing at a time. Single card. Large text. Maximum whitespace.
        return {
          maxItemsVisible: 1,
          fontSize: '1.5rem',
          lineHeight: 2.0,
          padding: '3rem',
          hideSecondaryInfo: true,
          hideNavigation: true,  // show only current content
          simplifyToEssentials: true
        };
      }
      if (density < 0.5) {
        return {
          maxItemsVisible: 3,
          fontSize: '1.25rem',
          lineHeight: 1.8,
          padding: '2rem',
          hideSecondaryInfo: true
        };
      }
      // ... graduated levels
    }
  },
  {
    id: 'sv-004',
    name: 'color-adaptation',
    description: 'Color palette adjusted for visual sensitivity',
    scope: 'accessibility:visual:color',
    evaluate: (ctx) => {
      const saturation = ctx.capacity.visual.colorSaturationLimit;
      const blueLight = ctx.capacity.visual.blueLight;
      
      return {
        // CSS custom properties dynamically set
        '--color-saturation': `${saturation * 100}%`,
        '--blue-filter': blueLight < 0.3 ? 'sepia(60%) saturate(80%)' : 'none',
        '--background': blueLight < 0.5 
          ? 'hsl(30, 10%, 8%)'    // warm near-black
          : 'hsl(220, 10%, 12%)', // cool dark
        '--text-primary': blueLight < 0.3
          ? 'hsl(40, 30%, 75%)'   // warm amber text
          : 'hsl(0, 0%, 85%)',    // neutral light gray
        '--accent': saturation < 0.3
          ? 'hsl(30, 20%, 50%)'   // muted warm
          : 'hsl(200, 60%, 50%)' // standard accent
      };
    }
  },
  {
    id: 'sv-005',
    name: 'screen-time-enforcement',
    description: 'Enforce remaining screen time budget',
    scope: 'accessibility:session:*',
    evaluate: (ctx) => {
      const remaining = ctx.capacity.visual.screenDuration;
      const hardLimit = ctx.capacity.hardLimits.maxDailyScreenMinutes;
      const usedToday = ctx.sessionTracker.totalMinutesToday;
      
      if (hardLimit && usedToday >= hardLimit) {
        return {
          allowed: false,
          enforcement: 'block',
          message: 'Daily screen time reached. System will handle pending tasks.',
          handoffToAutonomous: true
        };
      }
      
      if (remaining < 10) {
        return {
          allowed: true,
          warning: 'approaching-limit',
          // Gentle visual indication — not alarming
          // Slowly warm the color temperature as time runs out
          adaptations: {
            urgencyMode: true,  // prioritize what's shown
            suggestWrapUp: true
          }
        };
      }
      
      return { allowed: true };
    }
  }
];
```

**Auditory Policies:**

```typescript
const SENSORY_AUDITORY_POLICIES = [
  {
    id: 'sa-001',
    name: 'volume-governance',
    scope: 'accessibility:audio:*',
    evaluate: (ctx) => {
      if (ctx.capacity.auditory.notificationTolerance < 0.1) {
        return { 
          audioAllowed: false, 
          notificationsAllowed: false,
          alternative: 'visual-gentle'  // soft glow, not flash
        };
      }
      return {
        maxVolume: ctx.capacity.auditory.volumeThreshold,
        // Normalize all audio to safe range
        compressor: {
          threshold: -20 * (1 - ctx.capacity.auditory.volumeThreshold),
          ratio: 4,          // compress dynamic range
          attack: 0.003,     // fast attack catches sudden sounds
          release: 0.25
        },
        // Filter frequencies outside tolerance
        bandpass: {
          low: ctx.capacity.auditory.frequencyRange.lowHz,
          high: ctx.capacity.auditory.frequencyRange.highHz
        }
      };
    }
  },
  {
    id: 'sa-002',
    name: 'no-sudden-sounds',
    scope: 'accessibility:audio:notification',
    evaluate: (ctx) => {
      if (ctx.capacity.auditory.suddenSoundTolerance < 0.3) {
        return {
          // Instead of playing a sound, fade in gently over 2 seconds
          fadeIn: 2000,
          maxVolume: ctx.capacity.auditory.volumeThreshold * 0.5,
          // Or replace audio notification entirely
          replaceWith: 'haptic'  // vibration if device supports
        };
      }
    }
  }
];
```

---

### 3. Cognitive Load Manager

ME/CFS cognitive dysfunction ("brain fog") means the system must actively manage how many decisions, how much information, and how much context the user is asked to process.

**Decision Budgeting:**

```typescript
interface CognitiveSession {
  userId: string;
  sessionStart: string;
  decisionsPresented: number;
  decisionsRemaining: number;    // from capacity state
  contextSwitches: number;
  informationUnitsPresented: number;
  
  // Tracks decision fatigue accumulation
  fatigueAccumulator: number;    // increases with each decision
  recoveryRate: number;          // decreases fatigue over idle time
}

class CognitiveLoadManager {
  
  // Before presenting any choice to the user
  async canPresentDecision(
    userId: string, 
    decision: ProposedDecision
  ): Promise<CognitiveGateResult> {
    
    const session = await this.getSession(userId);
    const capacity = await this.capacityManager.getCurrent(userId);
    
    const decisionCost = this.estimateDecisionCost(decision);
    // Simple binary choice = cost 1
    // Multiple choice = cost 2
    // Open-ended input = cost 3
    // Multi-step process = cost 4+
    
    if (session.decisionsRemaining < decisionCost) {
      return {
        allowed: false,
        alternative: this.suggestSimplification(decision),
        // "Instead of asking the user to choose, 
        //  use their established preferences"
        canAutoResolve: this.hasPreference(userId, decision.type),
        autoResolution: this.getPreference(userId, decision.type)
      };
    }
    
    if (session.fatigueAccumulator > capacity.cognitive.decisionCapacity * 0.8) {
      return {
        allowed: true,
        warning: 'cognitive-fatigue-approaching',
        suggestion: 'Consider wrapping up soon. I can handle the rest.',
        adaptations: {
          // Simplify remaining interactions
          reduceChoices: true,    // binary only
          provideDefaults: true,  // pre-select best option
          offerDelegation: true   // "Should I decide this?"
        }
      };
    }
    
    return { allowed: true };
  }
  
  // Simplify a complex decision into something the user can handle
  suggestSimplification(decision: ProposedDecision): SimplifiedDecision {
    // Complex: "How would you like to organize these 12 thoughts 
    //           into clusters?"
    // Simplified: "I grouped your thoughts into 3 topics. 
    //              Does this look right? [Yes] [No, let me adjust]"
    
    // Complex: "Configure your autonomy guardrails: 
    //           select enforcement levels for each rule"
    // Simplified: "I've set up safety rules based on your preferences.
    //              [Keep these] [I want to review one thing]"
    
    return {
      originalDecision: decision,
      simplifiedTo: 'binary-confirmation',
      preComputedAnswer: this.computeBestDefault(decision),
      userEffort: 'single-tap'
    };
  }
}
```

**Progressive Disclosure Governed by Capacity:**

At `cognitive.complexityTolerance: 0.9` (good day):
```
┌─────────────────────────────────────────────┐
│  Phase 3: API Development                   │
│  ─────────────────────────────────          │
│  Objective: Expose planning pipeline via     │
│  REST endpoints with full governance...      │
│                                              │
│  Tasks (4):                                  │
│  ☑ Route definitions                         │
│  ☑ Auth middleware integration               │
│  ☐ Integration tests                         │
│  ☐ Documentation                             │
│                                              │
│  Source clusters: Data Models, API Design     │
│  Risk: 2 entries (1 medium, 1 low)          │
│                                              │
│  [Edit] [Add Task] [View Risks] [History]   │
└─────────────────────────────────────────────┘
```

At `cognitive.complexityTolerance: 0.4` (foggy):
```
┌─────────────────────────────────────────────┐
│                                              │
│  Phase 3: API Development                   │
│                                              │
│  2 of 4 tasks done                          │
│  ████████░░░░░░░░ 50%                       │
│                                              │
│  Next: Integration tests                     │
│                                              │
│  [Work on this]  [Not today]                │
│                                              │
└─────────────────────────────────────────────┘
```

At `cognitive.complexityTolerance: 0.1` (severe fog):
```
┌─────────────────────────────────────────────┐
│                                              │
│                                              │
│        API work is halfway done.             │
│                                              │
│        I'm handling the rest today.          │
│                                              │
│                                              │
└─────────────────────────────────────────────┘
```

---

### 4. Interaction Mediator

Every interaction between the system and the user passes through mediation. This is the enforcement point.

```typescript
class InteractionMediator {
  
  // Every UI render passes through this
  async mediateRender(
    userId: string,
    proposedRender: RenderIntent
  ): Promise<MediatedRender> {
    
    const capacity = await this.capacityManager.getCurrent(userId);
    
    // Build a DecisionRequest — same pattern as Zo-Qore governance
    const request: DecisionRequest = {
      requestId: uuid(),
      actorId: 'interaction-mediator',
      action: `accessibility:render:${proposedRender.type}`,
      targetPath: `user://${userId}/display`,
      context: {
        capacity,
        proposedRender,
        sessionState: await this.sessionTracker.getState(userId),
        timeOfDay: new Date().toISOString(),
        environmentalFactors: await this.getEnvironment(userId)
      }
    };
    
    // Evaluate through policy engine
    const decision = await this.policyEngine.evaluate(request);
    
    if (!decision.allowed) {
      // Log to ledger — every denied render is tracked
      // This data enables pattern analysis
      await this.ledger.append({
        type: 'interaction_mediated',
        action: 'render_denied',
        reason: decision.reasoning,
        proposedRender: proposedRender.type,
        capacityAtTime: capacity.energyLevel
      });
      
      // Return adapted version, not just a block
      return decision.adaptation || this.minimalSafeRender();
    }
    
    // Apply sensory adaptations
    const adapted = await this.applySensoryAdaptations(
      proposedRender, 
      capacity
    );
    
    // Track interaction cost
    await this.sessionTracker.recordInteraction(userId, {
      type: proposedRender.type,
      cognitiveCost: this.estimateCognitiveCost(adapted),
      visualCost: this.estimateVisualCost(adapted),
      timestamp: new Date().toISOString()
    });
    
    return adapted;
  }
  
  // Notification delivery — the most dangerous interaction for ME/CFS
  async mediateNotification(
    userId: string,
    notification: Notification
  ): Promise<NotificationDelivery> {
    
    const capacity = await this.capacityManager.getCurrent(userId);
    
    // Priority classification
    const priority = this.classifyPriority(notification);
    
    // During crisis: only emergency notifications
    if (capacity.energyLevel === 'crisis') {
      if (priority !== 'emergency') {
        return { 
          action: 'queue',
          deliverWhen: 'capacity-improves',
          // notification stored, not lost
          queuedAt: new Date().toISOString()
        };
      }
      // Emergency: delivered via caregiver contact, not direct screen
      return {
        action: 'delegate-to-caregiver',
        caregiverId: await this.getCaregiverContact(userId),
        originalNotification: notification
      };
    }
    
    // During very-low: only urgent, delivered gently
    if (capacity.energyLevel === 'very-low') {
      if (priority === 'routine') {
        return { action: 'queue', deliverWhen: 'next-moderate-capacity' };
      }
      return {
        action: 'deliver-gentle',
        adaptations: {
          noSound: true,
          noBadge: true,
          // Just a soft warm glow on the edge of the screen
          // that persists until acknowledged
          visualStyle: 'ambient-glow',
          // Minimal text
          simplifiedMessage: this.simplifyMessage(notification.message)
        }
      };
    }
    
    // Normal capacity: deliver with sensory adaptations
    return {
      action: 'deliver',
      adaptations: await this.applyNotificationAdaptations(
        notification, 
        capacity
      )
    };
  }
}
```

---

### 5. Autonomous Delegate

When the user cannot engage — during a crash, after screen time limits are hit, during high-symptom periods — the system must **continue to operate on their behalf** within defined guardrails. This is directly the Autonomy view from Zo-Qore's planning pipeline, applied to the user's life management.

```typescript
interface DelegatedActionScope {
  // What the system can do without asking
  communications: {
    canReadIncomingMessages: boolean;
    canAutoReply: boolean;
    autoReplyTemplates: Record<string, string>;
    // "Hi, I'm managing my energy today and will respond when I can.
    //  If this is urgent, please contact [caregiver]."
    canRescheduleAppointments: boolean;
    reschedulingRules: {
      maxPostponeDays: number;
      cannotReschedule: string[];  // "medical appointments"
      preferredTimes: string[];    // when they're usually better
    };
  };
  
  tasks: {
    canAutoTriageInbox: boolean;
    canCompletePredefinedTasks: boolean;
    // e.g., "submit the form I filled out yesterday"
    // e.g., "post the status update I drafted"
    canDeferDeadlines: boolean;
    deferralNotificationRecipients: string[];
  };
  
  environment: {
    canAdjustScreenBrightness: boolean;
    canMuteNotifications: boolean;
    canActivateDoNotDisturb: boolean;
    canDimLights: boolean;         // if smart home integration
    canPlayAmbientSound: boolean;  // white noise / nature sounds
  };
  
  // What requires human confirmation
  requiresApproval: string[];
  // "sending messages to new contacts"
  // "financial transactions"
  // "sharing personal information"
  
  // When to escalate to caregiver
  escalationTriggers: {
    userUnresponsiveForMinutes: number;
    criticalNotificationReceived: boolean;
    medicalAppointmentApproaching: boolean;
  };
}
```

**Victor's Role in Autonomous Operation:**

Victor reviews autonomous actions with the same adversarial rigor it applies to planning:

```
Victor reviews pending auto-replies:
─────────────────────────────────────
✅ SUPPORT: Auto-reply to colleague about meeting reschedule
   "Message is warm, doesn't disclose health details, 
    suggests alternative date within preference window."

⚠️ CHALLENGE: Auto-reply to landlord about maintenance request
   "This message is too brief and may be misinterpreted as 
    disinterest. Suggest adding: 'This is important to me 
    and I'd like to coordinate when I'm feeling better.'"

🔴 RED FLAG: System attempted to auto-decline medical appointment
   "Medical appointments are in the 'cannotReschedule' list. 
    Blocking this action. Escalating to caregiver."
```

---

### 6. Pattern Tracker

The ledger records every interaction, capacity state change, and symptom report. Over time, this enables **pattern discovery** that helps the user understand their own condition better.

```typescript
interface PatternAnalysis {
  userId: string;
  analysisDate: string;
  
  temporalPatterns: {
    // "You tend to have better visual tolerance in mornings 
    //  before 11am"
    bestTimeOfDay: { start: string; end: string; confidence: number };
    // "Tuesdays and Thursdays you report higher energy"
    bestDaysOfWeek: number[];
    // "Screen sessions longer than 22 minutes consistently 
    //  precede symptom reports"
    screenTimeCrashThreshold: { minutes: number; confidence: number };
  };
  
  triggerPatterns: {
    // "High-contrast content is followed by headache reports 
    //  73% of the time"
    visualTriggers: Array<{
      trigger: string;
      symptomCorrelation: number;
      confidence: number;
    }>;
    // "Notification sounds above 60% volume correlate with 
    //  next-day crashes"
    auditoryTriggers: Array<{
      trigger: string;
      symptomCorrelation: number;
      delayedEffect: boolean;  // ME/CFS PEM is often delayed 24-72hrs
      confidence: number;
    }>;
    // "Making more than 8 decisions in a session correlates 
    //  with 2-day recovery"
    cognitiveTriggers: Array<{
      trigger: string;
      symptomCorrelation: number;
      recoveryDays: number;
      confidence: number;
    }>;
  };
  
  adaptationEffectiveness: {
    // "Amber text on dark background lets you use screens 
    //  40% longer without symptoms"
    effectiveAdaptations: Array<{
      adaptation: string;
      toleranceImprovement: number;
      confidence: number;
    }>;
  };
}
```

**Critical design consideration for ME/CFS:** Post-exertional malaise (PEM) is **delayed**. A symptom crash may occur 24-72 hours after the triggering activity. The pattern tracker must correlate interactions with symptom reports across this delay window, not just immediate reactions. This is a time-series analysis problem that the ledger's append-only timestamped structure is well-suited for.

**Presentation of patterns to the user:**

This information is presented according to current capacity state. On a good day, they might see detailed charts. On a bad day, a single sentence:

```
"Your best screen time is usually mornings. 
 It's 2:47pm — I'll handle things from here."
```

---

## Voice-First Interface

For many ME/CFS patients, screens are the problem. Zo-Qore already has STT (speech-to-text) infrastructure from the Void view. Extend this to a full voice interface:

```typescript
interface VoiceInterface {
  // Capacity-adapted voice interaction
  responseStyle: {
    // At low capacity: short, warm, no questions
    // "I've noted that. Rest well."
    
    // At moderate capacity: brief with one optional follow-up
    // "Got it. Want me to add that to your project plan?"
    
    // At adequate capacity: conversational
    // "I've captured that thought and tagged it under 'API design'. 
    //  It connects to the cluster you were working on yesterday. 
    //  Want to see how it fits?"
  };
  
  // Voice characteristics governed by auditory capacity
  voiceAdaptations: {
    volume: number;           // governed by auditory.volumeThreshold
    speed: number;            // slower when cognitive capacity is low
    pitch: number;            // lower pitch is less fatiguing
    // Warm, calm delivery always — never urgent-sounding
    tone: 'calm-warm';        // non-negotiable
    pauseBetweenSentences: number; // longer pauses at lower capacity
  };
  
  // Wake word sensitivity
  // At very-low capacity: respond only to explicit wake word
  // At crisis: voice interface sleeps entirely unless emergency phrase
  wakeWordSensitivity: 'always-listening' | 'wake-word-only' | 'disabled';
}
```

---

## Caregiver Portal

ME/CFS patients often rely on caregivers (family members, partners, paid carers). The system should include a governed caregiver interface:

```typescript
interface CaregiverAccess {
  caregiverId: string;
  relationship: string;
  
  // What caregivers can see
  canView: {
    capacityState: boolean;           // current energy/tolerance levels
    upcomingTasks: boolean;           // what the system has queued
    patternSummaries: boolean;        // trend reports
    detailedInteractionLog: boolean;  // privacy-sensitive — user controls
  };
  
  // What caregivers can do
  canDo: {
    updateCapacityState: boolean;     // report "they're having a bad day"
    triggerRestMode: boolean;         // immediately reduce all stimulation
    addNotes: boolean;               // observations for the user to review later
    respondToEscalations: boolean;   // handle urgent items on user's behalf
  };
  
  // What caregivers cannot do (hard limits)
  cannotDo: [
    'read-private-thoughts',         // Void thoughts are personal
    'modify-autonomy-guardrails',    // user's sovereignty
    'access-communication-content',  // unless explicitly granted
    'override-user-preferences'      // even when well-intentioned
  ];
  
  // All caregiver actions are ledger-recorded
  // User can review caregiver activity when they have capacity
  auditTrail: true;
}
```

**Governance principle:** The caregiver portal is governed by the same policy engine. A caregiver cannot accidentally (or intentionally) override the user's sensory protections. Every caregiver action is a `DecisionRequest` evaluated against policies that the user defined during a period of adequate capacity.

---

## Implementation Phases

### Phase A: Capacity State Foundation

```
1. CapacityState data model in qore-contracts
2. CapacityStateStore (same pattern as planning stores)
3. Self-report check-in endpoints (capacity-adapted)
4. Scheduled pattern rules
5. Capacity state → CSS custom property mapping
6. Ledger integration for capacity changes
7. Tests: capacity transitions, hard limit enforcement
```

### Phase B: Sensory Policy Engine

```
1. Visual policies (sv-001 through sv-005+)
2. Auditory policies (sa-001 through sa-002+)
3. Policy registration with existing governance engine
4. CSS adaptation generator (capacity → design tokens)
5. Audio processing pipeline (compression, filtering)
6. Screen time tracker and enforcer
7. Tests: every policy with graduated capacity inputs
```

### Phase C: Cognitive Load Manager

```
1. Decision cost estimation model
2. Cognitive session tracking
3. Progressive disclosure engine
4. Decision simplification logic
5. Preference learning (remember past decisions to auto-resolve)
6. Integration with planning pipeline (task → micro-task decomposition)
7. Tests: decision budgeting, simplification quality
```

### Phase D: Interaction Mediator & Voice Interface

```
1. Render mediation pipeline
2. Notification governance (queue, defer, delegate, adapt)
3. Voice interface extension from existing STT
4. TTS integration with capacity-adapted voice parameters
5. Ambient notification system (glow instead of alert)
6. Victor review of mediated interactions
7. Tests: full interaction lifecycle, notification scenarios
```

### Phase E: Autonomous Delegate & Caregiver Portal

```
1. Delegation scope configuration (Autonomy view extension)
2. Auto-reply system for communications
3. Task deferral and deadline management
4. Caregiver access model and policies
5. Escalation triggers and routing
6. Caregiver audit trail
7. Tests: delegation boundaries, escalation scenarios, 
   caregiver access control
```

### Phase F: Pattern Tracker & Long-Term Intelligence

```
1. Symptom report capture (minimal interaction)
2. Delayed correlation engine (activity → PEM with 24-72hr lag)
3. Temporal pattern analysis
4. Trigger identification
5. Adaptation effectiveness measurement
6. Pattern presentation (capacity-adapted)
7. Tests: correlation accuracy, delay window handling
```

---

## Design Principles — Non-Negotiable

These govern every decision in this service layer:

**1. Protection asymmetry.** A false negative (allowing harm) is 100x more costly than a false positive (preventing a tolerable interaction). The risk engine must model this asymmetric cost. When uncertain, protect.

**2. The check-in must never cause what it's trying to prevent.** If assessing the user's capacity requires more capacity than they have, the system has failed. Self-assessment interactions must be the simplest, lowest-stimulation interactions in the entire system.

**3. No capacity state is permanent.** The system must never treat a bad day as the new normal, or a good day as proof of recovery. ME/CFS fluctuates. The system respects the fluctuation without narrativizing it.

**4. Sovereignty is absolute.** The user defined their guardrails during a period of capacity. Those guardrails protect them during periods without capacity. Neither the system nor a caregiver can override them. This is the same principle as Zo-Qore's autonomy guardrails — they exist precisely to govern when the human isn't present to govern.

**5. The system disappears at its best.** The ideal experience is not "look how well the system adapted." It's that the user barely notices the technology at all. Minimal stimulation. Quiet competence. The work gets done. The world is held at bay. The user rests.

**6. Delayed harm tracking.** PEM crashes 24-72 hours after triggering activity. The pattern tracker must look backward across days, not just minutes. Every "I feel bad today" report should automatically correlate with interaction data from the preceding 72 hours.

**7. Warm, never clinical.** Every message, every notification, every check-in should sound like a trusted friend who understands — not a medical device, not a productivity tool, not a parent. Warmth is a design requirement, not a nicety.

---

## What This Actually Looks Like

A Tuesday. The user wakes up. It's a moderate day.

The system knows this because their scheduled pattern says Tuesdays are usually moderate, and the ambient light sensor (or time-of-day rule) confirms morning. The screen is already warm-toned, medium brightness, dark background.

A gentle amber glow appears at the edge of the screen — not a notification, just a presence.

They tap it.

```
Good morning. You have 3 things today, 
none urgent. Your project has made 
progress — I handled the routine parts 
yesterday.

Want to see? [Yes] [Later]
```

They tap "Yes." The planning pipeline shows their project. Phase 3 is 50% complete. Two tasks were auto-completed by the autonomous delegate (submitting a form, posting a status update — both pre-approved). One task needs their input: reviewing a cluster organization.

The Reveal view opens. Instead of the full drag-and-drop interface, it shows:

```
I grouped 4 new thoughts into "API Design." 

Does this look right?

[Looks good]  [Let me adjust]
```

They tap "Looks good." Decision cost: 1. They had 12 available today.

By 1pm, the system notices their interaction speed has slowed 30%. Response times are lengthening. The color temperature shifts slightly warmer. Font size increases imperceptibly.

A soft voice (if audio is enabled):

> "You've been at it for a while. I can take over from here. Want to wrap up?"

They say "yeah."

The system enters autonomous mode. Queues notifications. Manages incoming messages with warm auto-replies. Tracks remaining tasks for when capacity returns. Records the transition in the ledger.

The screen dims to near-black. Displays nothing but a small, warm dot — confirming the system is there, watching over things, but demanding nothing.

Thursday. They're crashing. PEM from Tuesday's activity. The system recognized the pattern — Tuesday moderate engagement followed by Thursday crash, seen 7 times in the ledger history.

No check-in. No screen. The caregiver gets a notification: "They're likely in a crash period. All non-emergency items queued. Medical appointment Friday is still scheduled — please confirm they can attend."

Friday. Better. The system presents the accumulated items, simplified, one at a time. No rush. The project didn't stop — the planning pipeline continued tracking integrity, running checks, maintaining state. Victor reviewed the autonomous actions and found them all within guardrails.

The user sees:

```
While you were resting:
- 3 messages handled ✓
- Meeting rescheduled to next week ✓  
- Project integrity: all checks passing ✓

Nothing needs your attention right now.
```

That's the service layer. Technology that governs itself so the user doesn't have to. A system that protects before it informs, simplifies before it presents, and acts on behalf before it asks for input. The governance architecture isn't incidental — it's the entire point. The same engine that prevents bad deployments prevents sensory harm. The same ledger that tracks code decisions tracks capacity patterns. The same Victor that challenges weak risk assessments challenges interaction decisions that might cause a crash.

The infrastructure exists. It needs a conscience.