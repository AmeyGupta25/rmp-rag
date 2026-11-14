# AWS setup

One private S3 bucket holds every layer of the pipeline:

| Prefix | Written by | Contents |
|---|---|---|
| `raw/{professors,reviews,pipeline_runs}/dt=YYYY-MM-DD/run=<id>.jsonl` | pipeline | Immutable extracts, one file per run |
| `raw/rejects/dt=…/` | pipeline | Records that failed schema validation, with a reason (expire after 30 days) |
| `serving/serving.duckdb` | pipeline | Published marts the API reads. No review text. Versioned: the last 5 builds are kept for rollback. |

The pipeline runs on a GitHub Actions runner: it syncs `raw/` down, builds and tests the warehouse
locally (write-audit), and uploads `serving.duckdb` only when every dbt test passes (publish).

Access follows least privilege:

- **GitHub Actions** uses the IAM user `profai-github`, which can only read and write `raw/*` and `serving/*` in this bucket ([pipeline-policy.json](pipeline-policy.json)). Its key lives only in the GitHub `production` environment, which only `main` can deploy to.
  - Trade-off: AWS's simplified "projects" accounts block OIDC providers unless *advanced features* are activated, which is irreversible and removes the account's hard spend limit. The account keeps the spend limit, so the pipeline uses one scoped key instead. Keyless OIDC is ready in [github-oidc-trust.json](github-oidc-trust.json): after activation, create the provider and role (commented out below) and swap the two key lines in the workflows for `role-to-assume`.
- **The API** uses an IAM user that can only read `serving/*` ([api-readonly-policy.json](api-readonly-policy.json)).

## Setup (one time)

Replace `<ACCOUNT_ID>` and `<BUCKET>` in the JSON files, then:

```bash
BUCKET=<BUCKET>
REGION=us-east-2   # the account's Region; outside us-east-1, S3 needs the LocationConstraint
aws s3api create-bucket --bucket $BUCKET --region $REGION --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration file://infra/lifecycle.json

# Pipeline user (key goes into the GitHub production environment as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
aws iam create-user --user-name profai-github
aws iam put-user-policy --user-name profai-github --policy-name pipeline-s3 --policy-document file://infra/pipeline-policy.json
aws iam create-access-key --user-name profai-github

# Keyless alternative (needs advanced features on simplified accounts):
# aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
# aws iam create-role --role-name profai-pipeline --assume-role-policy-document file://infra/github-oidc-trust.json
# aws iam put-role-policy --role-name profai-pipeline --policy-name pipeline-s3 --policy-document file://infra/pipeline-policy.json

# Read-only API user
aws iam create-user --user-name profai-api
aws iam put-user-policy --user-name profai-api --policy-name serving-read --policy-document file://infra/api-readonly-policy.json
aws iam create-access-key --user-name profai-api   # store in the API host's env, never in git
```

Why S3 + DuckDB instead of a hosted warehouse: the whole dataset is a few hundred MB, so a single-file
warehouse rebuilt from immutable raw files on every run is cheaper, reproducible, and easy to audit. The
raw layer uses Hive-style `dt=` partitions, so Athena or Glue could query it as-is if the data ever outgrew
DuckDB.

## Rolling back bad data

Every publish overwrites `serving/serving.duckdb`, and versioning keeps the previous 5 builds.

```bash
aws s3api list-object-versions --bucket $BUCKET --prefix serving/serving.duckdb \
  --query 'Versions[].[VersionId,LastModified]' --output table
aws s3api copy-object --bucket $BUCKET --key serving/serving.duckdb \
  --copy-source "$BUCKET/serving/serving.duckdb?versionId=<VERSION_ID>"
```

The API picks up the restored file on its next reload.
