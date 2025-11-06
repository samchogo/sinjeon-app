type ScanResult = { id: string; code: string };

type EventMap = {
  SCAN_RESULT: ScanResult;
  CONTACT_PICKED: { id: string; name: string; number: string };
};

class SimpleEventBus {
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void) {
    const arr = this.listeners[event] || (this.listeners[event] = []);
    arr.push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void) {
    const arr = this.listeners[event];
    if (!arr) return;
    const idx = arr.indexOf(listener as any);
    if (idx >= 0) arr.splice(idx, 1);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    const arr = this.listeners[event];
    if (!arr) return;
    // copy to avoid mutation issues
    [...arr].forEach((fn) => {
      try { fn(payload as any); } catch {}
    });
  }
}

export const eventBus = new SimpleEventBus();


