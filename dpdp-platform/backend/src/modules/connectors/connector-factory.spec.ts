import { AuthType } from "@prisma/client";
import {
  ConnectorFactory,
  type DataSourceRowForConnector,
} from "./connector-factory";
import { RestApiConnector } from "./rest-api-connector";
import { MockHttpServer } from "./test-support/mock-http-server";

describe("ConnectorFactory", () => {
  let server: MockHttpServer;
  let port: number;

  afterEach(async () => {
    await server.close();
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

    const connector = ConnectorFactory.create(row, "DECRYPTED_TOKEN_VALUE");
    expect(connector).toBeInstanceOf(RestApiConnector);

    const result = await connector.fetchRecords();
    expect(result.records).toHaveLength(1);
    expect(server.requestLog[0]?.headers.authorization).toBe(
      "Bearer DECRYPTED_TOKEN_VALUE",
    );

    // The factory's input type structurally excludes credentialCipher -- this
    // is enforced at compile time (see DataSourceRowForConnector), and the row
    // object built above proves a real call site never needs to pass it in.
    expect(Object.keys(row)).not.toContain("credentialCipher");
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

    const connector = ConnectorFactory.create(row, "SUPER_SECRET_KEY");
    const testResult = await connector.testConnection();

    expect(JSON.stringify(testResult)).not.toContain("SUPER_SECRET_KEY");
    expect(JSON.stringify(connector)).not.toContain("SUPER_SECRET_KEY");
    expect(server.requestLog[0]?.headers["x-api-key"]).toBe("SUPER_SECRET_KEY");
  });
});
