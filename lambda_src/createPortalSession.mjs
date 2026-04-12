import Stripe from 'stripe';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "https://webdesign.neuralseed.tech",
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

        const getCommand = new GetCommand({
            TableName: "Stores",
            Key: { store_id: storeId }
        });
        
        const { Item } = await ddbDocClient.send(getCommand);
        
        if (!Item || !Item.stripe_customer_id) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ message: "Customer ID not found for this store. A checkout session must be completed first." })
            };
        }

        const customerId = Item.stripe_customer_id;

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${allowedOrigin}/`,
        });

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ url: session.url })
        };
    } catch (error) {
        console.error("Stripe Portal Error:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ message: error.message })
        };
    }
};