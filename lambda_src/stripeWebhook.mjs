import Stripe from 'stripe';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

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
        // ============================================================
        // checkout.session.completed → subscription_status を active に
        // ============================================================
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const storeId = session.client_reference_id;
            const subscriptionId = session.subscription;

            if (!storeId) {
                console.warn('checkout.session.completed: storeId (client_reference_id) is missing.');
                return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'No storeId' }) };
            }

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

        // ============================================================
        // customer.subscription.deleted → subscription_status を canceled に
        // ============================================================
        } else if (stripeEvent.type === 'customer.subscription.deleted') {
            const subscription = stripeEvent.data.object;
            const customerId = subscription.customer;

            console.log(`Subscription ${subscription.id} deleted for customer: ${customerId}`);

            if (customerId) {
                let storeId = null;

                // 1. まずCustomerメタデータからstoreIdを取得試行
                try {
                    const customer = await stripe.customers.retrieve(customerId);
                    if (customer && !customer.deleted && customer.metadata && customer.metadata.storeId) {
                        storeId = customer.metadata.storeId;
                    }
                } catch (e) {
                    console.error(`Failed to retrieve customer ${customerId} from Stripe:`, e);
                }

                // 2. メタデータにない場合、DynamoDBを検索してフォールバック
                if (!storeId) {
                    console.log(`No storeId in Stripe metadata for customer ${customerId}. Searching DynamoDB...`);
                    try {
                        const scanCommand = new ScanCommand({
                            TableName: "Stores",
                            FilterExpression: "stripe_customer_id = :customerId",
                            ExpressionAttributeValues: {
                                ":customerId": customerId
                            }
                        });
                        const scanResult = await ddbDocClient.send(scanCommand);
                        if (scanResult.Items && scanResult.Items.length > 0) {
                            storeId = scanResult.Items[0].store_id;
                            console.log(`Found storeId ${storeId} in DynamoDB for customer ${customerId}`);
                        }
                    } catch (e) {
                        console.error(`Failed to scan DynamoDB for customer ${customerId}:`, e);
                    }
                }

                // 3. storeIdが見つかった場合、解約ステータスに更新
                if (storeId) {
                    const updateCommand = new UpdateCommand({
                        TableName: "Stores",
                        Key: { store_id: storeId },
                        UpdateExpression: "SET subscription_status = :status",
                        ExpressionAttributeValues: {
                            ":status": "canceled"
                        }
                    });

                    await ddbDocClient.send(updateCommand);
                    console.log(`Successfully updated store ${storeId} subscription_status to "canceled"`);
                } else {
                    console.warn(`Customer ${customerId} does not have a valid storeId in metadata and was not found in DB. Unable to update mapping.`);
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error(`Error processing webhook event: ${err.message}`);
        return { statusCode: 500, body: `Server Error: ${err.message}` };
    }
};
