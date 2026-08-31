import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  MinLength,
  ValidationArguments,
  validateSync,
} from "class-validator";
import { plainToInstance, Type } from "class-transformer";
import { ACCESS_LOG_RETENTION_FLOOR_DAYS } from "./access-log-retention.constant";

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

  // Rule 6(1)(e): access logs must be retained at least one year. The
  // floor value lives ONLY in `ACCESS_LOG_RETENTION_FLOOR_DAYS` -- this
  // decorator and the message below both reference it rather than
  // re-typing `365`. The message is a function (not a static string) so
  // the thrown error names the ACTUAL configured value, not just the
  // floor -- required by the task brief and Check 15.
  @Type(() => Number)
  @IsInt()
  @Min(ACCESS_LOG_RETENTION_FLOOR_DAYS, {
    message: (args: ValidationArguments) =>
      `ACCESS_LOG_RETENTION_DAYS is set to ${String(args.value)} day(s), ` +
      `which is below the ${ACCESS_LOG_RETENTION_FLOOR_DAYS}-day floor ` +
      "required by Rule 6(1)(e) of the DPDP Rules (access/visibility " +
      "records must be retained for at least one year) -- refusing to start.",
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

  // MVP 2: outbound mail. `smtp` talks to a real server (MailHog in dev);
  // `console` logs the rendered message instead of sending it.
  @IsIn(["smtp", "console"])
  MAIL_TRANSPORT!: string;

  @IsString()
  @IsNotEmpty()
  MAIL_HOST!: string;

  @Type(() => Number)
  @IsInt()
  MAIL_PORT!: number;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM!: string;
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
