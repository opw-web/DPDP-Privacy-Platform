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

export default (): { app: AppConfig } => ({
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
      process.env["ACCESS_LOG_RETENTION_DAYS"] ?? "365",
      10,
    ),
  },
});
