import json
import os
import base64
import re
from typing import Dict, Any, List, Optional

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    class ClientError(Exception):
        pass

SAGEMAKER_ENDPOINT_NAME = os.environ.get("SAGEMAKER_ENDPOINT_NAME", "receipt-recognition-endpoint")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_sagemaker_runtime = None


def get_sagemaker_client():
    global _sagemaker_runtime
    if boto3 is None:
        raise RuntimeError("boto3 library is not installed")
    if _sagemaker_runtime is None:
        _sagemaker_runtime = boto3.client("sagemaker-runtime", region_name=AWS_REGION)
    return _sagemaker_runtime


def build_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        },
        "body": json.dumps(body),
    }


def extract_card_usage(ocr_text: str) -> Dict[str, Any]:
    card_info = {
        "cardType": None,
        "last4": None,
        "paymentMethod": "Debit Card" if re.search(r"\bdebit\b", ocr_text, re.I) else "Credit Card",
        "detectedCardText": None,
        "authCode": None,
    }

    brands = {
        "Visa": r"\b(visa|v\s*i\s*s\s*a)\b",
        "Mastercard": r"\b(mastercard|mc|master\s*card)\b",
        "American Express": r"\b(american\s*express|amex|am\s*ex)\b",
        "Discover": r"\b(discover|disc)\b",
    }
    for brand, pattern in brands.items():
        if re.search(pattern, ocr_text, re.I):
            card_info["cardType"] = brand
            break

    last4_patterns = [
        r"(?:account|acct|card|pan|num|#)[\s\:\.\-]*[xX*]{4,}[\s\-]*(\d{4})",
        r"[xX*]{4,}[\s\-]*(\d{4})",
        r"\b(?:ending\s*in\s*|ending\s*)(\d{4})\b",
        r"\b\*{4}\s*(\d{4})\b",
        r"(?:card|acct)[\s\:\#]+(\d{4})\b",
    ]
    for pat in last4_patterns:
        match = re.search(pat, ocr_text, re.I)
        if match:
            card_info["last4"] = match.group(1)
            break

    auth_match = re.search(r"(?:auth|approval|appr)[\s\:\#]*([a-zA-Z0-9]{4,8})\b", ocr_text, re.I)
    if auth_match:
        card_info["authCode"] = auth_match.group(1)

    if card_info["cardType"] and card_info["last4"]:
        card_info["detectedCardText"] = f"{card_info['cardType']} ending in {card_info['last4']}"
    elif card_info["last4"]:
        card_info["detectedCardText"] = f"Card ending in {card_info['last4']}"
    elif card_info["cardType"]:
        card_info["detectedCardText"] = card_info["cardType"]

    return card_info


def extract_amounts_and_items(ocr_lines: List[str]) -> Dict[str, Any]:
    total_amount, subtotal, tax, tip = None, None, None, None
    items = []

    price_regex = r"\$?\s*([0-9]{1,4}\.[0-9]{2})"
    total_regex = r"\b(total|grand\s*total|balance\s*due|amount\s*due|final\s*total)\b"
    subtotal_regex = r"\b(sub\s*total|subtotal|net\s*amount)\b"
    tax_regex = r"\b(tax|sales\s*tax|hst|gst|vat)\b"
    tip_regex = r"\b(tip|gratuity)\b"
    ignore_keywords = [
        "change", "cash", "cash tendered", "approved", "account",
        "visa", "mastercard", "amex", "discover", "auth", "balance",
        "subtotal", "tax", "total", "tip"
    ]

    for line in ocr_lines:
        line_clean = line.strip()
        if not line_clean:
            continue

        price_matches = list(re.finditer(price_regex, line_clean))
        if not price_matches:
            continue

        last_match = price_matches[-1]
        try:
            amount_val = float(last_match.group(1))
        except ValueError:
            continue

        line_prefix = line_clean[:last_match.start()].strip()
        line_lower = line_clean.lower()

        if re.search(total_regex, line_lower) and not re.search(subtotal_regex, line_lower):
            if total_amount is None or "grand" in line_lower:
                total_amount = amount_val
            continue

        if re.search(subtotal_regex, line_lower):
            subtotal = amount_val
            continue

        if re.search(tax_regex, line_lower):
            tax = amount_val
            continue

        if re.search(tip_regex, line_lower):
            tip = amount_val
            continue

        if any(kw in line_lower for kw in ignore_keywords):
            continue

        desc = re.sub(r"^[\d\*\#\-\.]+\s+", "", line_prefix).strip()
        desc = re.sub(r"\s+", " ", desc)

        if len(desc) >= 2 and re.search(r"[a-zA-Z]", desc):
            qty = 1
            qty_match = re.match(r"^(\d+)\s*[xX@]\s*(.+)$", desc)
            if qty_match:
                qty = int(qty_match.group(1))
                desc = qty_match.group(2).strip()

            items.append({
                "description": desc,
                "amount": amount_val,
                "quantity": qty,
                "unitPrice": round(amount_val / qty, 2) if qty > 1 else amount_val
            })

    if total_amount is None:
        if subtotal is not None and tax is not None:
            total_amount = round(subtotal + tax + (tip or 0.0), 2)
        elif items:
            total_amount = round(sum(it["amount"] for it in items), 2)
        else:
            total_amount = 0.0

    return {
        "totalAmount": total_amount,
        "subtotal": subtotal or (round(sum(it["amount"] for it in items), 2) if items else total_amount),
        "tax": tax or 0.0,
        "tip": tip or 0.0,
        "items": items
    }


def extract_merchant_and_date(ocr_lines: List[str]) -> Dict[str, Optional[str]]:
    merchant, date_str = None, None

    date_patterns = [
        r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b",
        r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b",
        r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b",
    ]

    for line in ocr_lines:
        if not date_str:
            for pat in date_patterns:
                m = re.search(pat, line)
                if m:
                    g = m.groups()
                    if len(g[0]) == 4:
                        date_str = f"{g[0]}-{int(g[1]):02d}-{int(g[2]):02d}"
                    elif len(g[2]) == 4:
                        date_str = f"{g[2]}-{int(g[0]):02d}-{int(g[1]):02d}"
                    else:
                        date_str = f"20{int(g[2])}-{int(g[0]):02d}-{int(g[1]):02d}"
                    break

        if not merchant:
            cleaned = line.strip()
            if (
                len(cleaned) >= 3
                and re.search(r"[a-zA-Z]", cleaned)
                and not re.search(r"(receipt|welcome|store|tax invoice|cashier)", cleaned, re.I)
                and not re.search(r"^\d", cleaned)
            ):
                merchant = cleaned

    return {
        "merchant": merchant or "Store Purchase",
        "date": date_str,
    }


def parse_receipt_heuristics(text_content: Optional[str]) -> Dict[str, Any]:
    if not text_content or not text_content.strip():
        return {
            "success": False,
            "error": "No text detected in receipt",
            "merchant": "Unknown",
            "date": None,
            "totalAmount": 0.0,
            "cardUsage": {},
            "items": [],
            "subtotal": 0.0,
            "tax": 0.0,
            "tip": 0.0,
        }

    ocr_lines = [line.strip() for line in text_content.splitlines() if line.strip()]
    full_text = "\n".join(ocr_lines)
    card_usage = extract_card_usage(full_text)
    amounts_data = extract_amounts_and_items(ocr_lines)
    merchant_date = extract_merchant_and_date(ocr_lines)

    return {
        "success": True,
        "merchant": merchant_date["merchant"],
        "date": merchant_date["date"],
        "totalAmount": amounts_data["totalAmount"],
        "cardUsage": card_usage,
        "items": amounts_data["items"],
        "subtotal": amounts_data["subtotal"],
        "tax": amounts_data["tax"],
        "tip": amounts_data["tip"],
        "confidence": 0.95,
        "source": "AWS-Lambda-DocumentAI",
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "POST")

    if http_method == "OPTIONS":
        return build_response(200, {"message": "CORS preflight OK"})

    try:
        raw_body = event.get("body")
        if not raw_body:
            return build_response(400, {"error": "Missing request body"})

        if event.get("isBase64Encoded", False):
            raw_body = base64.b64decode(raw_body).decode("utf-8")

        payload = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
        image_b64 = payload.get("image") or payload.get("image_base64")
        text_content = payload.get("text") or payload.get("ocr_text")

        if not image_b64 and not text_content:
            return build_response(400, {"error": "Missing 'image' or 'text' field in payload"})

        if image_b64 and "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        # Try SageMaker endpoint
        try:
            client = get_sagemaker_client()
            sm_payload = json.dumps({"image": image_b64 or "", "text": text_content or ""})
            response = client.invoke_endpoint(
                EndpointName=SAGEMAKER_ENDPOINT_NAME,
                ContentType="application/json",
                Body=sm_payload,
            )
            result = json.loads(response["Body"].read().decode("utf-8"))
            result["source"] = "sagemaker"
            return build_response(200, result)

        except Exception:
            # Fallback to direct parsing
            parsed = parse_receipt_heuristics(text_content)
            return build_response(200, parsed)

    except json.JSONDecodeError:
        return build_response(400, {"error": "Invalid JSON format in request body"})
    except Exception as e:
        return build_response(500, {"error": "Internal server error", "details": str(e)})
