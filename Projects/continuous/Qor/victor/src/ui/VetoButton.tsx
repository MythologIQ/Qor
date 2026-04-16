/**
 * VetoButton Component
 * Rendered on auto-derived task cards in Qora mindmap
 */

import { useState } from "react";

interface VetoButtonProps {
  taskId: string;
  provenanceHash: string;
  derivedAt: string;
  onVeto: (result: VetoResult) => void;
}

interface VetoResult {
  taskId: string;
  vetoedAt: string;
  reason: "mismatch" | "low_quality" | "duplicate" | "other";
  feedback?: string;
  adjustedAutonomyLevel?: number;
}

type VetoReason = "mismatch" | "low_quality" | "duplicate" | "other";

interface VetoReasonOption {
  value: VetoReason;
  label: string;
  description: string;
}

const VETO_REASONS: VetoReasonOption[] = [
  { value: "mismatch", label: "Doesn't Match Intent", description: "Task doesn't align with what I wanted" },
  { value: "low_quality", label: "Low Quality", description: "Task description is vague or incorrect" },
  { value: "duplicate", label: "Duplicate", description: "This task already exists" },
  { value: "other", label: "Other", description: "Explain in comments" },
];

export function VetoButton({ taskId, provenanceHash, derivedAt, onVeto }: VetoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<VetoReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<VetoResult | null>(null);
  
  const handleSubmit = async () => {
    if (!selectedReason) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch("/api/victor/veto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.VICTOR_API_SECRET || ""}`,
        },
        body: JSON.stringify({
          taskId,
          vetoedAt: new Date().toISOString(),
          reason: selectedReason,
          feedback: feedback || undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const vetoResult: VetoResult = {
        taskId,
        vetoedAt: new Date().toISOString(),
        reason: selectedReason,
        feedback: feedback || undefined,
        adjustedAutonomyLevel: data.autonomyImpact?.newLevel,
      };
      
      setResult(vetoResult);
      onVeto(vetoResult);
      
      // Close after brief delay
      setTimeout(() => setIsOpen(false), 2000);
    } catch (err) {
      console.error("Veto submission failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (result) {
    return (
      <div className="veto-success">
        ✓ Veto recorded
        {result.adjustedAutonomyLevel && (
          <span className="autonomy-adjusted">
            Autonomy adjusted to level {result.adjustedAutonomyLevel}
          </span>
        )}
      </div>
    );
  }
  
  if (!isOpen) {
    return (
      <button
        className="veto-button"
        onClick={() => setIsOpen(true)}
        title="Veto this auto-derived task"
        aria-label="Veto task"
      >
        🚫 Veto
      </button>
    );
  }
  
  return (
    <div className="veto-modal-overlay">
      <div className="veto-modal">
        <h3>🚫 Veto Auto-Derived Task</h3>
        
        <div className="task-context">
          <div><strong>Task ID:</strong> <code>{taskId}</code></div>
          <div><strong>Derived:</strong> {new Date(derivedAt).toLocaleString()}</div>
          <div className="hash-truncate">
            <strong>Provenance:</strong> <code>{provenanceHash.substring(0, 16)}...</code>
          </div>
        </div>
        
        <fieldset className="veto-reasons">
          <legend>Why are you vetoing this task?</legend>
          
          {VETO_REASONS.map((option) => (
            <label key={option.value} className="veto-option">
              <input
                type="radio"
                name="veto-reason"
                value={option.value}
                checked={selectedReason === option.value}
                onChange={() => setSelectedReason(option.value)}
              />
              <div className="option-content">
                <div className="option-label">{option.label}</div>
                <div className="option-description">{option.description}</div>
              </div>
            </label>
          ))}
        </fieldset>
        
        <div className="veto-feedback">
          <label htmlFor="veto-feedback">Additional feedback (optional):</label>
          <textarea
            id="veto-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Explain why this task doesn't match your intent..."
            rows={3}
          />
        </div>
        
        <div className="veto-actions">
          <button
            className="veto-cancel"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="veto-confirm"
            onClick={handleSubmit}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Confirm Veto"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { VetoResult, VetoReason };
export { VETO_REASONS };
