/**
 * Co-capture linking and peer pinning primitives.
 * 
 * Memories encoded within the same governed session can form associative links,
 * allowing coherent memory clusters to emerge without manual authoring.
 * Cross-reference pinning affects linked memories deterministically.
 */

export interface SessionBoundary {
  sessionId: string;
  startedAt: number;  // epoch ms
  endedAt: number | null;  // null if session still active
}

export interface CocaptureLink {
  sourceMemoryId: string;
  targetMemoryId: string;
  sessionId: string;
  linkStrength: number;  // 0.0 to 1.0
  createdAt: number;  // epoch ms
}

export interface PeerPinningParams {
  readonly crossReferenceWeight: number;  // medium-strength pinning for peer access
  readonly cocaptureBaseWeight: number;   // base weight for same-session capture
  readonly maxPeerDistance: number;       // max hops for transitive pinning
  readonly strengthDecayPerHop: number;   // strength multiplier per hop (0-1)
}

export const DEFAULT_PEER_PINNING_PARAMS: PeerPinningParams = {
  crossReferenceWeight: 0.10,    // between ordinary access (0.05) and corroboration (0.15)
  cocaptureBaseWeight: 0.08,     // slightly below cross-reference
  maxPeerDistance: 2,            // limit transitive effects
  strengthDecayPerHop: 0.6,      // 60% strength per hop
};

/**
 * Creates a co-capture link between two memories in the same session.
 * 
 * @param sourceMemoryId - The referencing memory
 * @param targetMemoryId - The referenced memory
 * @param sessionId - The governed session ID
 * @param linkStrength - Initial link strength (0-1), defaults to 1.0 for direct co-capture
 * @returns A co-capture link record
 */
export function createCocaptureLink(
  sourceMemoryId: string,
  targetMemoryId: string,
  sessionId: string,
  linkStrength: number = 1.0
): CocaptureLink {
  if (linkStrength < 0 || linkStrength > 1) {
    throw new Error(`Link strength must be in [0, 1], got ${linkStrength}`);
  }
  
  return {
    sourceMemoryId,
    targetMemoryId,
    sessionId,
    linkStrength,
    createdAt: Date.now(),
  };
}

/**
 * Validates that two memories belong to the same session.
 * 
 * @param link - The co-capture link to validate
 * @param session - The session boundary
 * @returns true if link is valid for the session
 */
export function validateSessionBoundary(
  link: CocaptureLink,
  session: SessionBoundary
): boolean {
  return link.sessionId === session.sessionId;
}

/**
 * Calculates effective peer pinning weight based on link strength and hop distance.
 * 
 * @param linkStrength - The strength of the co-capture link (0-1)
 * @param hopDistance - Number of hops from source (0 = direct)
 * @param params - Peer pinning parameters
 * @returns Effective pinning weight to apply
 */
export function calculatePeerPinningWeight(
  linkStrength: number,
  hopDistance: number,
  params: PeerPinningParams = DEFAULT_PEER_PINNING_PARAMS
): number {
  if (hopDistance > params.maxPeerDistance) {
    return 0;  // beyond max distance, no pinning effect
  }
  
  const baseWeight = params.cocaptureBaseWeight;
  const distanceDecay = Math.pow(params.strengthDecayPerHop, hopDistance);
  
  return baseWeight * linkStrength * distanceDecay;
}

/**
 * Applies peer pinning boost to a memory's saturation via cross-reference.
 * Similar to weighted pinning, but driven by associative links.
 * 
 * @param saturation - Current saturation (0-1)
 * @param links - Co-capture links to the memory
 * @param params - Peer pinning parameters
 * @param ceiling - Maximum saturation value
 * @returns Updated saturation after peer pinning
 */
export function applyPeerPinning(
  saturation: number,
  links: CocaptureLink[],
  params: PeerPinningParams = DEFAULT_PEER_PINNING_PARAMS,
  ceiling: number = 1.0
): number {
  if (saturation < 0 || saturation > ceiling) {
    throw new Error(`Saturation must be in [0, ${ceiling}], got ${saturation}`);
  }
  
  let updatedSaturation = saturation;
  
  for (const link of links) {
    const weight = calculatePeerPinningWeight(link.linkStrength, 0, params);
    const boost = weight * (ceiling - updatedSaturation);
    updatedSaturation += boost;
  }
  
  return Math.min(updatedSaturation, ceiling);
}

/**
 * Applies cross-reference pinning when one memory explicitly references another.
 * Stronger than co-capture (same session) but weaker than verification.
 * 
 * @param saturation - Current saturation (0-1)
 * @param referenceCount - Number of explicit cross-references
 * @param params - Peer pinning parameters
 * @param ceiling - Maximum saturation value
 * @returns Updated saturation after cross-reference pinning
 */
export function applyCrossReferencePinning(
  saturation: number,
  referenceCount: number,
  params: PeerPinningParams = DEFAULT_PEER_PINNING_PARAMS,
  ceiling: number = 1.0
): number {
  if (saturation < 0 || saturation > ceiling) {
    throw new Error(`Saturation must be in [0, ${ceiling}], got ${saturation}`);
  }
  
  let updatedSaturation = saturation;
  const weight = params.crossReferenceWeight;
  
  for (let i = 0; i < referenceCount; i++) {
    const boost = weight * (ceiling - updatedSaturation);
    updatedSaturation += boost;
  }
  
  return Math.min(updatedSaturation, ceiling);
}

/**
 * Discovers transitive peer links up to maxPeerDistance hops.
 * 
 * @param sourceMemoryId - Starting memory
 * @param allLinks - All available co-capture links
 * @param params - Peer pinning parameters
 * @returns Array of (targetMemoryId, hopDistance) pairs
 */
export function discoverTransitivePeers(
  sourceMemoryId: string,
  allLinks: CocaptureLink[],
  params: PeerPinningParams = DEFAULT_PEER_PINNING_PARAMS
): Array<{ memoryId: string; hopDistance: number; linkStrength: number }> {
  const visited = new Set<string>();
  const peers: Array<{ memoryId: string; hopDistance: number; linkStrength: number }> = [];
  const queue: Array<{ memoryId: string; hopDistance: number }> = [
    { memoryId: sourceMemoryId, hopDistance: 0 },
  ];
  
  visited.add(sourceMemoryId);
  
  while (queue.length > 0) {
    const { memoryId, hopDistance } = queue.shift()!;
    
    if (hopDistance >= params.maxPeerDistance) {
      continue;
    }
    
    // Find direct links from this memory
    const directLinks = allLinks.filter(
      (link) => link.sourceMemoryId === memoryId || link.targetMemoryId === memoryId
    );
    
    for (const link of directLinks) {
      const targetId =
        link.sourceMemoryId === memoryId ? link.targetMemoryId : link.sourceMemoryId;
      
      if (!visited.has(targetId)) {
        visited.add(targetId);
        const nextHopDistance = hopDistance + 1;
        
        if (nextHopDistance <= params.maxPeerDistance) {
          peers.push({
            memoryId: targetId,
            hopDistance: nextHopDistance,
            linkStrength: link.linkStrength,
          });
          queue.push({ memoryId: targetId, hopDistance: nextHopDistance });
        }
      }
    }
  }
  
  return peers;
}

/**
 * Inspects current peer pinning parameters for governance visibility.
 * 
 * @param params - Peer pinning parameters to inspect
 * @returns Copy of parameters (not reference)
 */
export function inspectPeerPinningParams(
  params: PeerPinningParams = DEFAULT_PEER_PINNING_PARAMS
): PeerPinningParams {
  return { ...params };
}
