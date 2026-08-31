import { BaseMessage } from '../interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from '../interfaces/provider.interface';

export class InMemoryProvider implements IMemoryProvider {
  private store: Map<string, BaseMessage[]> = new Map();

  private getStorageKey(namespace: MemoryNamespace): string {
    const agentScope = namespace.agentId ? `:${namespace.agentId}` : '';
    return `${namespace.sessionId}${agentScope}`;
  }

  public async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
    const key = this.getStorageKey(namespace);
    const existing = this.store.get(key) || [];

    const enrichedMessage: BaseMessage = {
      ...message,
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: message.createdAt || Date.now()
    };

    existing.push(enrichedMessage);
    this.store.set(key, existing);
  }

  public async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
    const key = this.getStorageKey(namespace);
    const messages = this.store.get(key) || [];
    return [...messages];
  }

  public async clear(namespace: MemoryNamespace): Promise<void> {
    const key = this.getStorageKey(namespace);
    this.store.delete(key);
  }

  public async deleteMessage(namespace: MemoryNamespace, messageId: string): Promise<boolean> {
    const key = this.getStorageKey(namespace);
    const messages = this.store.get(key);
    if (!messages) return false;

    const initialLength = messages.length;
    const filtered = messages.filter(m => m.id !== messageId);
    this.store.set(key, filtered);
    return filtered.length < initialLength;
  }
}
