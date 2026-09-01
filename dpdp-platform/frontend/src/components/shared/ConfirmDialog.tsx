import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Plain-language statement of what happens as a result of confirming --
   * for consent withdrawal specifically, this must state PLAINLY what
   * stops happening (e.g. "We will stop sending you marketing emails from
   * today. Orders already placed are not affected."), never a euphemism
   * ("your preferences will be updated") that leaves the actual effect
   * unstated.
   */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Disables the confirm button and (optionally) relabels it while a mutation is in flight. */
  isConfirming?: boolean;
  /** `"destructive"` renders the confirm button in the destructive (red) style -- for irreversible or stop-doing-something actions like consent withdrawal. */
  variant?: "default" | "destructive";
}

/**
 * A controlled, reusable yes/no confirmation dialog built on the promoted
 * `components/ui/dialog.tsx`. Deliberately has no trigger of its own --
 * the caller owns `open` state and renders whatever triggers it (a button,
 * a menu item, ...); this only renders the confirmation itself. Used for
 * consent withdrawal and any other action where silently proceeding would
 * be wrong.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isConfirming = false,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            disabled={isConfirming}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
