#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AdviseSlot: idempotent first deployment to Google Cloud Run (Lab 5, Issue #42)
# Adapted from the Lab 5 starter kit (toktickit-lab5-starter/deploy/deploy.sh).
# ==============================================================================
# Usage (from the repo root, in Cloud Shell):
#   DRY_RUN=1 bash deploy/deploy.sh     # print every command, call nothing
#   bash deploy/deploy.sh               # create the resources and deploy
#
# Environment variables (optional):
#   PROJECT_ID   GCP project ID (default: the active gcloud project)
#   REGION       GCP region (default: asia-southeast1)
#   DRY_RUN      1 = print the gcloud commands without running them
#
# WHAT THIS SCRIPT DOES (one-time first setup; safe to re-run)
#   1 enable APIs        2 Artifact Registry   3 Cloud SQL (PostgreSQL 17)
#   4 database           5 runtime SA + IAM    6 DB user + DATABASE_URL secret
#   7 demo password secret (SEED_DEMO_PASSWORD; the seed refuses to run without it)
#   (per-secret access)  8 build image         9 migrate + seed job
#   10 Cloud Run service
#   Routine releases later go through GitHub Actions (Issue 7), which only
#   UPDATES these resources.
#
# Differences from the starter kit (SDS section 9, D-25):
#   - Resource names use `adviseslot` instead of `toktickit`.
#   - PostgreSQL 17 (same major version as local development).
#   - No admin password: AdviseSlot has no admin account. The demo password is
#     always created, because server/prisma/seed.ts requires SEED_DEMO_PASSWORD.
#   - The job runs `npx prisma migrate deploy && npx prisma db seed`.
#
# IMPORTANT
#   - Idempotent: existing resources and secrets are reused, never overwritten.
#   - Passwords are generated with openssl, stored only in Secret Manager and
#     never printed (run_cmd redacts --password=...).
#   - Offline test: bash deploy/tests/test_deploy_stub.sh
# ==============================================================================

DRY_RUN="${DRY_RUN:-0}"
REGION="${REGION:-asia-southeast1}"

if [ "$#" -gt 0 ]; then
  echo "Usage: $0   (no arguments; see the header)" >&2
  exit 1
fi

# Prints the command (DRY_RUN=1) or prints and runs it. --password=... is redacted.
run_cmd() {
  local arg
  if [ "$DRY_RUN" = "1" ]; then
    printf '[DRY_RUN] '
  else
    printf '+ '
  fi
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

if [ "$DRY_RUN" = "1" ]; then
  PROJECT_ID="${PROJECT_ID:-example-gcp-project}"
else
  PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: PROJECT_ID is not set and no active gcloud project was found." >&2
    echo "Run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Resource names (teardown.sh and the tests use the same names)
# ------------------------------------------------------------------------------
REPO_NAME="adviseslot"
SQL_INSTANCE="adviseslot-pg"
DB_NAME="adviseslot"
DB_USER="adviseslot"
SERVICE_NAME="adviseslot"
MIGRATE_JOB_NAME="adviseslot-migrate"
SA_NAME="adviseslot-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

SECRET_DB_URL="adviseslot-database-url"
SECRET_DEMO_PASS="adviseslot-demo-password"

echo "=================================================================="
echo "AdviseSlot Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# 1. Enable the APIs this deployment uses.
run_cmd gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project "$PROJECT_ID"

# 2. Artifact Registry repository for the container images.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID"
  run_cmd gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION" --description="AdviseSlot container images" --project "$PROJECT_ID"
else
  if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud artifacts repositories create "$REPO_NAME" \
      --repository-format=docker \
      --location "$REGION" \
      --description="AdviseSlot container images" \
      --project "$PROJECT_ID"
  fi
fi

# 3. Cloud SQL for PostgreSQL 17, smallest shared-core tier.
#    db-f1-micro needs --edition=enterprise (lowercase). Creating it takes several
#    minutes and costs money (billed per hour) until deploy/teardown.sh is run.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_17 --edition=enterprise --tier=db-f1-micro --region="$REGION" --storage-size=10GB --storage-type=SSD --backup-start-time=03:00 --project "$PROJECT_ID"
else
  if ! gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql instances create "$SQL_INSTANCE" \
      --database-version=POSTGRES_17 \
      --edition=enterprise \
      --tier=db-f1-micro \
      --region="$REGION" \
      --storage-size=10GB \
      --storage-type=SSD \
      --backup-start-time=03:00 \
      --project "$PROJECT_ID"
  fi
fi

# 4. Application database.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
else
  if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  fi
fi

# 5. Runtime service account with least privilege: only cloudsql.client here;
#    access to each secret is granted per secret below.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID"
  run_cmd gcloud iam service-accounts create "$SA_NAME" --display-name="AdviseSlot Cloud Run runtime" --project "$PROJECT_ID"
else
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud iam service-accounts create "$SA_NAME" \
      --display-name="AdviseSlot Cloud Run runtime" \
      --project "$PROJECT_ID"
  fi
fi

run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --condition=None \
  --quiet

# 6. DB user and DATABASE_URL secret (only if the secret does not exist yet).
#    The user's password and the one inside DATABASE_URL are the same value.
#    Prisma connects through the Cloud SQL unix socket mounted by Cloud Run.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID"
  run_cmd gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)"
  run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="<GENERATED_HEX_PASSWORD>" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    DB_PASS="$(openssl rand -hex 24)"
    if gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)" | grep -qx "$DB_USER"; then
      run_cmd gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    else
      run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    fi
    DB_URL_VALUE="postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONN_NAME}&schema=public&connection_limit=3"
    run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$DB_URL_VALUE" | gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
  fi
fi

# 7. Demo account password (SEED_DEMO_PASSWORD), only if the secret does not exist.
#    Read it yourself later with:
#      gcloud secrets versions access latest --secret=adviseslot-demo-password
#    Never paste it into chat, Git or a screenshot.
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_DEMO_PASS" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_DEMO_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_DEMO_PASS" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_DEMO_PASS" --project "$PROJECT_ID" >/dev/null 2>&1; then
    GENERATED_DEMO_PASSWORD="$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-14)Dd1!"
    run_cmd gcloud secrets create "$SECRET_DEMO_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$GENERATED_DEMO_PASSWORD" | gcloud secrets versions add "$SECRET_DEMO_PASS" --data-file=- --project "$PROJECT_ID"
  fi
fi

# Per-secret access for the runtime account (never project-wide secretAccessor).
for secret in "$SECRET_DB_URL" "$SECRET_DEMO_PASS"; do
  run_cmd gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID" --quiet
done

# 8. Build and push the root Dockerfile with Cloud Build (run from the repo root).
#    `latest` is only for this first manual setup; the deploy workflow uses commit SHAs.
run_cmd gcloud builds submit \
  --tag "$IMAGE_URI" \
  --project "$PROJECT_ID"

# 9. Migration + idempotent seed as a Cloud Run job. If it fails, the script stops
#    BEFORE the service is deployed, so a broken migration never reaches users.
run_cmd gcloud run jobs deploy "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest,SEED_DEMO_PASSWORD=${SECRET_DEMO_PASS}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,APP_TIMEZONE=Asia/Bangkok" \
  --command "sh" \
  --args "-c,npx prisma migrate deploy && npx prisma db seed" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# 10. Cloud Run service (public: --allow-unauthenticated, needed for the demo).
#     Port 3000 matches the Dockerfile. min-instances 0 so it costs nothing when idle.
run_cmd gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,APP_TIMEZONE=Asia/Bangkok" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --project "$PROJECT_ID"

if [ "$DRY_RUN" = "1" ]; then
  SERVICE_URL="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

printf '\n'
printf '%s\n' "=================================================================="
printf '%s\n' "Deployment Completed!"
printf '%s\n' "Service URL    : ${SERVICE_URL}"
printf '%s\n' "Health Check   : ${SERVICE_URL}/api/health"
printf '%s\n' "Readiness Check: ${SERVICE_URL}/api/ready"
printf '%s\n' "Demo accounts  : see README (e.g. student1@example.test)"
printf '%s\n' "Demo password  : Secret Manager '${SECRET_DEMO_PASS}' (not printed)"
printf '%s\n' "=================================================================="
