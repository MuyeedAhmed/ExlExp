#!/usr/bin/env bash
set -e

AWS_REGION="${AWS_REGION:-us-east-1}"
ENDPOINT_NAME="${ENDPOINT_NAME:-receipt-recognition-endpoint}"
STACK_NAME="${STACK_NAME:-exlexp-receipt-recognition}"
ROLE_NAME="ExlExpSageMakerExecutionRole"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --region) AWS_REGION="$2"; shift ;;
    --endpoint-name) ENDPOINT_NAME="$2"; shift ;;
    --stack-name) STACK_NAME="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

echo "==> Deploying Receipt Recognition to AWS (${AWS_REGION})..."

CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null || true)
if [ -z "$CALLER_IDENTITY" ]; then
  echo "Error: AWS CLI not configured. Run 'aws configure'."
  exit 1
fi
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | grep -o '"Account": "[^"]*' | cut -d'"' -f4)

EXISTING_ROLE=$(aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || true)
if [ -n "$EXISTING_ROLE" ] && [ "$EXISTING_ROLE" != "None" ]; then
  SAGEMAKER_ROLE_ARN="$EXISTING_ROLE"
else
  TRUST_FILE=$(mktemp)
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"sagemaker.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > "$TRUST_FILE"
  SAGEMAKER_ROLE_ARN=$(aws iam create-role --role-name "${ROLE_NAME}" --assume-role-policy-document "file://${TRUST_FILE}" --query 'Role.Arn' --output text)
  rm -f "$TRUST_FILE"
  aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn arn:aws:iam::aws:policy/AmazonSageMakerFullAccess
  aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
  sleep 10
fi

MODEL_S3_BUCKET="exlexp-receipt-model-${ACCOUNT_ID}"
if ! aws s3 ls "s3://${MODEL_S3_BUCKET}" 2>/dev/null; then
  if [ "$AWS_REGION" == "us-east-1" ]; then
    aws s3 mb "s3://${MODEL_S3_BUCKET}" --region "${AWS_REGION}"
  else
    aws s3 mb "s3://${MODEL_S3_BUCKET}" --region "${AWS_REGION}" --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  fi
fi

cd "${SCRIPT_DIR}/sagemaker"
python3 -c "import boto3" 2>/dev/null || pip install boto3
python3 deploy_endpoint.py \
  --mode serverless \
  --endpoint-name "${ENDPOINT_NAME}" \
  --role-arn "${SAGEMAKER_ROLE_ARN}" \
  --s3-bucket "${MODEL_S3_BUCKET}" \
  --region "${AWS_REGION}"

echo "Waiting for SageMaker endpoint '${ENDPOINT_NAME}'..."
for i in {1..30}; do
  STATUS=$(aws sagemaker describe-endpoint --endpoint-name "${ENDPOINT_NAME}" --region "${AWS_REGION}" --query 'EndpointStatus' --output text 2>/dev/null || echo "Creating")
  if [ "$STATUS" == "InService" ]; then
    echo "Endpoint is InService."
    break
  fi
  sleep 10
done

cd "${SCRIPT_DIR}"
sam build --template-file template.yaml
sam deploy \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides SageMakerEndpointName="${ENDPOINT_NAME}" EnableFallback="true" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --resolve-s3

API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`ReceiptApiEndpoint`].OutputValue' \
  --output text)

ENV_FILE="${ROOT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  grep -v "EXPO_PUBLIC_RECEIPT_API_URL" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi
echo "EXPO_PUBLIC_RECEIPT_API_URL=${API_ENDPOINT}" >> "$ENV_FILE"

echo "==> Deployment Complete!"
echo "API URL: ${API_ENDPOINT}"
