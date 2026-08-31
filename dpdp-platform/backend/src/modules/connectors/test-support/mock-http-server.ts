import * as http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A local HTTP server for connector tests. Never a fixture server from any
 * other project directory -- these tests must keep passing even if every
 * sibling directory next to this backend were deleted.
 *
 * `connectionCount` increments on every raw TCP connection accepted by the
 * server, independent of whether a request is ever sent on it -- this is
 * what lets a test prove "no socket was opened" rather than merely "no
 * response was received".
 */
export class MockHttpServer {
  private readonly server: http.Server;
  connectionCount = 0;
  requestLog: {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
  }[] = [];

  private handler: http.RequestListener;
  private closed = false;

  constructor(initialHandler: http.RequestListener) {
    this.handler = initialHandler;
    this.server = http.createServer((req, res) => {
      this.requestLog.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
      });
      this.handler(req, res);
    });
    this.server.on("connection", () => {
      this.connectionCount += 1;
    });
  }

  setHandler(handler: http.RequestListener): void {
    this.handler = handler;
  }

  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        resolve((this.server.address() as AddressInfo).port);
      });
    });
  }

  close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

export function jsonHandler(
  status: number,
  body: unknown,
): http.RequestListener {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
}
