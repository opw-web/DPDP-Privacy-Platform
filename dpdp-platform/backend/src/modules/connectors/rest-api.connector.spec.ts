import { AuthType } from "@prisma/client";
import { ReadOnlyHttpClient } from "./http/read-only-http.client";
import {
  InvalidCursorError,
  PageCapExceededError,
  RestApiConnector,
  UnsupportedPaginationStyleError,
  type RestApiConnectorConfig,
} from "./rest-api.connector";
import { MockHttpServer } from "./test-support/mock-http-server";

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

  describe("constructor validation", () => {
    it("throws UnsupportedPaginationStyleError for anything other than PAGE", async () => {
      server = new MockHttpServer((_req, res) => res.end());
      port = await server.listen();
      expect(
        () =>
          new RestApiConnector(
            baseConfig(`http://127.0.0.1:${port}/x`, {
              paginationStyle: "CURSOR",
            }),
          ),
      ).toThrow(UnsupportedPaginationStyleError);
    });
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

    it("JSON.stringify's an object/array sample instead of showing '[object Object]'", async () => {
      const records = [{ address: { city: "Pune", pin: "411001" } }];
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

      expect(byName.address?.sampleValue).not.toContain("[object Object]");
      expect(byName.address?.sampleValue).toContain("Pune");
    });
  });

  describe("pagination", () => {
    it("stops on a short page and exposes nextCursor only while pages are full", async () => {
      const pageSize = 3;
      server = new MockHttpServer((req, res) => {
        const reqUrl = new URL(req.url ?? "", "http://x");
        const page = Number(reqUrl.searchParams.get("page"));
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

    it("allows page 500 but fails loudly with a typed error naming the source, at page 501 -- with zero extra requests", async () => {
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
        PageCapExceededError,
      );
      await expect(connector.fetchRecords("501")).rejects.toThrow(
        /Cap Test Source/,
      );

      // The 501st page must be refused WITHOUT making a network call.
      expect(server.requestLog.length).toBe(requestsAfter500);
    });

    it("rejects an unparseable cursor with InvalidCursorError instead of silently sending page=NaN", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(baseConfig(baseUrl));

      const requestsBefore = server.requestLog.length;
      await expect(connector.fetchRecords("not-a-number")).rejects.toThrow(
        InvalidCursorError,
      );
      // No network call should be made for a cursor that can't even be decoded.
      expect(server.requestLog.length).toBe(requestsBefore);
    });

    it("rejects a garbage JSON-shaped cursor (e.g. from bit-rot) rather than coercing it to NaN", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(baseConfig(baseUrl));

      await expect(connector.fetchRecords('{"page":"abc"}')).rejects.toThrow(
        InvalidCursorError,
      );
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

    it("keeps the incremental filter applied on page 2+ via the cursor, instead of silently dropping it", async () => {
      const pageSize = 2;
      server = new MockHttpServer((req, res) => {
        const reqUrl = new URL(req.url ?? "", "http://x");
        const page = Number(reqUrl.searchParams.get("page"));
        // Full page 1 and 2, short page 3, so a second AND third fetch happen.
        const body =
          page === 3
            ? [{ id: 5 }]
            : [{ id: page * 10 + 1 }, { id: page * 10 + 2 }];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: body }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;

      const connector = new RestApiConnector(
        baseConfig(baseUrl, {
          pageSize,
          supportsIncremental: true,
          incrementalParam: "updated_since",
        }),
      );

      const page1 = await connector.fetchChanges(
        new Date("2026-01-01T00:00:00.000Z"),
      );
      expect(page1.nextCursor).toBeDefined();

      const page2 = await connector.fetchRecords(page1.nextCursor);
      expect(page2.nextCursor).toBeDefined();

      const page3 = await connector.fetchRecords(page2.nextCursor);
      expect(page3.nextCursor).toBeUndefined();

      // ALL THREE requests must carry the incremental filter -- this is the
      // exact bug being fixed: page 2 previously dropped it entirely.
      for (const entry of server.requestLog) {
        expect(entry.url).toContain(
          "updated_since=2026-01-01T00%3A00%3A00.000Z",
        );
      }
      expect(server.requestLog).toHaveLength(3);
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

    it("never throws on connection refused, and does NOT wait out any retry backoff (fast, no-retry ping)", async () => {
      // Bind and immediately close to get a guaranteed-free port with nothing listening.
      server = new MockHttpServer((_req, res) => res.end());
      const deadPort = await server.listen();
      await server.close();

      const connector = new RestApiConnector(
        baseConfig(`http://127.0.0.1:${deadPort}/records`),
      );
      const start = Date.now();
      const result = await connector.testConnection();

      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe("string");
      // A retried connector (1 + 3 attempts with 1s/3s/9s backoff) would take
      // >13s here; testConnection's ping path must not retry at all.
      expect(Date.now() - start).toBeLessThan(2000);
    });

    it("requests limit=1, not a full page, to avoid pulling real records into memory just to check reachability", async () => {
      server = new MockHttpServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: 1 }] }));
      });
      port = await server.listen();
      baseUrl = `http://127.0.0.1:${port}/records`;
      const connector = new RestApiConnector(
        baseConfig(baseUrl, { pageSize: 100 }),
      );

      await connector.testConnection();

      expect(server.requestLog[0]?.url).toContain("limit=1");
      expect(server.requestLog[0]?.url).not.toContain("limit=100");
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

      expect(JSON.stringify(connector)).not.toContain("ROTATE_ME_SECRET");
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

  describe("dependency injection of the HTTP client", () => {
    it("accepts an injected ReadOnlyHttpClient (used by other tests to skip real retry delays)", async () => {
      server = new MockHttpServer((_req, res) => res.end());
      port = await server.listen();
      const client = new ReadOnlyHttpClient(() => Promise.resolve());
      const connector = new RestApiConnector(
        baseConfig(`http://127.0.0.1:${port}/records`),
        client,
      );
      expect(connector).toBeInstanceOf(RestApiConnector);
    });
  });
});
