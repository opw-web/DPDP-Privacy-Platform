import { Logger } from "@nestjs/common";
import {
  defaultSleep,
  ReadOnlyHttpClient,
  ReadOnlyHttpMethodError,
  ReadOnlyHttpStatusError,
  ReadOnlyHttpTimeoutError,
  RETRY_BACKOFF_MS,
  stripQuery,
} from "./read-only-http.client";
import { MockHttpServer, jsonHandler } from "../test-support/mock-http-server";

describe("ReadOnlyHttpClient", () => {
  let server: MockHttpServer;
  let port: number;
  let url: string;

  beforeEach(async () => {
    server = new MockHttpServer(jsonHandler(200, { data: [] }));
    port = await server.listen();
    url = `http://127.0.0.1:${port}/records`;
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET-only guard (Check 3)", () => {
    it("throws for a POST and never opens a socket", async () => {
      const client = new ReadOnlyHttpClient();
      const connectionsBefore = server.connectionCount;
      const requestsBefore = server.requestLog.length;

      await expect(client.request({ method: "POST", url })).rejects.toThrow(
        ReadOnlyHttpMethodError,
      );

      // Give any accidental async connection attempt a chance to surface.
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(server.connectionCount - connectionsBefore).toBe(0);
      expect(server.requestLog.length - requestsBefore).toBe(0);
    });

    it("throws for PUT/PATCH/DELETE too, all with zero connections", async () => {
      const client = new ReadOnlyHttpClient();
      const connectionsBefore = server.connectionCount;

      for (const method of ["PUT", "PATCH", "DELETE"]) {
        await expect(client.request({ method, url })).rejects.toThrow(
          ReadOnlyHttpMethodError,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(server.connectionCount - connectionsBefore).toBe(0);
    });

    it("positive control: a GET to the same server DOES open a socket and reach the handler", async () => {
      const client = new ReadOnlyHttpClient();
      const connectionsBefore = server.connectionCount;

      await client.request({ method: "GET", url });

      expect(server.connectionCount - connectionsBefore).toBeGreaterThan(0);
      expect(server.requestLog.some((r) => r.method === "GET")).toBe(true);
    });
  });

  describe("retry policy", () => {
    // NOTE ON "USE FAKE TIMERS": jest's fake timers are built on
    // @sinonjs/fake-timers, which advances a simulated clock by monkeypatching
    // globalThis.setTimeout. Mixed with a REAL local HTTP server (required by
    // this project so tests never touch the demo server), advancing the fake
    // clock does not reliably interleave with the real socket I/O each retry
    // attempt performs -- verified empirically: it produced a real ~13s wall
    // clock wait here (backoff genuinely fired via the real setTimeout) and
    // the test still timed out. So instead of advancing a clock, the delay
    // FUNCTION itself is injected (see ReadOnlyHttpClient's constructor) --
    // this still lets the test assert the EXACT delays a real run would use
    // (1000, 3000, 9000) while resolving them instantly, which is strictly
    // stronger than counting attempts and just as fast as fake timers would
    // have been had they worked.
    it("retries a 500 three times with backoff 1000ms/3000ms/9000ms then fails (exactly 4 requests)", async () => {
      const recordedDelays: number[] = [];
      const instantSleep = (ms: number) => {
        recordedDelays.push(ms);
        return Promise.resolve();
      };
      server.setHandler(jsonHandler(500, { error: "boom" }));

      const client = new ReadOnlyHttpClient(instantSleep);
      await expect(client.request({ method: "GET", url })).rejects.toThrow(
        ReadOnlyHttpStatusError,
      );

      expect(server.requestLog.filter((r) => r.method === "GET").length).toBe(
        4,
      );
      expect(recordedDelays).toEqual([1000, 3000, 9000]);
    });

    it("does NOT retry a 401 -- exactly one request, fails immediately, with zero delay calls", async () => {
      const recordedDelays: number[] = [];
      const instantSleep = (ms: number) => {
        recordedDelays.push(ms);
        return Promise.resolve();
      };
      server.setHandler(jsonHandler(401, { error: "unauthorized" }));
      const client = new ReadOnlyHttpClient(instantSleep);

      await expect(client.request({ method: "GET", url })).rejects.toThrow(
        ReadOnlyHttpStatusError,
      );

      expect(server.requestLog.filter((r) => r.method === "GET").length).toBe(
        1,
      );
      expect(recordedDelays).toEqual([]);
    });

    it("does NOT retry a 301/302 either -- treated like a 4xx, not a transient server error", async () => {
      server.setHandler((_req, res) => {
        res.writeHead(302, { Location: "http://elsewhere.example/moved" });
        res.end();
      });
      const client = new ReadOnlyHttpClient(() => Promise.resolve());

      await expect(client.request({ method: "GET", url })).rejects.toThrow(
        ReadOnlyHttpStatusError,
      );
      expect(server.requestLog.filter((r) => r.method === "GET").length).toBe(
        1,
      );
    });

    it("control: a 500 without recovery still counts distinctly from a 401 (4 vs 1)", async () => {
      const instantSleep = () => Promise.resolve();
      server.setHandler(jsonHandler(500, { error: "boom" }));
      const client = new ReadOnlyHttpClient(instantSleep);

      await expect(client.request({ method: "GET", url })).rejects.toThrow(
        ReadOnlyHttpStatusError,
      );

      const fiveHundredCount = server.requestLog.filter(
        (r) => r.method === "GET",
      ).length;
      expect(fiveHundredCount).toBe(4);
      expect(fiveHundredCount).not.toBe(1);
    });

    it("succeeds without retrying when the first response is 200", async () => {
      server.setHandler(jsonHandler(200, { data: [] }));
      const client = new ReadOnlyHttpClient();

      await client.request({ method: "GET", url });

      expect(server.requestLog.filter((r) => r.method === "GET").length).toBe(
        1,
      );
    });

    it("the recorded delays are the SAME constant production retries use, not a coincidental literal", async () => {
      // Positive control for the two tests above: ties the assertion to the
      // real RETRY_BACKOFF_MS export (what requestWithRetry actually reads),
      // so a change to that constant would break this test too -- proving
      // "[1000, 3000, 9000]" above isn't an independently hardcoded literal
      // that happens to match by coincidence.
      const recordedDelays: number[] = [];
      const instantSleep = (ms: number) => {
        recordedDelays.push(ms);
        return Promise.resolve();
      };
      server.setHandler(jsonHandler(500, { error: "boom" }));
      const client = new ReadOnlyHttpClient(instantSleep);

      await expect(client.request({ method: "GET", url })).rejects.toThrow(
        ReadOnlyHttpStatusError,
      );

      expect(recordedDelays).toEqual([...RETRY_BACKOFF_MS]);
    });

    it("maxRetries: 0 makes exactly one attempt regardless of status", async () => {
      server.setHandler(jsonHandler(500, { error: "boom" }));
      const client = new ReadOnlyHttpClient(() => Promise.resolve());

      await expect(
        client.request({ method: "GET", url, maxRetries: 0 }),
      ).rejects.toThrow(ReadOnlyHttpStatusError);

      expect(server.requestLog.filter((r) => r.method === "GET").length).toBe(
        1,
      );
    });
  });

  describe("default sleepFn", () => {
    it("the default sleep function genuinely waits (not a no-op)", async () => {
      const start = Date.now();
      await defaultSleep(20);
      expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
  });

  describe("overall deadline (not an idle-socket timeout)", () => {
    it("aborts a response that keeps trickling data past the deadline, even though the socket stays active", async () => {
      server.setHandler((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        const interval = setInterval(() => {
          res.write(" ");
        }, 30);
        // Never call res.end(): the connection stays "active" via a steady
        // trickle for far longer than the deadline below. Clean up on close.
        res.on("close", () => clearInterval(interval));
      });

      const client = new ReadOnlyHttpClient(() => Promise.resolve());
      const start = Date.now();

      await expect(
        client.request({ method: "GET", url, timeoutMs: 150, maxRetries: 0 }),
      ).rejects.toThrow(ReadOnlyHttpTimeoutError);

      // Must fail close to the 150ms deadline, not linger for the trickle.
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });

  describe("logging never leaks query params or credentials", () => {
    it("strips the query string from logged URLs and never logs header values", async () => {
      const debugSpy = jest
        .spyOn(Logger.prototype, "debug")
        .mockImplementation(() => undefined);
      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      const secretUrl = `http://127.0.0.1:${port}/records?token=SUPER_SECRET_TOKEN&email=aman@example.com`;
      const client = new ReadOnlyHttpClient();
      await client.request({
        method: "GET",
        url: secretUrl,
        headers: { Authorization: "Bearer SUPER_SECRET_TOKEN" },
      });

      const logged = [...debugSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .join("\n");
      expect(logged).not.toContain("SUPER_SECRET_TOKEN");
      expect(logged).not.toContain("token=");
      expect(logged).not.toContain("email=");
      expect(logged).not.toContain("aman@example.com");
      // Positive control: the path itself IS logged, so the assertion above is
      // not vacuously true because nothing was logged at all.
      expect(logged).toContain("/records");

      debugSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("stripQuery", () => {
    it("removes query params but keeps origin + path", () => {
      expect(stripQuery("http://host.example/a/b?x=1&y=2")).toBe(
        "http://host.example/a/b",
      );
    });

    it("is a no-op-ish fallback for an unparseable string", () => {
      expect(stripQuery("not-a-url?x=1")).toBe("not-a-url");
    });
  });
});
