import { Test } from "@nestjs/testing";
import { ConnectorFactory } from "./connector.factory";
import { ConnectorsModule } from "./connectors.module";

describe("ConnectorsModule", () => {
  it("actually resolves ConnectorFactory through Nest's DI container, not just a decorator on the class", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConnectorsModule],
    }).compile();

    const factory = moduleRef.get(ConnectorFactory);
    expect(factory).toBeInstanceOf(ConnectorFactory);

    await moduleRef.close();
  });
});
