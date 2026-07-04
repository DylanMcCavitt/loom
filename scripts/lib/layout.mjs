// Central layout module per ADR 0004 Decision 4. Keep active path defaults here so
// renderers, validators, and tests share one source of truth for lane paths.

export const resourceManifestPath = "docs/harness/resource-manifest.json";
export const dryRunLinkPlanPath = "docs/harness/dry-run-link-plan.json";

export const ompSourceRoot = "adapters/omp/source";

export const nucleusRoot = "nucleus";
export const nucleusSkillsRoot = "nucleus/skills";
export const nucleusUtilitiesRoot = "nucleus/utilities";
export const nucleusAgentsRoot = "nucleus/agents";
export const sharedAgentContractPath = "nucleus/agents/shared-nucleus-agents.json";
export const sharedAgentContractMarkdownPath = "nucleus/agents/shared-nucleus-agents.md";

// Rendered compatibility surface for the OMP harness. This is intentionally a
// destination/compat surface, not a second canonical skill source.
export const compatSkillsRoot = ".agents/skills";

export const codexPlanPath = "docs/harness/codex-adapter-plan/adapter-plan.json";
export const codexPlanMarkdownPath = "docs/harness/codex-adapter-plan.md";
export const codexTemplatesDir = "adapters/codex/templates";

export const claudePlanPath = "docs/harness/claude-adapter-plan/adapter-plan.json";
export const claudePlanMarkdownPath = "docs/harness/claude-adapter-plan.md";
export const claudeTemplatesDir = "adapters/claude/templates";

export const pluginBridgePlanPath = "adapters/plugin-bridge/plan.json";
export const pluginBridgeDir = "adapters/plugin-bridge";

export const factoryDroidsRoot = ".factory/droids";

export const distributionsRoot = "distributions";
export const snapshotsRoot = "distributions/snapshots";
export const ompBuiltinsSnapshotRoot = "distributions/snapshots/omp-builtins";
export const ompBuiltinsSourcePath = "distributions/snapshots/omp-builtins/source.json";
export const ompBuiltinsPortabilityPath = "distributions/snapshots/omp-builtins/portability-matrix.json";
export const loomNucleusDistributionRoot = "distributions/loom-nucleus";
export const loomNucleusClaudeMarketplacePath = "distributions/loom-nucleus/.claude-plugin/marketplace.json";
