import MDEditor from "@uiw/react-md-editor";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export function MarkdownMessageEditor({ subject, body, onSubjectChange, onBodyChange }: { subject: string; body: string; onSubjectChange: (value: string) => void; onBodyChange: (value: string) => void }) {
  return <div className="space-y-4" data-color-mode="light"><div className="space-y-1"><Label htmlFor="message-subject">Subject</Label><Input id="message-subject" value={subject} onChange={(e) => onSubjectChange(e.target.value)} required /></div><div className="space-y-1"><Label>Markdown body</Label><MDEditor value={body} onChange={(value) => onBodyChange(value ?? "")} preview="edit" height={260} /></div></div>;
}
