export type Role = 'admin' | 'user';
export type Permission =
  | 'documents'
  | 'knowledge'
  | 'code'
  | 'tasks'
  | 'audit'
  | 'admin';
export type Status =
  | 'completed'
  | 'running'
  | 'queued'
  | 'failed'
  | 'online'
  | 'offline'
  | 'degraded'
  | 'disabled'
  | 'indexed';
export type ModelGroup = 'MASTER' | 'VISION' | 'FAST' | 'LIBRARIAN';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  permissions: Permission[];
  modelAccess: ModelGroup[];
  dailyLimit: number;
  monthlyLimit: number;
  used: number;
  monthlyUsed: number;
  enabled: boolean;
  lastActivity: string;
}
export interface Model {
  id: string;
  name: string;
  group: ModelGroup;
  role: string;
  enabled: boolean;
  priority: number;
  nodeId: string;
  context: number;
  servedModel?: string;
  configured?: boolean;
  endpointHost?: string;
}
export interface ComputeNode {
  id: string;
  name: string;
  host: string;
  type: string;
  accelerator: string;
  memory: number;
  status: 'online' | 'offline' | 'degraded';
  capacity: number;
  utilization: number;
  activeTasks: number;
}
export interface RoutingRule {
  id: string;
  task: string;
  group: ModelGroup;
  primaryId: string;
  fallbackId: string;
  strategy: 'least_loaded' | 'priority';
}
export interface LocalDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number;
  chunks: number;
  status: 'indexed' | 'processing' | 'failed';
  error?: string | null;
  indexMode?: 'semantic' | 'lexical';
  updated: string;
  ownerId: string;
  source: 'sample' | 'upload';
  knowledge: boolean;
}
export interface AgentEvent {
  id: string;
  taskId: string;
  type: string;
  step: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  model?: string;
  group?: ModelGroup | 'ORCHESTRATOR';
  node?: string;
  reason?: string;
  tool?: string;
  planStepId?: string;
  delta?: string;
}
export interface TaskPlanStep {
  id: string;
  label: string;
  description: string;
  capability: string;
  modelGroup?: ModelGroup | 'ORCHESTRATOR';
  tool?: string;
}
export interface TaskPlan {
  type: Task['type'];
  classificationSource?:
    | 'orchestrator'
    | 'control_plane_guardrail'
    | 'control_plane_recovery';
  orchestratorType?: Task['type'] | null;
  useKnowledge: boolean;
  routingReason: string;
  routeGroup: 'FAST' | 'MASTER';
  requestedCapabilities: string[];
  steps: TaskPlanStep[];
}
export interface RouteDecision {
  group: ModelGroup;
  strategy: 'least_loaded' | 'priority';
  selectedModelId: string;
  selectedModel: string;
  nodeId: string;
  node: string;
  fallback: boolean;
  reason: string;
}
export type Scenario = 'normal' | 'rag_failure' | 'sandbox_failure';
export interface Task {
  id: string;
  title: string;
  prompt: string;
  type: 'document' | 'code' | 'general';
  conversationId?: string;
  reply?: string;
  citations?: {
    documentId: string;
    name: string;
    page: number;
    excerpt: string;
  }[];
  code?: string;
  executionStatus?: 'not_executed';
  reviewRequired?: boolean;
  status: 'completed' | 'running' | 'queued' | 'failed';
  ownerId: string;
  documentIds: string[];
  started: string;
  duration: number;
  step: number;
  events: AgentEvent[];
  modelId: string;
  nodeId: string;
  tokens: number;
  scenario: Scenario;
  error?: string;
  plan?: TaskPlan | null;
  route?: RouteDecision | null;
}
export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actor: string;
  action: string;
  resource: string;
  taskId?: string;
  status: 'success' | 'failed' | 'info';
}
export interface Settings {
  organization: string;
  dailyLimit: number;
  monthlyLimit: number;
  retentionDays: number;
  timeout: number;
  offline: boolean;
  departmentLimits: Record<string, number>;
  requireReview: boolean;
}
export interface Database {
  users: User[];
  models: Model[];
  nodes: ComputeNode[];
  routing: RoutingRule[];
  tasks: Task[];
  documents: LocalDocument[];
  audit: AuditEvent[];
  settings: Settings;
  localRequests: number;
  orchestrator?: {
    model: string;
    nodeId: string;
    configured: boolean;
    endpointHost: string;
    role: string;
  };
  telemetry?: {
    networkVerified: boolean;
    hardwareMetricsAvailable: boolean;
    mode: 'live';
    usageHourly?: { label: string; tokens: number }[];
    usageDaily?: { label: string; tokens: number }[];
  };
}
export interface ProviderHealth {
  id: string;
  group: ModelGroup | 'ORCHESTRATOR';
  nodeId: string;
  model: string;
  endpointHost: string;
  status: 'online' | 'offline' | 'unconfigured' | 'model_missing';
  modelAvailable: boolean;
  loaded?: boolean | null;
  memoryBytes?: number | null;
  processor?: string | null;
  latencyMs: number | null;
  advertisedModels: string[];
  checkedAt: string;
  detail: string;
}
export interface Session {
  user: User;
  token: string;
}
export const MODEL_GROUPS: ModelGroup[] = [
  'MASTER',
  'VISION',
  'FAST',
  'LIBRARIAN',
];
export const DOCUMENT_STEPS = [
  'Task received',
  'Document classified',
  'Model routed',
  'OCR completed',
  'Searching local knowledge',
  'Agent reasoning',
  'Generating report',
  'Complete',
];
export const CODE_STEPS = [
  'Task received',
  'Task classified',
  'Model routed',
  'Generating code',
  'Sandbox started',
  'Test 1 passed',
  'Test 2 passed',
  'Complete',
];
export const GENERAL_STEPS = [
  'Request received',
  'Understanding your request',
  'Choosing local tools',
  'Checking the request',
  'Finding useful context',
  'Preparing your response',
  'Reviewing the response',
  'Complete',
];
