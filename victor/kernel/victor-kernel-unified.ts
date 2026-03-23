/**
 * Victor Kernel - Unified Recursive Learning System
 * Integrates all learning flows into Qore runtime
 */

import { 
  LearningPacket, 
  LearningPacketValidator,
  OriginPhase 
} from './learning-schema';

import { 
  DebugLearningFlow,
  SubstantiateLearningFlow,
  AuditGateFlow 
} from './learning-flows';

import { SVGLearningOverlay, SVGLearningCSS } from './svg-learning-overlay';
import { loadEmbeddingConfig, loadNeo4jConfig } from './memory/config';
import { createEmbeddingProvider, type EmbeddingProvider } from './memory/embed';
import { applyIngestionPlan, planArtifactIngestion } from './memory/ingest';
import { archiveQueryFailureIfNeeded } from './memory/failure-memory';
import { Neo4jLearningStore } from './memory/neo4j-store';
import { retrieveGroundedContext } from './memory/retrieve';
import type { LearningStore } from './memory/store';
import type { GroundedContextBundle, IngestionPlan } from './memory/types';

/**
 * Victor Kernel - Main Class
 */
export class VictorKernelUnified {
  private knowledgeGraph: LearningStore;
  private debugFlow: DebugLearningFlow;
  private substantiateFlow: SubstantiateLearningFlow;
  private auditGateFlow: AuditGateFlow;
  private svgOverlay: SVGLearningOverlay;
  private embeddingProvider: EmbeddingProvider;
  
  constructor() {
    const embeddingConfig = loadEmbeddingConfig();
    this.embeddingProvider = createEmbeddingProvider(embeddingConfig);
    const neo4jConfig = loadNeo4jConfig();
    neo4jConfig.vectorDimensions = this.embeddingProvider.dimensions;
    this.knowledgeGraph = new Neo4jLearningStore(neo4jConfig);
    
    // Initialize flows
    this.debugFlow = new DebugLearningFlow(this.knowledgeGraph);
    this.substantiateFlow = new SubstantiateLearningFlow(this.knowledgeGraph);
    this.auditGateFlow = new AuditGateFlow(this.knowledgeGraph);
    this.svgOverlay = new SVGLearningOverlay();
  }
  
  async initialize() {
    console.log('Victor Kernel: Initializing Recursive Learning System...');
    await this.knowledgeGraph.initialize();
    console.log('Victor Kernel: Knowledge Graph ready');
  }

  async ingestWorkspaceFile(path: string, projectId: string): Promise<IngestionPlan> {
    const content = await Bun.file(path).text();
    return this.ingestArtifactContent(path, content, projectId);
  }

  async ingestArtifactContent(path: string, content: string, projectId: string): Promise<IngestionPlan> {
    const documentId = await this.deriveDocumentId(path, projectId);
    const snapshot = await this.knowledgeGraph.loadDocumentSnapshot(documentId);
    const plan = planArtifactIngestion(
      {
        path,
        content,
        projectId,
      },
      snapshot,
    );
    const embeddings = await this.embeddingProvider.embedMany(plan.chunks.map((chunk) => chunk.text));
    plan.chunks = plan.chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    return applyIngestionPlan(plan, this.knowledgeGraph);
  }

  async groundedQuery(projectId: string, query: string): Promise<GroundedContextBundle> {
    const bundle = await retrieveGroundedContext(
      this.knowledgeGraph,
      projectId,
      query,
      { embedQuery: (value) => this.embeddingProvider.embed(value) },
    );

    await archiveQueryFailureIfNeeded(this.knowledgeGraph, {
      projectId,
      query,
      bundle,
    });

    return bundle;
  }
  
  // Phase 1: Plan (Enriched with Knowledge Graph)
  async planWithKnowledge(
    requirements: {
      stack: string[];
      tasks: any[];
      timeline: number;
    },
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<EnrichedPlan> {
    console.log('Victor Kernel: Querying Knowledge Graph for best practices...');
    
    // Query for similar project lessons
    const similarLessons = await this.knowledgeGraph.query({
      context_stack: { $in: requirements.stack },
      origin_phase: OriginPhase.SUBSTANTIATE
    });
    
    // Query for universal truths
    const universalTruths = await this.knowledgeGraph.query({
      universal_truth: true,
      context_stack: { $in: requirements.stack }
    });
    
    // Enrich requirements with learned insights
    const enrichedPlan = {
      ...requirements,
      enriched_with: {
        similar_lessons: similarLessons,
        universal_truths: universalTruths,
        suggested_guardrails: this.extractGuardrails(similarLessons)
      }
    };
    
    console.log(`Victor Kernel: Plan enriched with ${similarLessons.length} lessons and ${universalTruths.length} universal truths`);
    
    return enrichedPlan;
  }
  
  // Phase 2: Audit Gate (Validates against learned constraints)
  async auditGate(
    plan: any,
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<AuditGateResult> {
    console.log('Victor Kernel: Running Audit Gate...');
    
    return await this.auditGateFlow.validatePlan(plan, projectContext);
  }
  
  // Phase 3: Debug (Capture learning from errors)
  async captureDebugLearning(
    error: Error,
    context: {
      node?: string;
      stack?: string[];
      phase: string;
    },
    projectContext: {
      projectId: string;
      sessionId: string;
    }
  ): Promise<LearningPacket> {
    console.log('Victor Kernel: Capturing debug learning event...');
    
    return await this.debugFlow.captureError(error, {
      ...context,
      project_id: projectContext.projectId,
      session_id: projectContext.sessionId,
    });
  }
  
  // Phase 4: Substantiate (Consolidate learning, update Atlas)
  async substantiatePhase(
    plan: any,
    reality: any,
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<SubstantiationResult> {
    console.log('Victor Kernel: Consolidating substantiation learning...');
    
    const result = await this.substantiateFlow.consolidate(
      plan,
      reality,
      projectContext
    );
    const response: SubstantiationResult = {
      packet: result.packet,
      deltaReport: result.deltaReport,
      svgContent: reality?.svgContent,
    };
    
    // Update Mind Map with Learning Overlay
    if (projectContext.node && reality?.svgContent) {
      const learningPackets = await this.knowledgeGraph.query({
        context_node: projectContext.node
      });
      
      const svg = await this.applyLearningOverlay(reality.svgContent, learningPackets);
      response.overlayedSVG = svg;
    }
    
    return response;
  }
  
  // SVG Visualization with Learning Overlay
  async applyLearningOverlay(svgContent: string, learningPackets: LearningPacket[]): Promise<string> {
    console.log('Victor Kernel: Applying learning overlay to SVG...');
    return await this.svgOverlay.applyOverlay(svgContent, learningPackets);
  }
  
  // Get Heat Map for visualization
  async getHeatMap(): Promise<Map<string, HeatMapNode>> {
    const results = await this.knowledgeGraph.query({
      origin_phase: OriginPhase.DEBUG,
      trigger_type: 'Logic Error'
    });
    
    const heatmap = new Map<string, HeatMapNode>();
    
    for (const packet of results) {
      if (!packet.context_node) continue;
      
      const node = heatmap.get(packet.context_node);
      
      if (node) {
        node.totalImpact += packet.debt_impact;
        node.frequency += packet.frequency || 1;
        node.lastUpdate = packet.timestamp;
        node.lessons.push(packet.lesson);
      } else {
        heatmap.set(packet.context_node, {
          id: packet.context_node,
          totalImpact: packet.debt_impact,
          frequency: packet.frequency || 1,
          lastUpdate: packet.timestamp,
          lessons: [packet.lesson],
          heat: this.calculateNodeHeat(packet.debt_impact)
        });
      }
    }
    
    return heatmap;
  }
  
  private extractGuardrails(lessons: any[]): string[] {
    return lessons
      .filter(l => l.audit_constraint)
      .map(l => l.audit_constraint);
  }
  
  private calculateNodeHeat(impact: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (impact >= 8) return 'Critical';
    if (impact >= 5) return 'High';
    if (impact >= 2) return 'Medium';
    return 'Low';
  }

  private async deriveDocumentId(path: string, projectId: string): Promise<string> {
    const { hashContent } = await import('./memory/provenance');
    return hashContent(projectId, path);
  }
}
interface EnrichedPlan {
  stack: string[];
  tasks: any[];
  timeline: number;
  enriched_with: {
    similar_lessons: any[];
    universal_truths: any[];
    suggested_guardrails: string[];
  };
}

interface AuditGateResult {
  passed: boolean;
  violations: string[];
  rejection_reason?: string;
  rejection_packet?: any;
  enriched_with: {
    guardrails: any[];
    universal_truths: any[];
    similar_lessons: any[];
  };
  timestamp: number;
}

interface SubstantiationResult {
  packet: LearningPacket;
  deltaReport: any;
  svgContent?: string;
  overlayedSVG?: string;
}

interface HeatMapNode {
  id: string;
  totalImpact: number;
  frequency: number;
  lastUpdate: number;
  lessons: string[];
  heat: 'Low' | 'Medium' | 'High' | 'Critical';
}
