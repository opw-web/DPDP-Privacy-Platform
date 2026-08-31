-- MVP 2: add dataPrincipal relations (and back-relations on DataPrincipal)
-- needed for the audience compiler's Prisma.DataPrincipalWhereInput relation filters.
-- Restrict (not Cascade) is deliberate: these tables are compliance evidence and a
-- data principal is never destroyed in this product (MVP 1's rule: "a merge is a
-- link, never a destruction").
-- NOT VALID: 4 pre-existing ConsentRecord rows reference a dataPrincipalId that does not
-- exist (orphaned test-fixture rows from an unrelated org). ConsentEvent (the append-only
-- history table below them) is protected by the consent_event_no_delete trigger, so those
-- rows cannot be cleaned up by deleting evidence. NOT VALID adds and enforces the constraint
-- for all new/updated rows without validating (or touching) the existing ones.
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "GuardianRelationship" ADD CONSTRAINT "GuardianRelationship_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrincipalRequest" ADD CONSTRAINT "PrincipalRequest_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ErasureTask" ADD CONSTRAINT "ErasureTask_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BreachAffectedPrincipal" ADD CONSTRAINT "BreachAffectedPrincipal_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
