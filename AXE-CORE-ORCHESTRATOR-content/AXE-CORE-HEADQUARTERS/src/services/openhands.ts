export interface OpenHandsTask {
  id: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const OPENHANDS_BASE = '/proxy/openhands';

/**
 * OpenHands Service — AI Agent for software development tasks
 * Runs on your VPS at 89.167.78.6:3001
 */
export class OpenHandsService {
  private static instance: OpenHandsService;
  
  static getInstance(): OpenHandsService {
    if (!OpenHandsService.instance) {
      OpenHandsService.instance = new OpenHandsService();
    }
    return OpenHandsService.instance;
  }

  async sendTask(task: string): Promise<OpenHandsTask> {
    const id = crypto.randomUUID();
    
    try {
      const response = await fetch(`${OPENHANDS_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, task }),
      });

      if (!response.ok) {
        throw new Error(`OpenHands error: ${response.status}`);
      }

      const data = await response.json();
      return {
        id,
        task,
        status: 'running',
        output: data.output || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error) {
      console.error('[OpenHands] Task failed:', error);
      return {
        id,
        task,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<OpenHandsTask | null> {
    try {
      const response = await fetch(`${OPENHANDS_BASE}/api/tasks/${taskId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getAllTasks(): Promise<OpenHandsTask[]> {
    try {
      const response = await fetch(`${OPENHANDS_BASE}/api/tasks`);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  async executeCode(code: string, language: string = 'python'): Promise<{ output: string; error?: string }> {
    try {
      const response = await fetch(`${OPENHANDS_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      return await response.json();
    } catch (error) {
      return { 
        output: '', 
        error: error instanceof Error ? error.message : 'Execution failed' 
      };
    }
  }
}

export const openHandsService = OpenHandsService.getInstance();
