import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { ComplianceService } from "./compliance.service";
import { CreateComplianceRuleDto } from "./dto/create-compliance-rule.dto";
import { UpdateComplianceRuleDto } from "./dto/update-compliance-rule.dto";

/**
 * Routes per spec lines 835-836:
 *   GET|POST|PATCH /api/compliance-rules[/:id]  CAN_CHANGE_COMPLIANCE_CONFIG (read: CAN_VIEW_AUDIT_LOG)
 *   POST /api/compliance-rules/:id/review        CAN_CHANGE_COMPLIANCE_CONFIG
 */
@ApiTags("compliance-rules")
@Controller("compliance-rules")
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get()
  @RequirePermission("CAN_VIEW_AUDIT_LOG")
  list() {
    return this.complianceService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_AUDIT_LOG")
  getById(@Param("id") id: string) {
    return this.complianceService.getById(id);
  }

  @Post()
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  create(@Body() dto: CreateComplianceRuleDto) {
    return this.complianceService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  update(@Param("id") id: string, @Body() dto: UpdateComplianceRuleDto) {
    return this.complianceService.update(id, dto);
  }

  @Post(":id/review")
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  review(@Param("id") id: string, @CurrentActor() actor: AccessTokenPayload) {
    return this.complianceService.review(id, actor);
  }
}
