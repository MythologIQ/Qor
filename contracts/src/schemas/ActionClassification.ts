/**
 * Action Classification
 *
 * Functions to classify actions by their risk level and type.
 */

/**
 * Action classification result
 */
export type ActionClassification = "read" | "write" | "execute";

/**
 * Read-like action tokens
 */
const READ_TOKENS = [
  "get_", "list_", "read_", "fetch_", "query_", "search_", "find_",
  "show_", "view_", "describe_", "inspect_", "check_", "validate_",
];

/**
 * Write-like action tokens
 */
const WRITE_TOKENS = [
  "create_", "update_", "delete_", "write_", "save_", "remove_",
  "add_", "set_", "put_", "post_", "patch_", "destroy_", "archive_",
  "publish_", "send_", "schedule_", "register_", "unregister_",
];

/**
 * Execute-like action tokens
 */
const EXECUTE_TOKENS = [
  "run_", "execute_", "call_", "invoke_", "process_", "handle_",
  "start_", "stop_", "restart_", "launch_", "trigger_", "fire_",
];

/**
 * Classify a tool action based on method and tool name.
 * 
 * @param method - The tool method (e.g., "tools/call")
 * @param toolName - The name of the tool being called
 * @returns The action classification: "read", "write", or "execute"
 */
export function classifyToolAction(
  method: string,
  toolName: string
): ActionClassification {
  const normalizedName = toolName.toLowerCase();
  
  // Check for write tokens first (higher priority than read)
  for (const token of WRITE_TOKENS) {
    if (normalizedName.includes(token)) {
      return "write";
    }
  }
  
  // Check for execute tokens
  for (const token of EXECUTE_TOKENS) {
    if (normalizedName.includes(token)) {
      return "execute";
    }
  }
  
  // Check for read tokens
  for (const token of READ_TOKENS) {
    // Use precise word boundary matching to avoid substring collisions
    // Token format is "prefix_" - we need to match either:
    // 1. The token with underscore followed by word chars (e.g., "list_file")
    // 2. The base word at a boundary (e.g., "get" at end or before non-word)
    const baseToken = token.replace(/_$/, ""); // Remove trailing underscore
    const pattern = new RegExp(`\\b${baseToken}(_[a-z]+|$|[^a-z])`, "i");
    if (pattern.test(normalizedName)) {
      return "read";
    }
  }
  
  // Default to execute for unknown actions (fail closed)
  return "execute";
}

/**
 * Classify a Zo prompt action based on the prompt content.
 * 
 * @param prompt - The prompt text to classify
 * @returns The action classification: "read", "write", or "execute"
 */
export function classifyZoPromptAction(prompt: string): ActionClassification {
  const normalizedPrompt = prompt.toLowerCase();
  
  // Check for explicit write/creation indicators
  const writeIndicators = [
    "create", "write", "save", "delete", "update", "remove",
    "add", "set", "send", "schedule", "publish", "archive",
  ];
  
  for (const indicator of writeIndicators) {
    if (normalizedPrompt.includes(indicator)) {
      return "write";
    }
  }
  
  // Check for explicit read/query indicators
  const readIndicators = [
    "show", "list", "get", "read", "fetch", "find", "search",
    "what", "which", "how many", "tell me about", "summarize", "explain",
    "describe", "analyze", "compare", "outline",
  ];
  
  for (const indicator of readIndicators) {
    if (normalizedPrompt.includes(indicator)) {
      return "read";
    }
  }
  
  // Default to execute for ambiguous prompts (fail closed)
  return "execute";
}
