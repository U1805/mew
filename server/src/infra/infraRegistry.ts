type ServiceType = string;

class InfraRegistry {
  private readonly connectionsByServiceType = new Map<ServiceType, Set<string>>();

  addConnection(serviceType: ServiceType, socketId: string) {
    const set = this.connectionsByServiceType.get(serviceType) ?? new Set<string>();
    set.add(socketId);
    this.connectionsByServiceType.set(serviceType, set);
  }

  removeConnection(serviceType: ServiceType, socketId: string) {
    const set = this.connectionsByServiceType.get(serviceType);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
      this.connectionsByServiceType.delete(serviceType);
    }
  }

  getOnlineCounts(): Record<ServiceType, number> {
    const out: Record<string, number> = {};
    for (const [serviceType, set] of this.connectionsByServiceType.entries()) {
      out[serviceType] = set.size;
    }
    return out;
  }

  isOnline(serviceType: ServiceType): boolean {
    return (this.connectionsByServiceType.get(serviceType)?.size ?? 0) > 0;
  }
}

export const infraRegistry = new InfraRegistry();

