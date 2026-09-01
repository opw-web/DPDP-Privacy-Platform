import MDEditor from "@uiw/react-md-editor";
import type { NoticeItemisedField, NoticePurposeStatement } from "./types";

interface NoticePreviewProps {
  bodyMarkdown: string;
  itemisedDataFields: NoticeItemisedField[];
  purposeStatements: NoticePurposeStatement[];
  withdrawalUrl: string;
  rightsUrl: string;
  boardComplaintUrl: string;
  languageLabel?: string;
}

/**
 * The Rule 3(a) render boundary. Keep this component free of application
 * navigation, editing controls, sidebars, or explanatory chrome: it is the
 * exact standalone notice a person can understand on its own.
 */
export function NoticeStandalonePreview({
  bodyMarkdown,
  itemisedDataFields,
  purposeStatements,
  withdrawalUrl,
  rightsUrl,
  boardComplaintUrl,
  languageLabel,
}: NoticePreviewProps) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-10" aria-label="Standalone privacy notice">
      {languageLabel ? <p className="text-sm text-muted-foreground">Language: {languageLabel}</p> : null}
      <MDEditor.Markdown source={bodyMarkdown} style={{ backgroundColor: "transparent", color: "inherit" }} />

      <section aria-labelledby="notice-data-heading">
        <h2 id="notice-data-heading" className="text-lg font-semibold">Personal data we use</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {itemisedDataFields.map((field) => <li key={field.sourceFieldMappingId}>{field.label}</li>)}
        </ul>
      </section>

      <section aria-labelledby="notice-purpose-heading">
        <h2 id="notice-purpose-heading" className="text-lg font-semibold">Why we use it</h2>
        <dl className="mt-2 space-y-3">
          {purposeStatements.map((purpose) => (
            <div key={purpose.purposeId}>
              <dt className="font-medium">{purpose.purposeName}</dt>
              <dd className="text-sm text-muted-foreground">{purpose.goodsOrServices || "Description not available."}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="Privacy notice links" className="space-y-2 text-sm">
        <a className="block text-primary underline" href={withdrawalUrl}>Withdraw consent</a>
        <a className="block text-primary underline" href={rightsUrl}>Exercise your rights</a>
        <a className="block text-primary underline" href={boardComplaintUrl}>Complain to the Board</a>
      </nav>
    </article>
  );
}
