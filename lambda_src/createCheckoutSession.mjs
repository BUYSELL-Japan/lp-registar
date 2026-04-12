import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
        const { storeId, planType = 'monthly', templateId = 'theme1' } = body;

        if (!storeId) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ message: "Store ID is required." })
            };
        }

        // 月額と年額のPrice ID
        const pricingMap = {
            monthly: "price_1TGpUOF0xTh0wRdTLx34wepz",
            yearly: "price_1TKQUBF0xTh0wRdTAvm8yCWw"
        };

        const priceId = pricingMap[planType] || pricingMap.monthly;

        // ★StripeのAccounts V2 (テストモード制限) を回避＆本番移行をスムーズにするため、
        // 先に「顧客(Customer)」を作成してからチェックアウトセッションに紐づけます。
        const customer = await stripe.customers.create({
            metadata: {
                storeId: storeId,
                templateId: templateId
            }
        });

        const isLocal = origin.includes("localhost") || origin.includes("[::1]");
        const successUrlBase = isLocal ? allowedOrigin : "https://admin-lp.global-reaches.com";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer: customer.id, // ★作成した顧客IDを指定
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${successUrlBase}/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${successUrlBase}/`,
            client_reference_id: storeId,
            metadata: {
                templateId: templateId,
                storeId: storeId,
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
