/**
 * The Acme Retail demo organization and its five demo employee accounts
 * (spec lines 896, 950-955). All demo passwords are `Password123!` --
 * a fixed, publicly known demo credential, never used for anything but
 * this seed.
 */
export const DEMO_ORG = {
  name: "Acme Retail Pvt Ltd",
  legalName: "Acme Retail Private Limited",
  country: "IN",
  timezone: "Asia/Kolkata",
} as const;

export const DEMO_PASSWORD = "Password123!";

export interface DemoEmployeeSeed {
  email: string;
  fullName: string;
  roleCode: "ADMIN" | "DPO" | "COMPLIANCE_MANAGER" | "EMPLOYEE" | "AUDITOR";
}

export const DEMO_EMPLOYEES: readonly DemoEmployeeSeed[] = [
  { email: "admin@acmeretail.demo", fullName: "Acme Admin", roleCode: "ADMIN" },
  { email: "dpo@acmeretail.demo", fullName: "Acme DPO", roleCode: "DPO" },
  {
    email: "compliance@acmeretail.demo",
    fullName: "Acme Compliance Manager",
    roleCode: "COMPLIANCE_MANAGER",
  },
  {
    email: "employee@acmeretail.demo",
    fullName: "Acme Employee",
    roleCode: "EMPLOYEE",
  },
  {
    email: "auditor@acmeretail.demo",
    fullName: "Acme Auditor",
    roleCode: "AUDITOR",
  },
];
