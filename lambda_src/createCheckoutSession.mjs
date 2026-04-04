import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "http://localhost:5173"
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
        const { storeId } = body;

        if (!storeId) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ message: "Store ID is required." })
            };
        }

        const priceId = process.env.STRIPE_PRICE_ID; 
        if (!priceId) {
            console.error("STRIPE_PRICE_ID is not set in environment variables.");
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ message: "Configuration error: Missing Price ID." })
            };
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${allowedOrigin}/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${allowedOrigin}/`,
            client_reference_id: storeId,
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
