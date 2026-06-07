-- Phase 4: AI-assisted gap detection support.
-- Additive: new columns with safe defaults + a wider unique constraint.
-- Existing rows are all source = 'score' with one gap per (projectId, capabilityId),
-- so the new unique index cannot collide.

ALTER TABLE "Gap" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'score';
ALTER TABLE "Gap" ADD COLUMN "suggestedCapability" TEXT;

DROP INDEX "Gap_projectId_capabilityId_key";
CREATE UNIQUE INDEX "Gap_projectId_capabilityId_source_key" ON "Gap"("projectId", "capabilityId", "source");
