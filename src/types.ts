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
}
export type Scenario = 'normal' | 'rag_failure' | 'sandbox_failure';
export interface Task {
  id: string;
  title: string;
  prompt: string;
  type: 'document' | 'code';
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
