import { Select } from "../ui/select";

/**
 * Transcribed verbatim from `NOTICE_LANGUAGE_CODES`
 * (`backend/src/modules/notices/languages.ts`): English + the 22 Eighth
 * Schedule languages, 23 total, in this exact order. Display labels are
 * this frontend's own addition (the backend list is codes only) -- the
 * codes themselves, and their order, must not drift from the backend's.
 */
export const NOTICE_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "as", label: "Assamese" },
  { code: "bn", label: "Bengali" },
  { code: "brx", label: "Bodo" },
  { code: "doi", label: "Dogri" },
  { code: "gu", label: "Gujarati" },
  { code: "hi", label: "Hindi" },
  { code: "kn", label: "Kannada" },
  { code: "ks", label: "Kashmiri" },
  { code: "kok", label: "Konkani" },
  { code: "mai", label: "Maithili" },
  { code: "ml", label: "Malayalam" },
  { code: "mni", label: "Manipuri" },
  { code: "mr", label: "Marathi" },
  { code: "ne", label: "Nepali" },
  { code: "or", label: "Odia" },
  { code: "pa", label: "Punjabi" },
  { code: "sa", label: "Sanskrit" },
  { code: "sat", label: "Santali" },
  { code: "sd", label: "Sindhi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ur", label: "Urdu" },
] as const;

export type NoticeLanguageCode = (typeof NOTICE_LANGUAGES)[number]["code"];

export interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A plain `<select>` (promoted `components/ui/select.tsx`) over the 23
 * notice languages -- used wherever a notice/translation language must be
 * chosen (the fiduciary notice editor's translation tab, the Data
 * Principal portal's `/me/privacy` notice-version language picker).
 */
export function LanguageSelector({
  value,
  onChange,
  id,
  className,
  disabled,
}: LanguageSelectorProps) {
  return (
    <Select
      id={id}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {NOTICE_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </Select>
  );
}
