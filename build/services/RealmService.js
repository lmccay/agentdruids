"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealmService = void 0;
class RealmService {
    constructor() {
        this.realms = new Map();
    }
    async createRealm(request) {
        const realm = {
            id: request.id || `realm-${Date.now()}`,
            name: request.name,
            description: request.description,
            agentIds: []
        };
        this.realms.set(realm.id, realm);
        return realm;
    }
    async getRealm(realmId) {
        return this.realms.get(realmId) || null;
    }
    async listRealms(filters) {
        let results = Array.from(this.realms.values());
        if (filters) {
            if (filters.type)
                results = results.filter((r) => r.type === filters.type);
            if (filters.agentId)
                results = results.filter((r) => r.agentIds?.includes(filters.agentId));
        }
        return results;
    }
    async getRealms() {
        return this.listRealms();
    }
    async updateRealm(realmId, updates) {
        const realm = this.realms.get(realmId);
        if (!realm) {
            throw new Error(`Realm not found: ${realmId}`);
        }
        // Apply updates to the realm
        Object.assign(realm, updates);
        this.realms.set(realmId, realm);
        return realm;
    }
}
exports.RealmService = RealmService;
