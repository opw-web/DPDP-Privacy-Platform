import { ApiProperty } from "@nestjs/swagger";
import { EmployeeStatus } from "@prisma/client";

/**
 * Nested role summary returned by `GET /api/auth/employee/me`. Deliberately
 * does NOT include a role-name field the frontend could compare against
 * (`if (user.role === 'DPO')` is forbidden project-wide) -- `code`/`name`
 * are for display only; `EmployeeMeResponseDto.permissions` below is the
 * only field an authorization decision may be based on.
 */
export class EmployeeMeRoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

/**
 * Response shape for `GET /api/auth/employee/me`.
 *
 * `permissions` is the actor's resolved permission-code set -- the SAME
 * codes, resolved the SAME way (the employee's `role.permissions`
 * relation, read fresh from Postgres), that `PermissionsGuard` checks
 * `@RequirePermission('CAN_X')` against on every other route. It exists so
 * the frontend's `<PermissionGate permission="CAN_X">` has something to
 * gate on besides the role name, which authorization logic must never
 * compare (see `EmployeeMeRoleDto`'s docstring). Never hand-maintain this
 * list against the guard's own resolution -- both must read
 * `role.permissions` off the same `Employee` row.
 */
export class EmployeeMeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ enum: EmployeeStatus })
  status!: EmployeeStatus;

  @ApiProperty({ type: EmployeeMeRoleDto })
  role!: EmployeeMeRoleDto;

  @ApiProperty({
    type: [String],
    description:
      "The actor's resolved permission codes -- exactly what PermissionsGuard would allow @RequirePermission('CAN_X') routes to check against for this employee, resolved fresh from role.permissions.",
  })
  permissions!: string[];
}
