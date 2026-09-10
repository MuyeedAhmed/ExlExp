# ExlExp — AWS Receipt Recognition Engine

This directory contains the cloud infrastructure and model serving code for the **ExlExp Receipt Recognition Engine**, powered by **Amazon SageMaker** and **AWS Lambda**.

---

## 🏛️ Architecture

```
                               ┌────────────────────────────────┐
                               │   Amazon SageMaker Endpoint    │
                               │   (Document AI / Donut / OCR)  │
                               └───────────────▲────────────────┘
                                               │ InvokeEndpoint
                                               │
┌───────────────────────────┐  HTTPS POST      │
│ ExlExp Mobile & Web App   ├──────────────►┌──┴─────────────┐
│ (Camera/Photo/File Input) │               │   AWS Lambda   │
└───────────────────────────┘               │   Handler      │
                                            └────────────────┘
```

1. **Client (React Native / Web)**: Captures or picks a receipt image, converts it to base64, and submits it to the API.
2. **AWS Lambda (`handler.py`)**: Validates payload, coordinates authentication, invokes the SageMaker endpoint, handles CORS, and formats the output.
3. **Amazon SageMaker (`inference.py`)**: Runs OCR and document understanding on the receipt image, extracting:
   - **Card Usage**: Card network brand (Visa, Mastercard, Amex, Discover), last 4 digits, auth code.
   - **Total Amount**: Total transaction amount, subtotal, sales tax, tip.
   - **Itemwise Breakdown**: Individual item names, quantities, unit prices, and amounts.
   - **Merchant & Date**: Store name and purchase date.

---

## 🚀 Deployment Instructions

### 1. Prerequisites
- [AWS CLI](https://aws.amazon.com/cli/) configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Python 3.10+
- An AWS IAM Role with `AmazonSageMakerFullAccess`

### 2. Deploy Amazon SageMaker Endpoint

```bash
cd aws/sagemaker
pip install -r requirements.txt

# Deploy Serverless SageMaker Endpoint (No idle cost)
python deploy_endpoint.py \
  --mode serverless \
  --endpoint-name receipt-recognition-endpoint \
  --role-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:role/<YOUR_SAGEMAKER_ROLE>

# Or Deploy Real-Time SageMaker Instance
python deploy_endpoint.py \
  --mode realtime \
  --instance-type ml.m5.large \
  --endpoint-name receipt-recognition-endpoint \
  --role-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:role/<YOUR_SAGEMAKER_ROLE>
```

To test the deployed SageMaker endpoint with a test receipt:
```bash
python deploy_endpoint.py --test --endpoint-name receipt-recognition-endpoint --image sample_receipt.jpg
```

---

### 3. Deploy AWS Lambda & API Gateway with AWS SAM

From the `aws/` directory:

```bash
cd aws
sam build
sam deploy --guided
```

SAM will prompt you for:
- **Stack Name**: `exlexp-receipt-recognition`
- **AWS Region**: e.g. `us-east-1`
- **Parameter SageMakerEndpointName**: `receipt-recognition-endpoint`
- **Allow SAM CLI to create IAM roles with required permissions**: `Y`

Upon completion, SAM outputs your **API Endpoint URL**:
```
Outputs:
ReceiptApiEndpoint: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/recognize-receipt
```

---

### 4. Connect to ExlExp App

In your `.env` or app config:
```env
# Point directly to your deployed AWS Lambda API Gateway URL
EXPO_PUBLIC_RECEIPT_API_URL=https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/recognize-receipt

# Or configure server.js to proxy to AWS Lambda:
AWS_RECEIPT_LAMBDA_URL=https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/recognize-receipt
```

When running in the web browser, ExlExp can run client-side OCR directly via Tesseract.js if no backend endpoint is configured.
