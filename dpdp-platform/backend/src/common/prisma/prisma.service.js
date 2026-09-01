"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const tenant_extension_1 = require("../tenant/tenant.extension");
// `ReturnType<PrismaClient["$extends"]>` collapses to `unknown` because
// `$extends` is generic and there is no call site to resolve the generic
// against. Routing the call through this helper -- called with a concrete,
// already-typed `PrismaClient` and the concrete `tenantScopingExtension` --
// gives TypeScript a real call to infer the return type from, so
// `PrismaService.scoped` below (and everyone who calls it) gets full,
// per-model typing instead of `unknown`.
function extendWithTenantScoping(client) {
    return client.$extends(tenant_extension_1.tenantScopingExtension);
}
/**
 * Raw Prisma client wired into Nest's lifecycle, plus the tenant-scoped
 * client services actually use.
 *
 * `PrismaService` itself owns only the connection lifecycle and stays
 * unextended: code that must bypass tenant scoping — migrations, seeding,
 * the extension's own internals — injects `PrismaService` directly and
 * gets the raw client.
 *
 * `PrismaService.scoped` is the org-scoped client (built once, lazily, by
 * `$extends(tenantScopingExtension)`) that every service injects day to
 * day. It never accepts `organizationId` as an argument — the current
 * tenant comes from `TenantContext`, which the extension reads on every
 * query. See `src/common/tenant/tenant.extension.ts`.
 */
let PrismaService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = client_1.PrismaClient;
    var PrismaService = _classThis = class extends _classSuper {
        constructor() {
            // Opt-in query events keep production logging unchanged while allowing
            // performance tests to count the exact SQL issued by one endpoint.
            // Task 20 uses PRISMA_QUERY_LOG=1; it is intentionally not a query
            // result logger and does not expose bound personal-data parameters.
            super(process.env["PRISMA_QUERY_LOG"] === "1"
                ? { log: [{ emit: "event", level: "query" }] }
                : {});
            this.logger = new common_1.Logger(PrismaService.name);
        }
        /** The tenant-scoped client. Services inject `PrismaService` and call `.scoped`. */
        get scoped() {
            this.scopedClient ??= extendWithTenantScoping(this);
            return this.scopedClient;
        }
        async onModuleInit() {
            // Connect eagerly so failures surface at startup logs rather than on
            // the first request — but don't let a datastore that is briefly down
            // take the whole Nest bootstrap down with it. The health check (and
            // Prisma's own lazy reconnect-on-next-query behaviour) is what reports
            // and recovers from a database that isn't reachable yet.
            try {
                await this.$connect();
                this.logger.log("Prisma client connected");
            }
            catch (error) {
                this.logger.warn(`Prisma client failed to connect on startup: ${error.message}`);
            }
        }
        async onModuleDestroy() {
            await this.$disconnect();
        }
    };
    __setFunctionName(_classThis, "PrismaService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PrismaService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PrismaService = _classThis;
})();
exports.PrismaService = PrismaService;
//# sourceMappingURL=prisma.service.js.map