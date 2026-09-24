/** Owns in-flight requests as well as fulfilled values; failures remain retryable. */
export class PromiseCache<T> {
  private readonly entries = new Map<string, Promise<T>>();

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const pending = Promise.resolve()
      .then(load)
      .catch((error: unknown) => {
        if (this.entries.get(key) === pending) this.entries.delete(key);
        throw error;
      });
    this.entries.set(key, pending);
    return pending;
  }

  clear(dispose?: (value: T) => void): void {
    for (const pending of this.entries.values()) {
      if (dispose) void pending.then(dispose, () => undefined);
    }
    this.entries.clear();
  }
}
