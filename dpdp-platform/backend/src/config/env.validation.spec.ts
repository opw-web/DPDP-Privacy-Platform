import "reflect-metadata";
import { validate } from "./env.validation";
import { ACCESS_LOG_RETENTION_FLOOR_DAYS } from "./access-log-retention.constant";

/**
 * Task 7 gate (Check 15 / Rule 6(1)(e)): the app must refuse to start
 * when `ACCESS_LOG_RETENTION_DAYS` is configured below the legal floor.
 * `validate()` is exactly what `ConfigModule.forRoot({ validate })`
 * (see `AppModule`) calls during `NestFactory.create()` -- a thrown error
 * here IS "the application refuses to start", without needing to spin up
 * a full Nest app and a real Postgres connection just to prove a
 * synchronous validation function throws.
 */
describe("env.validation -- ACCESS_LOG_RETENTION_DAYS floor", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "x".repeat(32),
    JWT_REFRESH_SECRET: "y".repeat(32),
    ENCRYPTION_KEY: "some-key",
    PORT: "4000",
    NODE_ENV: "test",
    CORS_ORIGIN: "http://localhost:5173",
    // MVP 2: required by env.validation.ts's MAIL_* fields, added here so
    // this fixture stays valid against every other field it does not test.
    MAIL_TRANSPORT: "console",
    MAIL_HOST: "localhost",
    MAIL_PORT: "1025",
    MAIL_FROM: "Acme Privacy <privacy@acmeretail.demo>",
  };

  it("rejects 90 days, naming the variable, the configured value, and the floor", () => {
    expect(() =>
      validate({ ...baseEnv, ACCESS_LOG_RETENTION_DAYS: "90" }),
    ).toThrow(/ACCESS_LOG_RETENTION_DAYS/);

    try {
      validate({ ...baseEnv, ACCESS_LOG_RETENTION_DAYS: "90" });
      fail("validate() should have thrown for ACCESS_LOG_RETENTION_DAYS=90");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("ACCESS_LOG_RETENTION_DAYS");
      expect(message).toContain("90"); // the configured value
      expect(message).toContain(String(ACCESS_LOG_RETENTION_FLOOR_DAYS)); // the floor
      expect(message).toMatch(/6\(1\)\(e\)/); // why: the legal source
    }
  });

  it("rejects 364 (one day below the floor)", () => {
    expect(() =>
      validate({ ...baseEnv, ACCESS_LOG_RETENTION_DAYS: "364" }),
    ).toThrow();
  });

  it("accepts exactly the floor value (365)", () => {
    expect(() =>
      validate({
        ...baseEnv,
        ACCESS_LOG_RETENTION_DAYS: String(ACCESS_LOG_RETENTION_FLOOR_DAYS),
      }),
    ).not.toThrow();
  });

  it("accepts a value above the floor (raising retention is always allowed)", () => {
    expect(() =>
      validate({ ...baseEnv, ACCESS_LOG_RETENTION_DAYS: "3650" }),
    ).not.toThrow();
  });
});
