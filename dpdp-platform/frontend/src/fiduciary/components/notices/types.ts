export const NOTICE_LANGUAGES = [
  ["en", "English"], ["as", "Assamese"], ["bn", "Bengali"], ["brx", "Bodo"],
  ["doi", "Dogri"], ["gu", "Gujarati"], ["hi", "Hindi"], ["kn", "Kannada"],
  ["ks", "Kashmiri"], ["kok", "Konkani"], ["mai", "Maithili"], ["ml", "Malayalam"],
  ["mni", "Manipuri"], ["mr", "Marathi"], ["ne", "Nepali"], ["or", "Odia"],
  ["pa", "Punjabi"], ["sa", "Sanskrit"], ["sat", "Santali"], ["sd", "Sindhi"],
  ["ta", "Tamil"], ["te", "Telugu"], ["ur", "Urdu"],
] as const;

export type NoticeLanguageCode = (typeof NOTICE_LANGUAGES)[number][0];

export interface NoticePurposeStatement {
  purposeId: string;
  purposeName: string;
  goodsOrServices: string | null;
}

export interface NoticeItemisedField {
  sourceFieldMappingId: string;
  canonicalField: string;
  dataCategory: string;
  label: string;
}

export interface NoticeVersion {
  id: string;
  noticeId: string;
  version: number;
  itemisedDataFields: NoticeItemisedField[];
  purposeStatements: NoticePurposeStatement[];
  withdrawalUrl: string;
  rightsUrl: string;
  boardComplaintUrl: string;
  bodyMarkdown: string;
  contentHash: string;
  publishedAt: string | null;
  retiredAt: string | null;
  translations: Array<{ id: string; languageCode: string; bodyMarkdown: string }>;
}

export interface Notice {
  id: string;
  code: string;
  name: string;
  purposeIds: string[];
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  currentVersionId: string | null;
  createdAt: string;
}

export interface NoticeDetail extends Notice {
  versions: NoticeVersion[];
}

export interface EligibleItemisedField {
  sourceFieldMappingId: string;
  dataSourceId: string;
  dataSourceName: string;
  sourceField: string;
  canonicalField: string;
  dataCategory: string;
  suggestedLabel: string;
}
