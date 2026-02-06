import { EventStore } from '../receipts/store.js';
import { PolicyEngine } from '../policy/engine.js';
import { WitnessClient } from './client.js';
import type { ToolRouter, ToolInfo, ToolResult } from './server.js';

export type { ToolRouter };

export interface RouterOptions {
  eventStore: EventStore;
  policyEngine: PolicyEngine;
  client: WitnessClient;
  sessionId: string;
}

export class ToolCallRouter implements ToolRouter {
  private eventStore: EventStore;
  private policyEngine: PolicyEngine;
  private client: WitnessClient;
  private sessionId: string;

  constructor(options: RouterOptions) {
    this.eventStore = options.eventStore;
    this.policyEngine = options.policyEngine;
    this.client = options.client;
    this.sessionId = options.sessionId;
  }

  async listTools(): Promise<ToolInfo[]> {
    return this.client.listAllTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const decision = this.policyEngine.evaluate(name, args);
    const eventId = this.eventStore.logEvent(this.sessionId, name, args);
    const startTime = performance.now();

    if (decision.decision === 'deny') {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = `Policy denied: ${decision.reason ?? 'not allowed'}`;
      this.eventStore.failEvent(eventId, errorMsg, durationMs);
      return {
        content: [{ type: 'text', text: errorMsg }],
        isError: true,
      };
    }

    try {
      const result = await this.client.callTool(name, args);
      const durationMs = Math.round(performance.now() - startTime);
      this.eventStore.completeEvent(eventId, result, durationMs);
      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.eventStore.failEvent(eventId, errorMsg, durationMs);
      return {
        content: [{ type: 'text', text: `Tool execution failed: ${errorMsg}` }],
        isError: true,
      };
    }
  }
}
