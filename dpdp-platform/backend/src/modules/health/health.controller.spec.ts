import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;
  let healthService: jest.Mocked<HealthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getHealth: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
    healthService = module.get(HealthService);
  });

  it("returns 200 with the health payload when all datastores are up", async () => {
    healthService.getHealth.mockResolvedValue({
      status: "ok",
      db: "up",
      redis: "up",
      uptime: 12.3,
    });

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      db: "up",
      redis: "up",
      uptime: 12.3,
    });
  });

  it("throws a 503 ServiceUnavailableException reporting the degraded status when a probe fails", async () => {
    healthService.getHealth.mockResolvedValue({
      status: "error",
      db: "down",
      redis: "up",
      uptime: 12.3,
    });

    let caught: ServiceUnavailableException | undefined;
    try {
      await controller.check();
    } catch (error) {
      caught = error as ServiceUnavailableException;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect(caught?.getStatus()).toBe(503);
    expect(caught?.getResponse()).toMatchObject({
      status: "error",
      db: "down",
      redis: "up",
    });
  });
});
