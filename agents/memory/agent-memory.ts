import { BaseMessage, MessageSchema } from './interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from './interfaces/provider.interface';
import { IContextStrategy, StrategyOptions } from './interfaces/strategy.interface';
import { InMemoryProvider } from './providers/in-memory.provider';
import { TokenBudgetStrategy } from './strategies/token-budget.strategy';
import { TokenCounter } from './utils/token-counter.util';

export interface AgentMemoryConfig {
  provider?: IMemoryProvider;
  strategy?: IContextStrategy;
  namespace?: MemoryNamespace;
  defaultOptions?: StrategyOptions;
}

export class AgentMemory {
  private provider: IMemoryProvider;
  private strategy: IContextStrategy;
  private namespace: MemoryNamespace;
  private defaultOptions: StrategyOptions;
  private fallbackMemory: InMemoryProvider;

  constructor(config: AgentMemoryConfig = {}) {
    this.fallbackMemory = new InMemoryProvider();
    this.provider = config.provider || new InMemoryProvider();
    this.strategy = config.strategy || new TokenBudgetStrategy(4000);
    this.namespace = config.namespace || { sessionId: 'default-session', agentId: 'default-agent' };
    this.defaultOptions = config.defaultOptions || {};
  }

  /**
   * Safely adds a single message to memory with strict Zod validation
   */
  public async addMessage(message: BaseMessage): Promise<void> {
    try {
      if (!message) {
        console.warn('[AgentMemory Warning] Skipping null or undefined message payload.');
        return;
      }

      const parseResult = MessageSchema.safeParse(message);
      if (!parseResult.success) {
        console.warn('[AgentMemory Warning] Invalid message schema. Skipping payload:', parseResult.error.format());
        return;
      }

      await this.provider.saveMessage(this.namespace, parseResult.data as BaseMessage);
    } catch (error) {
      console.error('[AgentMemory Exception Handled] Provider write error. Falling back to internal memory:', error);
      await this.fallbackMemory.saveMessage(this.namespace, message);
    }
  }

  /**
   * Safely adds an array of messages to memory
   */
  public async addMessages(messages: BaseMessage[]): Promise<void> {
    if (!Array.isArray(messages)) return;
    for (const msg of messages) {
      await this.addMessage(msg);
    }
  }

  /**
   * Retrieves raw unpruned messages stored in memory
   */
  public async getRawMessages(): Promise<BaseMessage[]> {
    try {
      return await this.provider.getMessages(this.namespace);
    } catch (error) {
      console.error('[AgentMemory Exception Handled] Provider read error. Retrieving from fallback memory:', error);
      return await this.fallbackMemory.getMessages(this.namespace);
    }
  }

  /**
   * Retrieves pruned and token-optimized messages formatted for LLM invocation
   */
  public async getFormattedMessages(overrideOptions: StrategyOptions = {}): Promise<BaseMessage[]> {
    try {
      const rawMessages = await this.getRawMessages();
      const options: StrategyOptions = {
        ...this.defaultOptions,
        ...overrideOptions
      };

      return await this.strategy.prune(rawMessages, options);
    } catch (error) {
      console.error('[AgentMemory Exception Handled] Strategy pruning error. Returning raw messages as fallback:', error);
      const raw = await this.getRawMessages();
      return raw.slice(-10); // Emergency fallback: return last 10 messages
    }
  }

  /**
   * Calculates the estimated token count of raw or pruned messages
   */
  public async estimateTotalTokens(pruned: boolean = true): Promise<number> {
    const messages = pruned ? await this.getFormattedMessages() : await this.getRawMessages();
    return TokenCounter.estimateMessages(messages);
  }

  /**
   * Clears memory state for the active namespace
   */
  public async clear(): Promise<void> {
    try {
      await this.provider.clear(this.namespace);
      await this.fallbackMemory.clear(this.namespace);
    } catch (error) {
      console.error('[AgentMemory Exception Handled] Clear failed:', error);
    }
  }

  /**
   * Updates or switches the active namespace (sessionId / agentId)
   */
  public setNamespace(namespace: MemoryNamespace): void {
    if (namespace && namespace.sessionId) {
      this.namespace = { ...namespace };
    }
  }

  /**
   * Returns current active namespace
   */
  public getNamespace(): MemoryNamespace {
    return { ...this.namespace };
  }
}
