import Stripe from 'stripe';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event) => {
    // API Gateway (HTTP API / REST API) の違いやプロキシ統合により body は base64 エンコードされている場合があります
    let rawBody = event.body;
    if (event.isBase64Encoded) {
        rawBody = Buffer.from(event.body, 'base64').toString('utf8');
    }

    const signature = event.headers['Stripe-Signature'] || event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return {
            statusCode: 400,
            body: `Webhook Error: ${err.message}`
        };
    }

    try {
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const storeId = session.client_reference_id;
            const subscriptionId = session.subscription;

            if (storeId) {
                const customerId = session.customer;
                // Stripe metadata から templateId を取得（デフォルト: theme1）
                const templateId = session.metadata?.templateId || 'theme1';

                const updateCommand = new UpdateCommand({
                    TableName: "Stores",
                    Key: { store_id: storeId },
                    UpdateExpression: "SET subscription_status = :status, stripe_subscription_id = :subId, stripe_customer_id = :customerId, templateId = :templateId",
                    ExpressionAttributeValues: {
                        ":status": "active",
                        ":subId": subscriptionId,
                        ":customerId": customerId || null,
                        ":templateId": templateId,
                    }
                });
                await ddbDocClient.send(updateCommand);
                console.log(`Successfully updated store ${storeId} to active (${subscriptionId}) with customer: ${customerId}, templateId: ${templateId}`);
            }

        } 
        else if (stripeEvent.type === 'customer.subscription.deleted') {
            const subscription = stripeEvent.data.object;
            // NOTE: DynamoDBに stripe_subscription_id のGSIを作成すれば、解約時に簡単にステータスをinactiveにできます。
            // 必要に応じて実装を追加してください。
            console.log(`Subscription ${subscription.id} deleted. Need to update store mapping.`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error(`Error processing webhook event: ${err.message}`);
        return { statusCode: 500, body: `Server Error: ${err.message}` };
    }
};
