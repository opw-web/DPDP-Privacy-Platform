import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

/**
 * Forces real connection failures (closed ports) rather than mocking the
 * probes, so this exercises the same pg.Pool / ioredis error paths that a
 * genuine outage would hit — including the 'error' event listeners added
 * to prevent an unhandled-error crash on a dropped/reset connection.
 */
describe("Health (e2e) - degraded datastores", () => {
  let app: INestApplication;
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalRedisUrl = process.env["REDIS_URL"];

  beforeAll(async () => {
    // Port 1 is a privileged, never-listening port on any dev/CI host -
    // connections to it are refused immediately (ECONNREFUSED), simulating
    // a datastore that is down without depending on any real service.
    process.env["DATABASE_URL"] = "postgresql://dpdp:dpdp@127.0.0.1:1/dpdp";
    process.env["REDIS_URL"] = "redis://127.0.0.1:1";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env["DATABASE_URL"] = originalDatabaseUrl;
    process.env["REDIS_URL"] = originalRedisUrl;
  });

  it("GET /api/health returns 503 with a degraded status when datastores are unreachable", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "error",
      db: "down",
      redis: "down",
    });
  });
});
