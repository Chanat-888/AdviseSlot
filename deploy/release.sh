#!/usr/bin/env bash
# ==============================================================================
# AdviseSlot: release.sh (called by .github/workflows/deploy.yml)
# Adapted from the Lab 5 starter kit. Only names and the image path changed.
# ==============================================================================
# Updates resources that deploy/deploy.sh already created. It does not create
# Cloud SQL, IAM or secrets.
#   Normal release : verify image -> run the migrate job -> update the service.
#   Rollback       : verify image -> update the service (no migrate, no seed).
#
# Input (environment variables)
#   PROJECT_ID, REGION, IMAGE_TAG   required (IMAGE_TAG = full 40-character commit SHA)
#   SERVICE_NAME, MIGRATE_JOB_NAME  optional (default adviseslot, adviseslot-migrate)
#   ROLLBACK                        true | false (default false)
#   GITHUB_ENV                      when set, SERVICE_URL and DEPLOYED_IMAGE are
#                                   written there for the next workflow steps
#
# - If the migrate job fails, `set -e` stops the script before the service is
#   updated, so a broken migration never reaches users.
# - The image is pinned by its @sha256 digest, so the job and the service run
#   exactly the same image.
# - The migrate job runs `prisma migrate deploy && prisma db seed`; its command is
#   set in deploy/deploy.sh. The seed only adds missing rows, so re-running it is safe.
# - Offline test: bash deploy/tests/test_release_stub.sh
# ==============================================================================
set -euo pipefail

# 1. Read and check the inputs before any GCP call.
: "${PROJECT_ID:?Required}" "${REGION:?Required}" "${IMAGE_TAG:?Required}"
SERVICE_NAME="${SERVICE_NAME:-adviseslot}"
MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-adviseslot-migrate}"
ROLLBACK="${ROLLBACK:-false}"
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid image tag.' >&2; exit 1; }
[[ "$ROLLBACK" == true || "$ROLLBACK" == false ]] || { echo 'Invalid rollback mode.' >&2; exit 1; }

# 2. Find the image and pin it by digest.
#    adviseslot/adviseslot = <Artifact Registry repo>/<image name>, as in deploy/deploy.sh.
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/adviseslot/adviseslot:$IMAGE_TAG"
DIGEST_IMAGE="$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
[[ "$DIGEST_IMAGE" == "$REGION-docker.pkg.dev/$PROJECT_ID/adviseslot/adviseslot@sha256:"* ]] || { echo 'Image digest not found.' >&2; exit 1; }

# 3. Database migration (normal release only). --wait blocks until the job ends;
#    a failure stops the release here and the service is not touched.
if [[ "$ROLLBACK" == false ]]; then
  gcloud run jobs update "$MIGRATE_JOB_NAME" --image="$DIGEST_IMAGE" --project="$PROJECT_ID" --region="$REGION" --quiet
  gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait --project="$PROJECT_ID" --region="$REGION" --quiet
else
  echo 'Rollback: reuse an existing image; skip build, migration and seed.'
fi

# 4. Point the service at the image and send it all traffic. APP_COMMIT is what
#    GET /api/version and the page footer show, so anyone can see the running commit.
gcloud run services update "$SERVICE_NAME" --image="$DIGEST_IMAGE" --update-env-vars="APP_COMMIT=$IMAGE_TAG" --project="$PROJECT_ID" --region="$REGION" --quiet
# Give the newest revision 100% of traffic even if traffic was pinned before.
gcloud run services update-traffic "$SERVICE_NAME" --to-latest --project="$PROJECT_ID" --region="$REGION" --quiet

# 5. Report the URL and hand it to the next workflow steps.
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo "Service URL: $SERVICE_URL"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'SERVICE_URL=%s\nDEPLOYED_IMAGE=%s\n' "$SERVICE_URL" "$DIGEST_IMAGE" >> "$GITHUB_ENV"
fi
