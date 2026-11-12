#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AdviseSlot: GitHub -> GCP link with Workload Identity Federation (Lab 5, Issue 6)
# Follows the Lab 5 starter kit guide docs/auto-deploy.md ("One-time setup").
# ==============================================================================
# Usage (from the repo root, in Cloud Shell, AFTER deploy/deploy.sh has run):
#   DRY_RUN=1 bash deploy/setup-wif.sh   # print every command, call nothing
#   bash deploy/setup-wif.sh             # create / bind (safe to re-run)
#
# WHAT THIS SCRIPT DOES
#   1 enable the IAM Credentials and Security Token Service APIs
#   2 create the deployer service account `adviseslot-deployer`
#   3 give it only what the deploy workflow needs:
#       roles/run.developer             on the project (update the service and job)
#       roles/artifactregistry.writer   on the `adviseslot` image repository only
#       roles/iam.serviceAccountUser    on the runtime account `adviseslot-runner` only
#     It gets NO Secret Manager access and cannot change IAM or create databases.
#   4 create the Workload Identity pool `github-actions` and the OIDC provider
#     `github-main`. The provider only accepts GitHub tokens from:
#       repository ID 1437269793 (Chanat-888/AdviseSlot), owner ID 185330969,
#       ref refs/heads/main, workflow .github/workflows/deploy.yml,
#       subject ...:environment:demo
#     so Pull Requests, other branches and forks are rejected.
#   5 let only that GitHub identity act as the deployer (workloadIdentityUser)
#   6 print the 4 values for the GitHub environment `demo`
#
# No service account key is created or downloaded.
# The IDs below come from `gh api repos/Chanat-888/AdviseSlot/actions/oidc/customization/sub`
# (use_immutable_subject=true, checked 2026-11-12).
# ==============================================================================

DRY_RUN="${DRY_RUN:-0}"
REGION="${REGION:-asia-southeast1}"

run_cmd() {
  local arg
  if [ "$DRY_RUN" = "1" ]; then printf '[DRY_RUN] '; else printf '+ '; fi
  for arg in "$@"; do printf '%q ' "$arg"; done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then "$@"; fi
}

if [ "$DRY_RUN" = "1" ]; then
  PROJECT_ID="${PROJECT_ID:-example-gcp-project}"
  PROJECT_NUMBER="${PROJECT_NUMBER:-000000000000}"
else
  PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: PROJECT_ID is not set and no active gcloud project was found." >&2
    exit 1
  fi
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
fi

# GitHub repository identity (immutable IDs, not names).
GH_OWNER="Chanat-888"
GH_REPO="AdviseSlot"
GH_OWNER_ID="185330969"
GH_REPO_ID="1437269793"
GH_ENVIRONMENT="demo"
GH_SUBJECT="repo:${GH_OWNER}@${GH_OWNER_ID}/${GH_REPO}@${GH_REPO_ID}:environment:${GH_ENVIRONMENT}"
GH_WORKFLOW_REF="${GH_OWNER}/${GH_REPO}/.github/workflows/deploy.yml@refs/heads/main"

# Names (deploy.sh created the runtime account and the image repository).
DEPLOYER_NAME="adviseslot-deployer"
DEPLOYER_EMAIL="${DEPLOYER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_EMAIL="adviseslot-runner@${PROJECT_ID}.iam.gserviceaccount.com"
REPO_NAME="adviseslot"
POOL_ID="github-actions"
PROVIDER_ID="github-main"
PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
PRINCIPAL="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/subject/${GH_SUBJECT}"

ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref"
ATTRIBUTE_CONDITION="assertion.repository_id=='${GH_REPO_ID}' && assertion.repository_owner_id=='${GH_OWNER_ID}' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='${GH_WORKFLOW_REF}' && assertion.sub=='${GH_SUBJECT}'"

echo "=================================================================="
echo "AdviseSlot Workload Identity Federation setup"
echo "Project : ${PROJECT_ID} (number ${PROJECT_NUMBER})"
echo "GitHub  : ${GH_OWNER}/${GH_REPO}, environment ${GH_ENVIRONMENT}, branch main"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# 1. APIs used by keyless login.
run_cmd gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

# 2. Deployer service account.
if [ "$DRY_RUN" = "1" ] || ! gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud iam service-accounts create "$DEPLOYER_NAME" \
    --display-name="AdviseSlot GitHub deployer" --project "$PROJECT_ID"
fi

# 3. Least-privilege roles for the deployer.
run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/run.developer" \
  --condition=None --quiet
run_cmd gcloud artifacts repositories add-iam-policy-binding "$REPO_NAME" \
  --location "$REGION" --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/artifactregistry.writer" --project "$PROJECT_ID" --quiet
run_cmd gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/iam.serviceAccountUser" \
  --project "$PROJECT_ID" --quiet

# 4. Workload Identity pool and GitHub OIDC provider.
if [ "$DRY_RUN" = "1" ] || ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud iam workload-identity-pools create "$POOL_ID" \
    --location=global --display-name="GitHub Actions" --project "$PROJECT_ID"
fi
if [ "$DRY_RUN" = "1" ] || ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --workload-identity-pool="$POOL_ID" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  run_cmd gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub main deploy" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION" \
    --project "$PROJECT_ID"
fi

# 5. Only the GitHub `demo` environment of our repository may act as the deployer.
run_cmd gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --member="$PRINCIPAL" --role="roles/iam.workloadIdentityUser" \
  --project "$PROJECT_ID" --quiet

# 6. Values for GitHub: Settings > Environments > demo > Variables (not secrets).
printf '\n'
echo "=================================================================="
echo "GitHub environment '${GH_ENVIRONMENT}' variables (allow branch main only):"
echo "  GCP_PROJECT_ID      = ${PROJECT_ID}"
echo "  GCP_REGION          = ${REGION}"
echo "  WIF_PROVIDER        = ${PROVIDER_NAME}"
echo "  WIF_SERVICE_ACCOUNT = ${DEPLOYER_EMAIL}"
echo "=================================================================="
