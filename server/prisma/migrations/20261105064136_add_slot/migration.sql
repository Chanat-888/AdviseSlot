-- CreateTable
CREATE TABLE "Slot" (
    "id" SERIAL NOT NULL,
    "advisorId" INTEGER NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "isLate" BOOLEAN NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Slot_advisorId_startAt_idx" ON "Slot"("advisorId", "startAt");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F-04 section 6 / SDS section 3.1: constraints Prisma cannot express.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- BR-01: every slot is exactly 30 minutes.
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_duration_check"
  CHECK ("endAt" = "startAt" + interval '30 minutes');

-- BR-04: an advisor's live slots never overlap. tstzrange is half-open, so back-to-back is allowed.
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_no_overlap"
  EXCLUDE USING gist ("advisorId" WITH =, tstzrange("startAt", "endAt") WITH &&)
  WHERE ("deletedAt" IS NULL);
