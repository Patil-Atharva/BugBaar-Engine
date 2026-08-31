import { BaseMessage } from '../interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from '../interfaces/provider.interface';
import { InMemoryProvider } from './in-memory.provider';

export interface RedisOptions {
  host?: string;
  port?: number;
  keyPrefix?: string;
  client?: any; // Generic duck-typing for ioredis / node-redis
}

export class RedisProvider implements IMemoryProvider {
  private fallbackProvider: InMemoryProvider;
  private client: any;
  private keyPrefix: string;
  private isConnected: boolean = false;

  constructor(options: RedisOptions = {}) {
    this.fallbackProvider = new InMemoryProvider();
    this.keyPrefix = options.keyPrefix || 'bugbaar:memory:';
    this.client = options.client || null;

    if (this.client) {
      this.isConnected = true;
    }
  }

  private getStorageKey(namespace: MemoryNamespace): string {
    const agentScope = namespace.agentId ? `:${namespace.agentId}` : '';
    return `${this.keyPrefix}${namespace.sessionId}${agentScope}`;
  }

  public async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
    if (!this.isConnected || !this.client) {
      return this.fallbackProvider.saveMessage(namespace, message);
    }

    try {
      const key = this.getStorageKey(namespace);
      const enrichedMessage: BaseMessage = {
        ...message,
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: message.createdAt || Date.now()
      };
      await this.client.rpush(key, JSON.stringify(enrichedMessage));
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis save failed. Falling back to InMemoryProvider:', error);
      await this.fallbackProvider.saveMessage(namespace, message);
    }
  }

  public async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
    if (!this.isConnected || !this.client) {
      return this.fallbackProvider.getMessages(namespace);
    }

    try {
      const key = this.getStorageKey(namespace);
      const rawMessages: string[] = await this.client.lrange(key, 0, -1);
      return rawMessages.map(item => JSON.parse(item));
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis get failed. Falling back to InMemoryProvider:', error);
      return this.fallbackProvider.getMessages(namespace);
    }
  }

  public async clear(namespace: MemoryNamespace): Promise<void> {
    if (!this.isConnected || !this.client) {
      return this.fallbackProvider.clear(namespace);
    }

    try {
      const key = this.getStorageKey(namespace);
      await this.client.del(key);
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis clear failed. Falling back to InMemoryProvider:', error);
      await this.fallbackProvider.clear(namespace);
    }
  }
}
