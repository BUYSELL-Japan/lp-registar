import Stripe from 'stripe';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "https://global-reaches.com",
    "http://localhost:5173",
    "http://localhost:4321"
];

export const handler = async (event) => {
    let origin = "";
    if (event.headers) {
        origin = event.headers.origin || event.headers.Origin || "";
    }

    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers: headers, body: "" };
    }

    try {
        const body = JSON.parse(event.body);
        const { storeId, planType = 'monthly', templateId = 'theme1', ref } = body;

        if (!storeId) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ message: "Store ID is required." })
            };
        }

        // 紹介コードが渡された場合はReferralCodesテーブルで存在確認する。
        // 未知/無効なコードは無視して決済フロー自体は継続する（typo等でブロックしない）。
        let referralCode;
        if (ref) {
            const normalizedRef = String(ref).trim().toUpperCase();
            if (normalizedRef) {
                try {
                    const refResult = await ddbDocClient.send(new GetCommand({
                        TableName: "LP_ReferralCodes",
                        Key: { referral_code: normalizedRef }
                    }));
                    if (refResult.Item && refResult.Item.active !== false) {
                        referralCode = normalizedRef;
                    }
                } catch (e) {
                    console.error("Failed to validate referral code:", e);
                }
            }
        }

        // 初期費用と月額のPrice ID (プレースホルダー)
        const pricingMap = {
            monthly: "price_1UDc95F0xTh0wRdTzT0pd1la",
            initialFee: "price_1UDc9qF0xTh0wRdTmZHFDJn9"
        };

        const priceId = pricingMap.monthly;
        const initialFeePriceId = pricingMap.initialFee;

        // ★StripeのAccounts V2 (テストモード制限) を回避＆本番移行をスムーズにするため、
        // 先に「顧客(Customer)」を作成してからチェックアウトセッションに紐づけます。
        const customer = await stripe.customers.create({
            metadata: {
                storeId: storeId,
                templateId: templateId,
                ...(referralCode ? { ref: referralCode } : {})
            }
        });

        const isLocal = origin.includes("localhost") || origin.includes("[::1]");
        const successUrlBase = isLocal ? allowedOrigin : "https://admin-lp.global-reaches.com";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer: customer.id, // ★作成した顧客IDを指定
            allow_promotion_codes: true, // ★ここでプロモーションコード（クーポン）の入力を許可する
            line_items: [
                {
                    price: priceId, // 月額
                    quantity: 1,
                },
                {
                    price: initialFeePriceId, // 初期費用
                    quantity: 1,
                }
            ],
            mode: 'subscription',
            success_url: `${successUrlBase}/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${successUrlBase}/`,
            client_reference_id: storeId,
            metadata: {
                templateId: templateId,
                storeId: storeId,
                ...(referralCode ? { ref: referralCode } : {})
            },
        });

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ sessionId: session.id, url: session.url })
        };
    } catch (error) {
        console.error("Stripe Error:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ message: error.message })
        };
    }
};
