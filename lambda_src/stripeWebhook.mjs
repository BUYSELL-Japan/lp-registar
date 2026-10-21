import Stripe from 'stripe';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// subscription_status を Stripe と同期するイベント
const SUBSCRIPTION_EVENTS = new Set([
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'invoice.paid',
]);

// 店舗LPを非公開にする状態（LP_ListStores と揃える）。past_due（再請求中）は公開を続ける
const HIDDEN_STATUSES = new Set(['unpaid', 'canceled']);

// 公開・非公開が切り替わったときに店舗LPを再ビルドする Cloudflare の Deploy Hook
const CLOUDFLARE_WEBHOOK_URL = process.env.CLOUDFLARE_WEBHOOK_URL;

const triggerCloudflareWebhook = async () => {
    if (!CLOUDFLARE_WEBHOOK_URL) {
        console.error('CLOUDFLARE_WEBHOOK_URL is not set. Skipping deploy hook.');
        return false;
    }
    try {
        const res = await fetch(CLOUDFLARE_WEBHOOK_URL, { method: 'POST' });
        console.log(`Cloudflare webhook triggered: ${res.status}`);
        return res.ok;
    } catch (err) {
        console.error('Cloudflare webhook error:', err);
        return false;
    }
};

const getSubscriptionId = (stripeEvent) => {
    const obj = stripeEvent.data.object;
    if (stripeEvent.type.startsWith('customer.subscription.')) return obj.id;
    // invoice: API 2025-03-31 以降は parent.subscription_details.subscription、それ以前は subscription
    const sub = obj.parent?.subscription_details?.subscription ?? obj.subscription;
    return typeof sub === 'string' ? sub : sub?.id || null;
};

// Customer の metadata.storeId から店舗を特定し、無ければ Stores を stripe_customer_id で検索する
const findStoreId = async (customerId) => {
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted && customer.metadata?.storeId) {
            return customer.metadata.storeId;
        }
    } catch (e) {
        console.error(`Failed to retrieve customer ${customerId} from Stripe:`, e);
    }

    console.log(`No storeId in Stripe metadata for customer ${customerId}. Searching DynamoDB...`);
    const scanResult = await ddbDocClient.send(new ScanCommand({
        TableName: "Stores",
        FilterExpression: "stripe_customer_id = :customerId",
        ExpressionAttributeValues: { ":customerId": customerId }
    }));
    return scanResult.Items?.[0]?.store_id || null;
};

// イベントの順番が前後したり重複したりしても正しい状態になるよう、毎回 Stripe から最新の状態を取得して書き込む
const syncSubscriptionStatus = async (subscriptionId, eventType) => {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const storeId = customerId ? await findStoreId(customerId) : null;
    if (!storeId) {
        console.warn(`${eventType}: store not found for subscription ${subscriptionId} (customer ${customerId}).`);
        return;
    }

    const { Item: store } = await ddbDocClient.send(new GetCommand({
        TableName: "Stores",
        Key: { store_id: storeId },
        ProjectionExpression: "subscription_status, stripe_subscription_id"
    }));
    if (!store) {
        console.warn(`${eventType}: store ${storeId} does not exist in Stores.`);
        return;
    }
    if (store.stripe_subscription_id && store.stripe_subscription_id !== subscription.id) {
        console.warn(`${eventType}: store ${storeId} is linked to ${store.stripe_subscription_id}, not ${subscription.id}. Skipping.`);
        return;
    }

    const oldStatus = store.subscription_status;
    const newStatus = subscription.status;
    if (oldStatus === newStatus) {
        console.log(`${eventType}: store ${storeId} already ${newStatus}.`);
        return;
    }

    await ddbDocClient.send(new UpdateCommand({
        TableName: "Stores",
        Key: { store_id: storeId },
        UpdateExpression: "SET subscription_status = :status, stripe_subscription_id = if_not_exists(stripe_subscription_id, :subId)",
        ExpressionAttributeValues: { ":status": newStatus, ":subId": subscription.id }
    }));
    console.log(`${eventType}: store ${storeId} subscription_status ${oldStatus} -> ${newStatus}`);

    if (HIDDEN_STATUSES.has(oldStatus) !== HIDDEN_STATUSES.has(newStatus)) {
        console.log(`Store ${storeId} visibility changed. Triggering Cloudflare deploy webhook...`);
        await triggerCloudflareWebhook();
    }
};

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
            // Stripe metadata から templateId / ref（紹介コード）を取得
            const templateId = session.metadata?.templateId || 'theme1';
            const referralCode = session.metadata?.ref || null;

            let updateExpression = "SET subscription_status = :status, stripe_subscription_id = :subId, stripe_customer_id = :customerId, templateId = :templateId";
            const expressionAttributeValues = {
                ":status": "active",
                ":subId": subscriptionId,
                ":customerId": customerId || null,
                ":templateId": templateId,
            };

            if (referralCode) {
                updateExpression += ", referral_code = :referralCode";
                expressionAttributeValues[":referralCode"] = referralCode;
            }

            const updateCommand = new UpdateCommand({
                TableName: "Stores",
                Key: { store_id: storeId },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues
            });
            await ddbDocClient.send(updateCommand);
            console.log(`Successfully updated store ${storeId} to active (${subscriptionId}) with customer: ${customerId}, templateId: ${templateId}, referralCode: ${referralCode}`);

        // ============================================================
        // サブスクリプションの状態変化（支払い失敗・復旧・解約など）
        // → Stripe から最新のサブスクリプションを取得して subscription_status に反映
        // ============================================================
        } else if (SUBSCRIPTION_EVENTS.has(stripeEvent.type)) {
            const subscriptionId = getSubscriptionId(stripeEvent);
            if (!subscriptionId) {
                console.log(`${stripeEvent.type}: no subscription attached. Skipping.`);
            } else {
                await syncSubscriptionStatus(subscriptionId, stripeEvent.type);
            }
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error(`Error processing webhook event: ${err.message}`);
        return { statusCode: 500, body: `Server Error: ${err.message}` };
    }
};
