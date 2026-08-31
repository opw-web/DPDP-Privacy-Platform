import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { cn } from "../../lib/utils";
import { Step1Connection } from "../components/wizard/Step1Connection";
import { Step2Schema } from "../components/wizard/Step2Schema";
import { Step3Mapping } from "../components/wizard/Step3Mapping";
import { Step4Purposes } from "../components/wizard/Step4Purposes";
import { Step5Declarations } from "../components/wizard/Step5Declarations";
import type { PublicDataSource, PublicDataSourceField } from "../lib/data-sources-api";

const STEPS = [
  { step: 1, label: "Connection" },
  { step: 2, label: "Schema" },
  { step: 3, label: "Mapping" },
  { step: 4, label: "Purposes" },
  { step: 5, label: "Declarations" },
] as const;

/**
 * `/app/data-sources/new` (spec line 850-852): the five-step connection
 * wizard. Each step is created once it is first saved -- a data source
 * created on Step 1 is a real, persisted `DRAFT` row from that point on,
 * so abandoning the wizard partway leaves a resumable source (its
 * detail page's tabs cover the same ground as Steps 2-5), never a
 * half-created ghost with no id.
 */
export function DataSourceNewPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [dataSource, setDataSource] = useState<PublicDataSource | undefined>();
  const [fields, setFields] = useState<PublicDataSourceField[]>([]);
  const [purposeIds, setPurposeIds] = useState<string[]>([]);

  const highestUnlockedStep = !dataSource
    ? 1
    : fields.length === 0
      ? 2
      : 5; // once mappings/purposes have been saved at least once, every later step is revisitable freely

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Connect a data source</h1>
        <p className="text-sm text-muted-foreground">
          Five steps: connect and test, discover the schema, map fields, attach purposes, and
          declare hosting and public-availability.
        </p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map(({ step, label }, index) => (
          <li key={step} className="flex items-center gap-2">
            <button
              type="button"
              disabled={step > highestUnlockedStep && step > currentStep}
              onClick={() => setCurrentStep(step)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium",
                step === currentStep
                  ? "border-primary bg-primary text-primary-foreground"
                  : step <= highestUnlockedStep
                    ? "border-border bg-muted text-foreground"
                    : "border-border text-muted-foreground",
              )}
              aria-current={step === currentStep ? "step" : undefined}
            >
              {step < currentStep ? <Check className="h-4 w-4" aria-hidden="true" /> : step}
            </button>
            <span
              className={cn(
                "text-sm",
                step === currentStep ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? <span className="mx-2 h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>
            Step {currentStep}: {STEPS[currentStep - 1]?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentStep === 1 ? (
            <Step1Connection
              dataSource={dataSource}
              onSaved={(saved) => {
                setDataSource(saved);
                setCurrentStep(2);
              }}
            />
          ) : null}

          {currentStep === 2 && dataSource ? (
            <Step2Schema
              dataSourceId={dataSource.id}
              initialFields={fields}
              onDiscovered={(discovered) => {
                setFields(discovered);
                setCurrentStep(3);
              }}
            />
          ) : null}

          {currentStep === 3 && dataSource ? (
            <Step3Mapping
              dataSourceId={dataSource.id}
              fields={fields}
              onSaved={() => setCurrentStep(4)}
            />
          ) : null}

          {currentStep === 4 && dataSource ? (
            <Step4Purposes
              dataSourceId={dataSource.id}
              initialPurposeIds={purposeIds}
              onSaved={(result) => {
                setPurposeIds(result.purposes.map((purpose) => purpose.id));
                setCurrentStep(5);
              }}
            />
          ) : null}

          {currentStep === 5 && dataSource ? (
            <Step5Declarations
              dataSourceId={dataSource.id}
              initial={dataSource}
              onSaved={() => navigate(`/app/data-sources/${dataSource.id}`)}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
