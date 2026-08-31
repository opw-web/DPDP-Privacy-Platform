import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { HealthService, HealthStatus } from "./health.service";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "All datastores are reachable." })
  @ApiServiceUnavailableResponse({
    description: "One or more datastores are unreachable.",
  })
  async check(): Promise<HealthStatus> {
    const health = await this.healthService.getHealth();
    if (health.status === "error") {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
