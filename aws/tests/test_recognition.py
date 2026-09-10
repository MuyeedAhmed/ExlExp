import unittest
import json
import base64
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lambda")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sagemaker")))

import handler
import inference


class TestRecognition(unittest.TestCase):

    def test_extract_card_usage_visa(self):
        text = "TARGET STORE #1823\nTOTAL $45.90\nVISA CREDIT CARD\nACCOUNT: ************4242\nAUTH: 829104"
        card = inference.extract_card_usage(text)
        self.assertEqual(card["cardType"], "Visa")
        self.assertEqual(card["last4"], "4242")

    def test_extract_amounts_and_items(self):
        lines = ["ORGANIC EGGS $7.99", "ALMOND MILK $6.50", "SUBTOTAL $14.49", "TAX $1.16", "TOTAL $15.65"]
        res = inference.extract_amounts_and_items(lines)
        self.assertEqual(res["totalAmount"], 15.65)
        self.assertEqual(len(res["items"]), 2)

    def test_predict_fn_with_text(self):
        payload = {"text": "WHOLE FOODS\nAPPLES $4.99\nTOTAL $4.99\nVISA ************1111"}
        res = inference.predict_fn(payload, None)
        self.assertTrue(res["success"])
        self.assertEqual(res["totalAmount"], 4.99)
        self.assertEqual(res["cardUsage"]["last4"], "1111")

    def test_predict_fn_empty_fails_gracefully(self):
        res = inference.predict_fn({}, None)
        self.assertFalse(res["success"])
        self.assertEqual(res["totalAmount"], 0.0)

    def test_lambda_handler_options(self):
        res = handler.lambda_handler({"httpMethod": "OPTIONS"}, None)
        self.assertEqual(res["statusCode"], 200)

    def test_lambda_handler_with_text(self):
        event = {
            "httpMethod": "POST",
            "body": json.dumps({"image": "FAKE", "text": "COSTCO\nBREAD $5.00\nTOTAL $5.00\nAMEX ************9999"})
        }
        res = handler.lambda_handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["totalAmount"], 5.00)
        self.assertEqual(body["cardUsage"]["cardType"], "American Express")


if __name__ == "__main__":
    unittest.main()
