-- D8: a Board extension must move only the extended clock's `dueAt`; the
-- pre-extension due date has to survive as a first-class, queryable field so
-- the UI can render the true original struck through, not mine it out of
-- the append-only audit log. Nullable: every existing obligation has never
-- been extended.
ALTER TABLE "BreachObligation" ADD COLUMN "originalDueAt" TIMESTAMPTZ(6);
