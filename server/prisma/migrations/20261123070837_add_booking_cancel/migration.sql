-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN     "cancelledById" INTEGER;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F-10 section 6 / SDS section 3.1: the cancel fields are set exactly when the booking is
-- CANCELLED. Existing rows are all ACTIVE with nulls, so no backfill is needed.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancel_fields_match_status" CHECK (
  ("status" = 'ACTIVE' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL)
);

-- F-11 section 6 (BR-12): a stored reason is 1 to 500 characters. The service trims first.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelReason_length" CHECK (
  "cancelReason" IS NULL OR char_length("cancelReason") BETWEEN 1 AND 500
);
