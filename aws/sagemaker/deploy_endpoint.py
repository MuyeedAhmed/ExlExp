#!/usr/bin/env python3
import argparse
import os
import sys
import json
import base64
import tarfile
import boto3
from typing import Optional


def package_and_upload_model(s3_bucket: str, region: str) -> str:
    s3_client = boto3.client("s3", region_name=region)
    try:
        if region == "us-east-1":
            s3_client.create_bucket(Bucket=s3_bucket)
        else:
            s3_client.create_bucket(Bucket=s3_bucket, CreateBucketConfiguration={"LocationConstraint": region})
    except Exception:
        pass

    tar_path = os.path.join("/tmp", "receipt_model.tar.gz")
    script_dir = os.path.dirname(os.path.abspath(__file__))

    with tarfile.open(tar_path, "w:gz") as tar:
        for f in ["inference.py", "requirements.txt"]:
            fp = os.path.join(script_dir, f)
            if os.path.exists(fp):
                tar.add(fp, arcname=f"code/{f}")

    key = "receipt-recognition/model.tar.gz"
    s3_client.upload_file(tar_path, s3_bucket, key)
    return f"s3://{s3_bucket}/{key}"


def deploy_sagemaker_endpoint(
    endpoint_name: str,
    role_arn: str,
    s3_bucket: Optional[str] = None,
    mode: str = "serverless",
    instance_type: str = "ml.m5.large",
    region: str = "us-east-1",
):
    sagemaker_client = boto3.client("sagemaker", region_name=region)

    try:
        import sagemaker
        image_uri = sagemaker.image_uris.retrieve(
            framework="pytorch",
            region=region,
            version="2.1.0",
            py_version="py310",
            image_scope="inference",
            instance_type="serverless" if mode == "serverless" else instance_type,
        )
    except Exception:
        image_uri = f"763104351884.dkr.ecr.{region}.amazonaws.com/pytorch-inference:2.1.0-cpu-py310"

    model_name = f"{endpoint_name}-model"
    endpoint_config_name = f"{endpoint_name}-config"

    primary_container = {
        "Image": image_uri,
        "Environment": {"SAGEMAKER_PROGRAM": "inference.py"},
    }
    if s3_bucket:
        model_url = package_and_upload_model(s3_bucket, region)
        primary_container["ModelDataUrl"] = model_url
        primary_container["Environment"]["SAGEMAKER_SUBMIT_DIRECTORY"] = model_url

    try:
        sagemaker_client.create_model(
            ModelName=model_name,
            PrimaryContainer=primary_container,
            ExecutionRoleArn=role_arn,
        )
    except sagemaker_client.exceptions.ClientError as e:
        if "Cannot create already existing model" not in str(e):
            raise e

    if mode == "serverless":
        variants = [{
            "VariantName": "AllTraffic",
            "ModelName": model_name,
            "ServerlessConfig": {"MemorySizeInMB": 2048, "MaxConcurrency": 5},
        }]
    else:
        variants = [{
            "VariantName": "AllTraffic",
            "ModelName": model_name,
            "InitialInstanceCount": 1,
            "InstanceType": instance_type,
        }]

    try:
        sagemaker_client.create_endpoint_config(
            EndpointConfigName=endpoint_config_name,
            ProductionVariants=variants,
        )
    except sagemaker_client.exceptions.ClientError as e:
        if "Cannot create already existing endpoint configuration" not in str(e):
            raise e

    try:
        sagemaker_client.create_endpoint(
            EndpointName=endpoint_name,
            EndpointConfigName=endpoint_config_name,
        )
    except sagemaker_client.exceptions.ClientError as e:
        if "Cannot create already existing endpoint" in str(e):
            sagemaker_client.update_endpoint(
                EndpointName=endpoint_name,
                EndpointConfigName=endpoint_config_name,
            )
        else:
            raise e


def test_endpoint(endpoint_name: str, image_path: str, region: str = "us-east-1"):
    runtime_client = boto3.client("sagemaker-runtime", region_name=region)
    with open(image_path, "rb") as f:
        b64_encoded = base64.b64encode(f.read()).decode("utf-8")

    response = runtime_client.invoke_endpoint(
        EndpointName=endpoint_name,
        ContentType="application/json",
        Body=json.dumps({"image": b64_encoded}),
    )
    result = json.loads(response["Body"].read().decode("utf-8"))
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["serverless", "realtime"], default="serverless")
    parser.add_argument("--endpoint-name", default="receipt-recognition-endpoint")
    parser.add_argument("--role-arn", default=os.environ.get("SAGEMAKER_ROLE_ARN", ""))
    parser.add_argument("--s3-bucket", default=os.environ.get("MODEL_S3_BUCKET", ""))
    parser.add_argument("--instance-type", default="ml.m5.large")
    parser.add_argument("--region", default=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--image")

    args = parser.parse_args()

    if args.test:
        test_endpoint(args.endpoint_name, args.image, args.region)
    else:
        deploy_sagemaker_endpoint(
            endpoint_name=args.endpoint_name,
            role_arn=args.role_arn,
            s3_bucket=args.s3_bucket,
            mode=args.mode,
            instance_type=args.instance_type,
            region=args.region,
        )
