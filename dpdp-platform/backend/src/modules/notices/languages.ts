/**
 * NT-08: English plus the 22 Eighth Schedule languages -- 23 codes total,
 * transcribed VERBATIM from `DPDP_MVP2_COMPLIANCE_OPERATIONS.md` lines
 * 178-179 (the `NoticeTranslation.languageCode` comment), in the exact
 * order given there. This project has caught five prose-vs-fenced-block
 * count errors already; this list is copied from the fenced schema
 * block, not retyped from memory or from the task brief's prose.
 *
 * The platform STORES and SERVES translations in these languages. It
 * never calls a translation API and never generates translated text --
 * every `NoticeTranslation.bodyMarkdown` is human-authored and supplied
 * verbatim by the caller of `PUT /api/notices/:id/versions/:v/translations/:lang`.
 */
export const NOTICE_LANGUAGE_CODES = [
  "en",
  "as",
  "bn",
  "brx",
  "doi",
  "gu",
  "hi",
  "kn",
  "ks",
  "kok",
  "mai",
  "ml",
  "mni",
  "mr",
  "ne",
  "or",
  "pa",
  "sa",
  "sat",
  "sd",
  "ta",
  "te",
  "ur",
] as const;

export type NoticeLanguageCode = (typeof NOTICE_LANGUAGE_CODES)[number];

export function isNoticeLanguageCode(
  value: string,
): value is NoticeLanguageCode {
  return (NOTICE_LANGUAGE_CODES as readonly string[]).includes(value);
}
