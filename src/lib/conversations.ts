import type { Task } from '../types';
export interface Conversation {
  id: string;
  title: string;
  updated: string;
  running: boolean;
  tasks: Task[];
}
export function getConversations(tasks: Task[]): Conversation[] {
  const groups = new Map<string, Conversation>();
  for (const task of tasks) {
    const id = task.conversationId ?? task.id;
    const group = groups.get(id) ?? {
      id,
      title: task.title,
      updated: task.started,
      running: false,
      tasks: [],
    };
    group.tasks.push(task);
    if (task.id === id) group.title = task.title;
    if (task.started > group.updated) group.updated = task.started;
    group.running ||= task.status === 'running' || task.status === 'queued';
    groups.set(id, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      tasks: group.tasks.sort((a, b) => a.started.localeCompare(b.started)),
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
