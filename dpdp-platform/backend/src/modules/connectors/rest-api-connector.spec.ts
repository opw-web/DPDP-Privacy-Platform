import { AuthType } from "@prisma/client";
import { ReadOnlyHttpClient } from "./read-only-http-client";
import {
  RestApiConnector,
  type RestApiConnectorConfig,
} from "./rest-api-connector";
import { MockHttpServer } from "./test-support/mock-http-server";

/** A ReadOnlyHttpClient whose retry backoff resolves instantly, for tests that need to exercise a failure path without waiting out real retry delays. */
function instantRetryClient(): ReadOnlyHttpClient {
  return new ReadOnlyHttpClient(() => Promise.resolve());
}

function baseConfig(
  baseUrl: string,
  overrides: Partial<RestApiConnectorConfig> = {},
): RestApiConnectorConfig {
  return {
    name: "Test CRM",
    baseUrl,
    recordsPath: "data",
    externalIdField: "id",
    authType: AuthType.BEARER,
    credential: "THE_SECRET_TOKEN",
    paginationStyle: "PAGE",
    pageSize: 5,
    supportsIncremental: false,
    incrementalParam: null,
    ...overrides,
  };
}

describe("RestApiConnector", () => {
  let server: MockHttpServer;
  let port: number;
  let baseUrl: string;

  afterEach(async () => {
    await server.close();
  });

  describe("discoverSchema", () => {
    it("unions keys across the first 20 records only and truncates a 200-char sample to 40", async () => {
      const longValue = "x".repeat(200);
      const records = Array.from({ length: 25 }, (_, i) => {
        const record: Record<string, unknown> = { id: i };
        if (i === 0) record.longField = longValue;
        if (i % 2 === 0) record.evenField = `even-${i}`;
        if (i >= 20) record.onlyInTail = "should-not-appear";
        return record;
      });

      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: records }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, { pageSize: 100 }),
      );
      const schema = await connector.discoverSchema();
      const byName = Object.fromEntries(schema.map((f) => [f.fieldName, f]));

      expect(byName.id).toBeDefined();
      expect(byName.id?.inferredType).toBe("number");

      expect(byName.longField).toBeDefined();
      expect(byName.longField?.sampleValue).toHaveLength(40);
      expect(byName.longField?.sampleValue).toBe(longValue.slice(0, 40));
      expect(byName.longField?.inferredType).toBe("string");

      expect(byName.evenField).toBeDefined();

      // The union must come from only the first 20 records.
      expect(byName.onlyInTail).toBeUndefined();
    });

    it("infers boolean, date and null types", async () => {
      const records = [
        { active: true, joinedAt: "2024-01-15T00:00:00Z", missing: null },
      ];
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: records }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, { pageSize: 100 }),
      );
      const schema = await connector.discoverSchema();
      const byName = Object.fromEntries(schema.map((f) => [f.fieldName, f]));

      expect(byName.active?.inferredType).toBe("boolean");
      expect(byName.joinedAt?.inferredType).toBe("date");
      expect(byName.missing?.inferredType).toBe("null");
      expect(byName.missing?.sampleValue).toBeNull();
    });
  });

  describe("pagination", () => {
    it("stops on a short page and exposes nextCursor only while pages are full", async () => {
      const pageSize = 3;
      server = new MockHttpServer((req, res) => {
        const url = new URL(req.url ?? "", "http://x");
        const page = Number(url.searchParams.get("page"));
        const body = page === 1 ? [1, 2, 3] : [4, 5]; // page 2 is short
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: body.map((n) => ({ id: n })) }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(baseConfig(baseUrl, { pageSize }));

      const page1 = await connector.fetchRecords();
      expect(page1.records).toHaveLength(3);
      expect(page1.nextCursor).toBe("2");

      const page2 = await connector.fetchRecords(page1.nextCursor);
      expect(page2.records).toHaveLength(2);
      expect(page2.nextCursor).toBeUndefined();
    });

    it("allows page 500 but fails loudly, naming the source, at page 501 -- with zero extra requests", async () => {
      const pageSize = 2;
      server = new MockHttpServer((_req, res) => {
        // Always returns a FULL page, so nothing but the hard cap ever stops it.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: 1 }, { id: 2 }] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, { pageSize, name: "Cap Test Source" }),
      );

      const page500 = await connector.fetchRecords("500");
      expect(page500.nextCursor).toBe("501");
      const requestsAfter500 = server.requestLog.length;

      await expect(connector.fetchRecords("501")).rejects.toThrow(
        /Cap Test Source/,
      );
      await expect(connector.fetchRecords("501")).rejects.toThrow(
        /500-page hard cap/,
      );

      // The 501st page must be refused WITHOUT making a network call.
      expect(server.requestLog.length).toBe(requestsAfter500);
    });
  });

  describe("fetchChanges", () => {
    it("uses incrementalParam with an ISO timestamp when supportsIncremental is true", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, {
          supportsIncremental: true,
          incrementalParam: "updated_since",
        }),
      );
      const since = new Date("2026-01-01T00:00:00.000Z");
      await connector.fetchChanges(since);

      expect(server.requestLog).toHaveLength(1);
      expect(server.requestLog[0]?.url).toContain(
        "updated_since=2026-01-01T00%3A00%3A00.000Z",
      );
    });

    it("falls back to a full fetchRecords() pass when supportsIncremental is false", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, { supportsIncremental: false }),
      );
      await connector.fetchChanges(new Date());

      expect(server.requestLog).toHaveLength(1);
      expect(server.requestLog[0]?.url).not.toContain("updated_since");
      expect(server.requestLog[0]?.url).toContain("page=1");
    });
  });

  describe("testConnection", () => {
    it("reports ok:true with a latency on success", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(baseConfig(baseUrl));

      const result = await connector.testConnection();
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("never throws on a 401 -- reports ok:false with a message instead", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(baseConfig(baseUrl));

      await expect(connector.testConnection()).resolves.toMatchObject({
        ok: false,
      });
      const result = await connector.testConnection();
      expect(result.message).toMatch(/401/);
    });

    it("never throws on connection refused (nothing listening)", async () => {
      // Bind and immediately close to get a guaranteed-free port with nothing listening.
      server = new MockHttpServer((_req, res) => res.end());
      const deadPort = await server.listen();
      await server.close();

      const connector = new RestApiConnector(
        baseConfig(`http://127.0.0.1:${deadPort}/records`),
        instantRetryClient(),
      );
      const result = await connector.testConnection();
      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe("string");
    });
  });

  describe("credential containment", () => {
    it("sends the credential as an Authorization header but never exposes it via serialization", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(
        baseConfig(baseUrl, { credential: "ROTATE_ME_SECRET" }),
      );

      await connector.fetchRecords();
      expect(server.requestLog[0]?.headers.authorization).toBe(
        "Bearer ROTATE_ME_SECRET",
      );

      // Positive control: the credential really is a distinguishable literal
      // (not e.g. undefined), so the negative checks below are meaningful.
      expect("ROTATE_ME_SECRET").toHaveLength(16);

      expect(JSON.stringify(connector)).not.toContain("ROTATE_ME_SECRET");
      expect(Object.keys(connector)).not.toContain("credential");
      const result = await connector.testConnection();
      expect(JSON.stringify(result)).not.toContain("ROTATE_ME_SECRET");
      const schema = await connector.discoverSchema();
      expect(JSON.stringify(schema)).not.toContain("ROTATE_ME_SECRET");
    });

    it("builds Basic auth headers by base64-encoding the credential", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(
        baseConfig(baseUrl, {
          authType: AuthType.BASIC,
          credential: "user:pass",
        }),
      );
      await connector.fetchRecords();
      const expected = `Basic ${Buffer.from("user:pass").toString("base64")}`;
      expect(server.requestLog[0]?.headers.authorization).toBe(expected);
    });

    it("sends no Authorization header when authType is NONE", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(
        baseConfig(baseUrl, { authType: AuthType.NONE, credential: null }),
      );
      await connector.fetchRecords();
      expect(server.requestLog[0]?.headers.authorization).toBeUndefined();
    });
  });
});
