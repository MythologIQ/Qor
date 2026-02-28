/**
 * Planning API Routes
 *
 * REST endpoints for the planning pipeline.
 * Mounted under /api/projects
 */

import * as http from "http";
import { randomUUID } from "crypto";
import { createLogger } from "../planning/Logger.js";
import {
  ProjectStore,
  createProjectStore,
  DEFAULT_PROJECTS_DIR,
} from "../planning/ProjectStore.js";
import {
  StoreIntegrity,
  createStoreIntegrity,
} from "../planning/StoreIntegrity.js";
import {
  IntegrityChecker,
  createIntegrityChecker,
  type CheckId,
} from "../planning/IntegrityChecker.js";
import {
  PlanningGovernance,
  createPlanningGovernance,
} from "../planning/PlanningGovernance.js";
import { VoidStore } from "../planning/VoidStore.js";
import { ViewStore } from "../planning/ViewStore.js";
import {
  PlanningLedger,
  createPlanningLedger,
  type PlanningView,
  type PlanningAction,
} from "../planning/PlanningLedger.js";
import type { ApiErrorCode, ApiErrorResponse } from "@mythologiq/qore-contracts/schemas/ApiTypes";
import type { PlanningAction as ContractPlanningAction, FullProjectState } from "@mythologiq/qore-contracts";
import {
  type UserFacingError,
  type UserFacingErrorResponse,
  formatUserError,
  getPolicyError,
  ErrorFactory,
} from "./errors.js";
import { OptimizedResponder, createOptimizedResponder } from "./response-utils.js";
import { integrityCheckToUserError, integrityChecksToUserErrors } from "../planning/IntegrityErrors.js";

export interface PlanningRoutesConfig {
  projectsDir?: string;
  requireAuth?: boolean;
  apiKey?: string;
  maxBodyBytes?: number;
}

/**
 * Maps local PlanningAction to contract PlanningAction
 */
function toContractAction(_action: PlanningAction): ContractPlanningAction {
  return "planning:create" as ContractPlanningAction;
}

export class PlanningRoutes {
  private readonly logger = createLogger("planning-routes");
  private readonly responder: OptimizedResponder;

  constructor(
    private readonly runtime: {
      evaluate(request: unknown): Promise<unknown>;
    },
    private readonly config: PlanningRoutesConfig = {},
  ) {
    this.responder = createOptimizedResponder();
  }

  /**
   * Handle planning routes
   * Returns true if route was handled, false if not found
   */
  async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Check authentication
    if (this.config.requireAuth !== false) {
      const candidate = req.headers["x-qore-api-key"];
      const apiKey = this.config.apiKey ?? process.env.QORE_API_KEY;
      if (!apiKey || typeof candidate !== "string" || candidate !== apiKey) {
        return this.sendError(res, 401, "UNAUTHORIZED" as ApiErrorCode, "Missing or invalid API key", traceId);
      }
    }

    // Extract projectId from URL if present
    const projectMatch = url.match(/^\/api\/projects\/([^/]+)/);
    const projectId = projectMatch?.[1];

    try {
      // GET /api/projects - List all projects (stub)
      if (method === "GET" && url === "/api/projects") {
        return this.sendData(res, 200, [], {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects - Create new project
      if (method === "POST" && url === "/api/projects") {
        if (!projectId) {
          const projectsDir = this.config.projectsDir ?? process.env.QORE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
          const body = await this.readJsonBody(req);
          const { projectId: newProjectId, name, description, createdBy } = body as {
            projectId?: string;
            name: string;
            description?: string;
            createdBy: string;
          };
          if (!name || !createdBy) {
            return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "name and createdBy required", traceId);
          }
          const finalProjectId = newProjectId ?? this.generateId("proj");
          const store = createProjectStore(finalProjectId, projectsDir);
          const project = await store.create({ name, description: description ?? "", createdBy });
          return this.sendCreated(res, project);
        }
      }

      // All other routes require projectId
      if (!projectId) {
        return false;
      }

      // Initialize stores for this project
      const projectsDir = this.config.projectsDir ?? process.env.QORE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
      const projectStore = createProjectStore(projectId, projectsDir);
      const storeIntegrity = createStoreIntegrity(projectsDir);
      const planningLedger = createPlanningLedger(projectsDir, projectId);
      const planningGovernance = createPlanningGovernance(projectStore, storeIntegrity);
      const voidStore = new VoidStore(projectsDir, projectId, { ledger: planningLedger, integrity: storeIntegrity });

      // GET /api/projects/:projectId - Get project metadata
      if (method === "GET" && url === `/api/projects/${projectId}`) {
        // Try integrity verification but don't fail the request if it errors
        try {
          await storeIntegrity.verify(projectId);
        } catch {
          // Integrity check failed - project may be new or corrupted
          // Still return the project data
        }
        const project = await projectStore.get();
        if (!project) {
          return this.sendError(res, 404, "NOT_FOUND" as ApiErrorCode, "Project not found", traceId);
        }
        return this.sendData(res, 200, project, {
          timestamp: new Date().toISOString(),
        });
      }

      // DELETE /api/projects/:projectId - Delete project
      if (method === "DELETE" && url === `/api/projects/${projectId}`) {
        await projectStore.delete();
        return this.sendDeleted(res);
      }

      // GET /api/projects/:projectId/integrity - Check integrity
      if (method === "GET" && url === `/api/projects/${projectId}/integrity`) {
        const integrityChecker = createIntegrityChecker(projectsDir, projectId);
        const summary = await integrityChecker.runAllChecks(projectId);
        
        // Convert failed checks to user-facing errors
        const userErrors = integrityChecksToUserErrors(summary.results);

        return this.sendData(res, 200, {
          ...summary,
          userErrors, // Add user-friendly error messages for failed checks
        }, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/check - Run specific check
      if (method === "POST" && url === `/api/projects/${projectId}/check`) {
        const body = await this.readJsonBody(req);
        const { checkId } = body as { checkId: string };
        if (!checkId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "checkId required", traceId);
        }
        
        // Validate checkId format
        const validCheckIds = ["PL-INT-01", "PL-INT-02", "PL-INT-03", "PL-INT-04", "PL-INT-05", "PL-INT-06", "PL-TRC-01", "PL-TRC-02", "PL-TRC-03"];
        if (!validCheckIds.includes(checkId)) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, `Invalid checkId: ${checkId}. Valid IDs: ${validCheckIds.join(", ")}`, traceId);
        }
        
        const integrityChecker = createIntegrityChecker(projectsDir, projectId);
        const result = await integrityChecker.runCheck(projectId, checkId as CheckId);

        // Convert to user-facing error if check failed
        const userError = integrityCheckToUserError(result);

        return this.sendData(res, 200, {
          ...result,
          userError, // Add user-friendly error message if check failed (null otherwise)
        }, {
          timestamp: new Date().toISOString(),
        });
      }

      // GET /api/projects/:projectId/void/thoughts - List thoughts (with pagination)
      if (method === "GET" && url === `/api/projects/${projectId}/void/thoughts`) {
        // Parse query parameters for pagination
        const urlObj = new URL(req.url ?? "", "http://localhost");
        const page = parseInt(urlObj.searchParams.get("page") ?? "1", 10);
        const limit = parseInt(urlObj.searchParams.get("limit") ?? "50", 10);
        const offset = (page - 1) * limit;
        
        // Parse filter parameters
        const status = urlObj.searchParams.get("status") as "raw" | "claimed" | null;
        const tagsParam = urlObj.searchParams.get("tags");
        const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()) : undefined;
        const source = urlObj.searchParams.get("source");
        
        // Build filter object
        const filter: { status?: "raw" | "claimed"; tags?: string[]; source?: string } = {};
        if (status) filter.status = status;
        if (tags && tags.length > 0) filter.tags = tags;
        if (source) filter.source = source;
        
        // Get paginated thoughts
        const result = await voidStore.getThoughts({
          offset,
          limit,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        });
        
        // Use optimized responder with ETag and compression
        return this.responder.sendPaginated(req, res, {
          page,
          limit,
          total: result.total,
        }, result.thoughts);
      }

      // POST /api/projects/:projectId/void/thoughts - Add single thought
      if (method === "POST" && url === `/api/projects/${projectId}/void/thoughts`) {
        const body = await this.readJsonBody(req);
        const { content, source, capturedBy, tags } = body as {
          content: string;
          source: "text" | "voice";
          capturedBy: string;
          tags?: string[];
        };
        if (!content || !source || !capturedBy) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "content, source, capturedBy required", traceId);
        }

        const thought = {
          thoughtId: this.generateId("thought"),
          projectId,
          content,
          source,
          capturedAt: new Date().toISOString(),
          capturedBy,
          tags: tags ?? [],
          status: "raw" as const,
        };

        await voidStore.addThought(thought, capturedBy);
        return this.sendCreated(res, thought);
      }

      // POST /api/projects/:projectId/void/thoughts/batch - Batch import thoughts
      if (method === "POST" && url === `/api/projects/${projectId}/void/thoughts/batch`) {
        const body = await this.readJsonBody(req);
        const { thoughts, skipDuplicates, continueOnError, actorId } = body as {
          thoughts: Array<{
            content: string;
            source: "text" | "voice";
            capturedBy: string;
            tags?: string[];
            status?: "raw" | "claimed";
          }>;
          skipDuplicates?: boolean;
          continueOnError?: boolean;
          actorId?: string;
        };

        if (!thoughts || !Array.isArray(thoughts) || thoughts.length === 0) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "thoughts array required with at least one thought", traceId);
        }

        // Limit batch size to prevent abuse
        const MAX_BATCH_SIZE = 100;
        if (thoughts.length > MAX_BATCH_SIZE) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, `Batch size exceeds limit of ${MAX_BATCH_SIZE} thoughts`, traceId);
        }

        const result = await voidStore.addThoughtsBatch(thoughts, {
          skipDuplicates: skipDuplicates ?? true,
          continueOnError: continueOnError ?? true,
          actorId: actorId ?? "batch-import",
        });

        // Return 201 if all succeeded, 207 (Multi-Status) if partial success
        const statusCode = result.totalFailed === 0 ? 201 : 207;
        
        return this.responder.sendJson(req, res, statusCode, {
          data: result,
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      // GET /api/projects/:projectId/reveal/clusters - List clusters
      if (method === "GET" && url === `/api/projects/${projectId}/reveal/clusters`) {
        const revealStore = new ViewStore(projectsDir, projectId, "reveal", { ledger: planningLedger, integrity: storeIntegrity });
        const data = await revealStore.read<{ clusters?: Array<{ clusterId: string }> }>();
        const clusters = data?.clusters ?? [];
        return this.sendData(res, 200, clusters, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/reveal/clusters - Create cluster
      if (method === "POST" && url === `/api/projects/${projectId}/reveal/clusters`) {
        const body = await this.readJsonBody(req);
        const { label, thoughtIds, notes, actorId } = body as {
          label: string;
          thoughtIds: string[];
          notes?: string;
          actorId: string;
        };
        if (!label || !thoughtIds || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "label, thoughtIds, actorId required", traceId);
        }

        const revealStore = new ViewStore(projectsDir, projectId, "reveal", { ledger: planningLedger, integrity: storeIntegrity });

        const newCluster = {
          clusterId: this.generateId("cluster"),
          projectId,
          label,
          thoughtIds,
          notes: notes ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "formed" as const,
        };

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            const existing = (await revealStore.read<{ clusters?: Array<{ clusterId: string }> }>()) ?? { clusters: [] };
            const clusters = existing.clusters ?? [];
            clusters.push(newCluster);
            await revealStore.write({ clusters });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendCreated(res, newCluster);
      }

      // GET /api/projects/:projectId/constellation/map - Get constellation
      if (method === "GET" && url === `/api/projects/${projectId}/constellation/map`) {
        const constellationStore = new ViewStore(projectsDir, projectId, "constellation", { ledger: planningLedger, integrity: storeIntegrity });
        const data = await constellationStore.read<{ nodes?: unknown[]; edges?: unknown[] }>();
        return this.sendData(res, 200, data ?? { nodes: [], edges: [] }, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/constellation/map - Save constellation
      if (method === "POST" && url === `/api/projects/${projectId}/constellation/map`) {
        const body = await this.readJsonBody(req);
        const { nodes, edges, actorId } = body as {
          nodes: Array<{ nodeId: string; clusterId: string; position: { x: number; y: number } }>;
          edges: Array<{ edgeId: string; fromNodeId: string; toNodeId: string; relationship: string; weight: number }>;
          actorId: string;
        };
        if (!nodes || !edges || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "nodes, edges, actorId required", traceId);
        }

        const constellationStore = new ViewStore(projectsDir, projectId, "constellation", { ledger: planningLedger, integrity: storeIntegrity });

        const constellation = {
          constellationId: `const_${projectId}`,
          projectId,
          nodes,
          edges,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "mapped" as const,
        };

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            await constellationStore.write(constellation);
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendUpdated(res, constellation);
      }

      // GET /api/projects/:projectId/path/phases - Get phases
      if (method === "GET" && url === `/api/projects/${projectId}/path/phases`) {
        const pathStore = new ViewStore(projectsDir, projectId, "path", { ledger: planningLedger, integrity: storeIntegrity });
        const data = await pathStore.read<{ phases?: unknown[] }>();
        const phases = data?.phases ?? [];
        return this.sendData(res, 200, phases, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/path/phases - Create phase
      if (method === "POST" && url === `/api/projects/${projectId}/path/phases`) {
        const body = await this.readJsonBody(req);
        const { name, objective, sourceClusterIds, tasks, actorId } = body as {
          name: string;
          objective: string;
          sourceClusterIds: string[];
          tasks?: Array<{ title: string; description: string; acceptance: string[] }>;
          actorId: string;
        };
        if (!name || !objective || !sourceClusterIds || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "name, objective, sourceClusterIds, actorId required", traceId);
        }

        const pathStore = new ViewStore(projectsDir, projectId, "path", { ledger: planningLedger, integrity: storeIntegrity });

        const existing = (await pathStore.read<{ phases?: unknown[] }>()) ?? { phases: [] };
        const phases = existing.phases ?? [];
        const ordinal = phases.length + 1;
        const phaseId = this.generateId("phase");
        const newPhase = {
          phaseId,
          projectId,
          ordinal,
          name,
          objective,
          sourceClusterIds,
          tasks: (tasks ?? []).map((t, i) => ({
            taskId: this.generateId(`task`),
            phaseId,
            title: t.title,
            description: t.description,
            acceptance: t.acceptance,
            status: "pending" as const,
          })),
          status: "planned" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            phases.push(newPhase);
            await pathStore.write({ phases });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendCreated(res, newPhase);
      }

      // GET /api/projects/:projectId/risk/register - Get risks
      if (method === "GET" && url === `/api/projects/${projectId}/risk/register`) {
        const riskStore = new ViewStore(projectsDir, projectId, "risk", { ledger: planningLedger, integrity: storeIntegrity });
        const data = await riskStore.read<{ risks?: unknown[] }>();
        const risks = data?.risks ?? [];
        return this.sendData(res, 200, risks, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/risk/register - Add risk
      if (method === "POST" && url === `/api/projects/${projectId}/risk/register`) {
        const body = await this.readJsonBody(req);
        const { phaseId, description, likelihood, impact, mitigation, owner, actorId } = body as {
          phaseId: string;
          description: string;
          likelihood: "low" | "medium" | "high";
          impact: "low" | "medium" | "high";
          mitigation: string;
          owner: string;
          actorId: string;
        };
        if (!phaseId || !description || !likelihood || !impact || !mitigation || !owner || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "All risk fields and actorId required", traceId);
        }

        const riskStore = new ViewStore(projectsDir, projectId, "risk", { ledger: planningLedger, integrity: storeIntegrity });

        const newRisk = {
          riskId: this.generateId("risk"),
          projectId,
          phaseId,
          description,
          likelihood,
          impact,
          mitigation,
          owner,
          status: "identified" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            const existing = (await riskStore.read<{ risks?: unknown[] }>()) ?? { risks: [] };
            const risks = existing.risks ?? [];
            risks.push(newRisk);
            await riskStore.write({ risks });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendCreated(res, newRisk);
      }

      // GET /api/projects/:projectId/autonomy/config - Get autonomy config
      if (method === "GET" && url === `/api/projects/${projectId}/autonomy/config`) {
        const autonomyStore = new ViewStore(projectsDir, projectId, "autonomy", { ledger: planningLedger, integrity: storeIntegrity });
        const config = await autonomyStore.read();
        return this.sendData(res, 200, config ?? { guardrails: [], approvalGates: [], allowedActions: [], blockedActions: [], victorMode: "support" }, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/projects/:projectId/autonomy/config - Save autonomy config
      if (method === "POST" && url === `/api/projects/${projectId}/autonomy/config`) {
        const body = await this.readJsonBody(req);
        const { guardrails, approvalGates, allowedActions, blockedActions, victorMode, actorId } = body as {
          guardrails?: Array<{ rule: string; enforcement: "block" | "warn" | "log" }>;
          approvalGates?: Array<{ trigger: string; approver: string; timeout: number }>;
          allowedActions?: string[];
          blockedActions?: string[];
          victorMode?: "support" | "challenge" | "mixed" | "red-flag";
          actorId: string;
        };
        if (!actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "actorId required", traceId);
        }

        const autonomyStore = new ViewStore(projectsDir, projectId, "autonomy", { ledger: planningLedger, integrity: storeIntegrity });

        const config = {
          autonomyId: `autonomy_${projectId}`,
          projectId,
          guardrails: guardrails ?? [],
          approvalGates: approvalGates ?? [],
          allowedActions: allowedActions ?? [],
          blockedActions: blockedActions ?? [],
          victorMode: victorMode ?? "support",
          status: "active" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            await autonomyStore.write(config);
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendUpdated(res, config);
      }

      // POST /api/projects/:projectId/query - Query project state (Agent Interface)
      if (method === "POST" && url === `/api/projects/${projectId}/query`) {
        const body = await this.readJsonBody(req);
        const { question } = body as { question: string };
        if (!question) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "question required", traceId);
        }

        try {
          const { createPlanningAgentInterface } = await import("../planning/PlanningAgentInterface.js");
          const agentInterface = createPlanningAgentInterface(projectsDir, projectId);
          const result = await agentInterface.query(question);
          return this.sendData(res, 200, result, {
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.error("Query failed", { projectId, question, error: err });
          return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, "Query failed", traceId);
        }
      }

      // GET /api/projects/:projectId/export - Export project
      if (method === "GET" && url.startsWith(`/api/projects/${projectId}/export`)) {
        const urlObj = new URL(req.url ?? "", "http://localhost");
        const format = (urlObj.searchParams.get("format") ?? "json") as "json" | "markdown";
        const view = urlObj.searchParams.get("view") ?? undefined;

        try {
          const { exportProject, exportView } = await import("../planning/PlanningExport.js");
          let result;
          if (view) {
            result = await exportView(projectId, view, format);
          } else {
            result = await exportProject(projectId, { format });
          }
          return this.sendData(res, 200, result, {
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.error("Export failed", { projectId, format, view, error: err });
          const msg = err instanceof Error ? err.message : "Export failed";
          return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, msg, traceId);
        }
      }

      // GET /api/projects/:projectId/ledger - Get ledger entries
      if (method === "GET" && url === `/api/projects/${projectId}/ledger`) {
        const urlObj = new URL(req.url ?? "", `http://localhost`);
        const view = urlObj.searchParams.get("view") as PlanningView | null;
        const action = urlObj.searchParams.get("action") as PlanningAction | null;
        const entries = await planningLedger.getEntries({ view: view ?? undefined, action: action ?? undefined });
        return this.sendData(res, 200, entries, {
          timestamp: new Date().toISOString(),
        });
      }

      // POST /api/victor/review-plan - Victor review endpoint
      if (method === "POST" && url === "/api/victor/review-plan") {
        const body = await this.readJsonBody(req);
        const { projectId: reviewProjectId, actorId, scope } = body as {
          projectId: string;
          actorId?: string;
          scope?: string;
        };
        if (!reviewProjectId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "projectId required", traceId);
        }

        // Import Victor planning review
        try {
          const { reviewPlanningProject } = await import("../../zo/victor/planning/planning-review.js");
          const reviewProjectStore = createProjectStore(reviewProjectId, projectsDir);
          const projectState = await reviewProjectStore.getFullProjectState();
          const review = await reviewPlanningProject(projectState);
          return this.sendData(res, 200, review, {
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.error("Failed to load Victor planning review", { error: err });
          return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, "Victor review unavailable", traceId);
        }
      }

      // Route not found
      return false;
    } catch (error) {
      this.handleError(res, error, traceId);
      return true;
    }
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    const body = Buffer.concat(chunks);
    if (this.config.maxBodyBytes && body.length > this.config.maxBodyBytes) {
      throw new Error("PAYLOAD_TOO_LARGE: Request body exceeds configured limit");
    }
    try {
      return JSON.parse(body.toString("utf-8"));
    } catch {
      throw new Error("BAD_JSON: Request body is not valid JSON");
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): boolean {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
    return true;
  }

  private sendError(
    res: http.ServerResponse,
    statusCode: number,
    code: string,
    message: string,
    traceId: string,
    additionalDetails?: Record<string, unknown>,
  ): boolean {
    // Map API error codes to UserFacingError using ErrorFactory
    let userError: UserFacingError;
    
    if (code === "UNAUTHORIZED") {
      userError = ErrorFactory.authRequired();
    } else if (code === "NOT_FOUND") {
      userError = ErrorFactory.notFound("Resource");
    } else if (code === "BAD_REQUEST") {
      userError = {
        code: "VALIDATION_ERROR",
        title: "Invalid Request",
        detail: message,
        resolution: "Please check your request and try again.",
        severity: "warning",
      };
    } else if (code === "POLICY_DENIED") {
      userError = ErrorFactory.policyDenied(
        message,
        "Review the requirements and try again."
      );
    } else if (code === "PAYLOAD_TOO_LARGE") {
      userError = {
        code: "PAYLOAD_TOO_LARGE",
        title: "Request Too Large",
        detail: message,
        resolution: "Reduce the size of your request and try again.",
        severity: "error",
      };
    } else if (code === "BAD_JSON") {
      userError = {
        code: "VALIDATION_ERROR",
        title: "Invalid JSON",
        detail: "The request body contains invalid JSON.",
        resolution: "Please ensure your request body is valid JSON and try again.",
        severity: "warning",
      };
    } else {
      // INTERNAL_ERROR or any other code
      userError = ErrorFactory.systemError(message);
    }
    
    // Add trace ID and additional details for debugging
    userError.details = { ...userError.details, traceId, ...additionalDetails };
    
    const payload: UserFacingErrorResponse = { error: userError };
    return this.sendJson(res, statusCode, payload);
  }

  /**
   * Send a UserFacingError response with the standardized error format.
   * This is the preferred method for API errors that the UI will display.
   */
  private sendUserFacingError(
    res: http.ServerResponse,
    statusCode: number,
    error: UserFacingError,
  ): boolean {
    const payload: UserFacingErrorResponse = { error };
    return this.sendJson(res, statusCode, payload);
  }

  /**
   * Send a policy denied error with user-friendly messaging.
   * Attempts to map policy rule IDs to helpful error messages.
   */
  private sendPolicyDeniedError(
    res: http.ServerResponse,
    reason: string,
    traceId: string,
    ruleId?: string,
  ): boolean {
    // Try to get a user-friendly error for this rule
    const userError = ruleId ? getPolicyError(ruleId) : null;
    
    if (userError) {
      userError.details = { ...userError.details, traceId };
      return this.sendUserFacingError(res, 403, userError);
    }

    // Fallback to generic policy denied error
    const genericError = formatUserError('POLICY_DENIED', {
      detail: reason,
    });
    genericError.details = { ...genericError.details, traceId };
    return this.sendUserFacingError(res, 403, genericError);
  }

  /**
   * Send a successful data response with standardized envelope.
   * All success responses should use this format: { data: T, meta?: {...} }
   */
  private sendData<T>(
    res: http.ServerResponse,
    statusCode: number,
    data: T,
    meta?: {
      timestamp?: string;
      integrity?: unknown;
      pagination?: { page: number; limit: number; total: number; hasMore: boolean };
      [key: string]: unknown;
    }
  ): boolean {
    const payload = { data, ...(meta && { meta }) };
    return this.sendJson(res, statusCode, payload);
  }

  /**
   * Send a paginated response with full metadata.
   * Includes page, limit, total, and hasMore fields.
   */
  private sendPaginatedData<T>(
    res: http.ServerResponse,
    data: T[],
    pagination: { page: number; limit: number; total: number }
  ): boolean {
    const hasMore = pagination.page * pagination.limit < pagination.total;
    return this.sendData(res, 200, data, {
      pagination: { ...pagination, hasMore },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a created resource response (201).
   * Includes timestamp in meta.
   */
  private sendCreated<T>(
    res: http.ServerResponse,
    resource: T
  ): boolean {
    return this.sendData(res, 201, resource, {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a successful update response (200).
   * Includes timestamp in meta.
   */
  private sendUpdated<T>(
    res: http.ServerResponse,
    resource: T
  ): boolean {
    return this.sendData(res, 200, resource, {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a successful delete response (204 No Content).
   */
  private sendDeleted(res: http.ServerResponse): boolean {
    res.statusCode = 204;
    res.end();
    return true;
  }

  /**
   * Generate consistent resource ID using UUIDv4.
   * Format: {prefix}_{8-char-uuid}
   */
  private generateId(prefix: string): string {
    return `${prefix}_${randomUUID().slice(0, 8)}`;
  }

  private handleError(res: http.ServerResponse, error: unknown, traceId: string): void {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Handle payload too large
    if (message.includes("PAYLOAD_TOO_LARGE")) {
      this.sendError(res, 413, "PAYLOAD_TOO_LARGE" as ApiErrorCode, message, traceId);
      return;
    }
    // Preserve BAD_JSON code for JSON parse errors
    if (message.includes("BAD_JSON")) {
      this.sendError(res, 400, "BAD_JSON" as ApiErrorCode, message, traceId);
      return;
    }
    if (message.includes("not found") || message.includes("NOT_FOUND") || message.includes("Project not found")) {
      this.sendError(res, 404, "NOT_FOUND" as ApiErrorCode, message, traceId);
      return;
    }
    // Handle RuntimeError types
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message: string };
      if (err.code === "NOT_FOUND") {
        this.sendError(res, 404, "NOT_FOUND" as ApiErrorCode, err.message, traceId);
        return;
      }
      if (err.code === "PAYLOAD_TOO_LARGE") {
        this.sendError(res, 413, "PAYLOAD_TOO_LARGE" as ApiErrorCode, err.message, traceId);
        return;
      }
    }
    this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, message, traceId);
  }
}