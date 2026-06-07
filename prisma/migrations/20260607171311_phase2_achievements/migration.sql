-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_gapId_key" ON "Achievement"("gapId");

-- CreateIndex
CREATE INDEX "Achievement_projectId_idx" ON "Achievement"("projectId");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_gapId_fkey" FOREIGN KEY ("gapId") REFERENCES "Gap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
