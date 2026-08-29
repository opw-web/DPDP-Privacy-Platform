import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  MinLength,
  validateSync,
} from "class-validator";
import { plainToInstance, Type } from "class-transformer";

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32, {
    message: "JWT_ACCESS_SECRET must be at least 32 characters long",
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: "JWT_REFRESH_SECRET must be at least 32 characters long",
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty({
    message: "ENCRYPTION_KEY must be set (openssl rand -base64 32)",
  })
  ENCRYPTION_KEY!: string;

  @Type(() => Number)
  @IsInt()
  @Min(365, {
    message:
      "ACCESS_LOG_RETENTION_DAYS must never be set below the 365 day floor",
  })
  ACCESS_LOG_RETENTION_DAYS!: number;

  @Type(() => Number)
  @IsInt()
  PORT!: number;

  @IsIn(["development", "test", "production"])
  NODE_ENV!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join("; "))
      .join(" | ");
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
}
