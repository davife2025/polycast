"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResolverType = getResolverType;
function loadMap() {
    const raw = process.env.RESOLVER_TYPE_MAP;
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        const normalized = {};
        for (const [address, type] of Object.entries(parsed)) {
            normalized[address.toLowerCase()] = type;
        }
        return normalized;
    }
    catch (err) {
        console.warn("RESOLVER_TYPE_MAP is not valid JSON, ignoring:", err);
        return {};
    }
}
const resolverMap = loadMap();
function getResolverType(resolverAddress) {
    return resolverMap[resolverAddress.toLowerCase()] ?? "unknown";
}
//# sourceMappingURL=resolverType.js.map