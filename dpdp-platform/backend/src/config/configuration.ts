import { ACCESS_LOG_RETENTION_FLOOR_DAYS } from "./access-log-retention.constant";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  encryptionKey: string;
  accessLogRetentionDays: number;
}

/** MVP 2: outbound mail (notices, consent requests, campaigns, breach
 * notifications) — MAIL_TRANSPORT chooses between real SMTP (MailHog in
 * dev) and a console-logging transport for environments with no mail
 * server at all. */
export interface MailConfig {
  transport: "smtp" | "console";
  host: string;
  port: number;
  from: string;
}

export default (): { app: AppConfig; mail: MailConfig } => ({
  app: {
    port: parseInt(process.env["PORT"] ?? "4000", 10),
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    databaseUrl: process.env["DATABASE_URL"] ?? "",
    redisUrl: process.env["REDIS_URL"] ?? "",
    jwtAccessSecret: process.env["JWT_ACCESS_SECRET"] ?? "",
    jwtRefreshSecret: process.env["JWT_REFRESH_SECRET"] ?? "",
    encryptionKey: process.env["ENCRYPTION_KEY"] ?? "",
    accessLogRetentionDays: parseInt(
      process.env["ACCESS_LOG_RETENTION_DAYS"] ??
        String(ACCESS_LOG_RETENTION_FLOOR_DAYS),
      10,
    ),
  },
  mail: {
    transport: (process.env["MAIL_TRANSPORT"] ?? "console") as
      | "smtp"
      | "console",
    host: process.env["MAIL_HOST"] ?? "",
    port: parseInt(process.env["MAIL_PORT"] ?? "1025", 10),
    from: process.env["MAIL_FROM"] ?? "",
  },
});
