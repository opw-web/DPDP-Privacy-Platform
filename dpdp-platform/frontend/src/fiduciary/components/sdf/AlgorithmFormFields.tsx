import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { CheckboxOption } from "../../../components/ui/checkbox";
import { ALGORITHM_OPERATIONS } from "./types";

export interface AlgorithmFormValues {
  name: string;
  description: string;
  operations: string[];
  riskAssessment: string;
  riskToRightsIdentified: boolean;
  mitigations: string;
  lastReviewedAt: string;
  reviewedByEmployeeId: string;
}

export const EMPTY_ALGORITHM_FORM: AlgorithmFormValues = {
  name: "",
  description: "",
  operations: [],
  riskAssessment: "",
  riskToRightsIdentified: false,
  mitigations: "",
  lastReviewedAt: "",
  reviewedByEmployeeId: "",
};

/**
 * The field set shared by the "add an algorithm" and "edit an algorithm"
 * forms (`AlgorithmRegisterPanel`) -- one place rendering Rule 13(3)'s
 * nine operation checkboxes and the risk-review fields, so create and
 * edit cannot drift into two different shapes of the same entry.
 */
export function AlgorithmFormFields({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string;
  values: AlgorithmFormValues;
  onChange: (next: AlgorithmFormValues) => void;
}) {
  function toggleOperation(operation: string, checked: boolean) {
    onChange({
      ...values,
      operations: checked
        ? [...values.operations, operation]
        : values.operations.filter((existing) => existing !== operation),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Algorithm / system name</Label>
          <Input
            id={`${idPrefix}-name`}
            value={values.name}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-reviewed-by`}>Reviewed by</Label>
          <Input
            id={`${idPrefix}-reviewed-by`}
            placeholder="Employee id or name"
            value={values.reviewedByEmployeeId}
            onChange={(event) => onChange({ ...values, reviewedByEmployeeId: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Operations on personal data (Rule 13(3))</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {ALGORITHM_OPERATIONS.map((operation) => (
            <CheckboxOption
              key={operation}
              id={`${idPrefix}-op-${operation}`}
              label={operation}
              checked={values.operations.includes(operation)}
              onChange={(event) => toggleOperation(operation, event.target.checked)}
            />
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-risk-assessment`}>Risk assessment</Label>
        <Textarea
          id={`${idPrefix}-risk-assessment`}
          value={values.riskAssessment}
          onChange={(event) => onChange({ ...values, riskAssessment: event.target.value })}
        />
      </div>
      <CheckboxOption
        id={`${idPrefix}-risk-to-rights`}
        label="A risk to data principals' rights was identified"
        checked={values.riskToRightsIdentified}
        onChange={(event) => onChange({ ...values, riskToRightsIdentified: event.target.checked })}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-mitigations`}>Mitigations</Label>
        <Textarea
          id={`${idPrefix}-mitigations`}
          value={values.mitigations}
          onChange={(event) => onChange({ ...values, mitigations: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-last-reviewed`}>Last reviewed on</Label>
        <Input
          id={`${idPrefix}-last-reviewed`}
          type="date"
          value={values.lastReviewedAt}
          onChange={(event) => onChange({ ...values, lastReviewedAt: event.target.value })}
        />
      </div>
    </div>
  );
}

export function toAlgorithmFormValues(entry: {
  name: string;
  description: string;
  operations: string[];
  riskAssessment: string | null;
  riskToRightsIdentified: boolean;
  mitigations: string | null;
  lastReviewedAt: string | null;
  reviewedByEmployeeId: string | null;
}): AlgorithmFormValues {
  return {
    name: entry.name,
    description: entry.description,
    operations: entry.operations,
    riskAssessment: entry.riskAssessment ?? "",
    riskToRightsIdentified: entry.riskToRightsIdentified,
    mitigations: entry.mitigations ?? "",
    lastReviewedAt: entry.lastReviewedAt ? entry.lastReviewedAt.slice(0, 10) : "",
    reviewedByEmployeeId: entry.reviewedByEmployeeId ?? "",
  };
}
