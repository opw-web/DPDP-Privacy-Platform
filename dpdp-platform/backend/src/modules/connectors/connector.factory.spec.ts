import { AuthType } from "@prisma/client";
import {
  ConnectorFactory,
  type DataSourceRowForConnector,
} from "./connector.factory";
import { RestApiConnector } from "./rest-api.connector";
import { MockHttpServer } from "./test-support/mock-http-server";

describe("ConnectorFactory", () => {
  let server: MockHttpServer;
  let port: number;
  let factory: ConnectorFactory;

  beforeEach(() => {
    factory = new ConnectorFactory();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("is injectable (instance method, not static) so Task 12 can use constructor DI instead of jest.spyOn(Class, method)", () => {
    // A static factory forces callers to reach for jest.spyOn(ConnectorFactory,
    // 'create') to substitute it in a test -- exactly the "green for the wrong
    // reason" pattern this project has been burned by before. An instance
    // method on an @Injectable() class lets Task 12 inject a test double via
    // its constructor instead.
    expect(typeof factory.create).toBe("function");
    expect(typeof ConnectorFactory.prototype.create).toBe("function");
  });

  it("builds a RestApiConnector from a data source row + a separately-supplied decrypted credential", async () => {
    server = new MockHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: 1 }] }));
    });
    port = await server.listen();

    const row: DataSourceRowForConnector = {
      name: "Factory CRM",
      baseUrl: `http://127.0.0.1:${port}/records`,
      recordsPath: "data",
      externalIdField: "id",
      authType: AuthType.BEARER,
      paginationStyle: "PAGE",
      pageSize: 10,
      supportsIncremental: false,
      incrementalParam: null,
    };

    const connector = factory.create(row, "DECRYPTED_TOKEN_VALUE");
    expect(connector).toBeInstanceOf(RestApiConnector);

    const result = await connector.fetchRecords();
    expect(result.records).toHaveLength(1);
    expect(server.requestLog[0]?.headers.authorization).toBe(
      "Bearer DECRYPTED_TOKEN_VALUE",
    );
  });

  it("never logs or returns the decrypted credential it was given", async () => {
    server = new MockHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });
    port = await server.listen();

    const row: DataSourceRowForConnector = {
      name: "Silent CRM",
      baseUrl: `http://127.0.0.1:${port}/records`,
      recordsPath: "data",
      externalIdField: "id",
      authType: AuthType.API_KEY_HEADER,
      paginationStyle: "PAGE",
      pageSize: 10,
      supportsIncremental: false,
      incrementalParam: null,
    };

    const connector = factory.create(row, "SUPER_SECRET_KEY");
    const testResult = await connector.testConnection();

    expect(JSON.stringify(testResult)).not.toContain("SUPER_SECRET_KEY");
    expect(JSON.stringify(connector)).not.toContain("SUPER_SECRET_KEY");
    expect(server.requestLog[0]?.headers["x-api-key"]).toBe("SUPER_SECRET_KEY");
  });
});
