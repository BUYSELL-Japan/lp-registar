/**
 * LP_GetSettings — settings Lambda
 *
 * GET /lp/settings/{storeId} に対して DynamoDB Stores テーブルから店舗情報を返す。
 * templateId フィールドも含めてレスポンスする。
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "http://localhost:5173"
];

export const handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin || "";
    
    // 公開LP（任意のサブドメイン）からも取得できるようにCORSを緩和する
    let allowedOrigin = ALLOWED_ORIGINS[0];
    if (origin) {
        // global-reaches.com のサブドメインか、localhostをすべて許可
        if (origin.endsWith('.global-reaches.com') || origin.startsWith('http://localhost') || ALLOWED_ORIGINS.includes(origin)) {
            allowedOrigin = origin;
        } else {
            // パブリックなGETはどこから呼ばれてもいいように緩和
            allowedOrigin = origin;
        }
    }

    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Content-Type": "application/json"
    };

    // OPTIONS プリフライト
    if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    const method = event.httpMethod || event.requestContext?.http?.method || "GET";

    // ==========================
    // POST: templateId の更新
    // ==========================
    if (method === "POST") {
        try {
            const body = JSON.parse(event.body || "{}");
            const { storeId, templateId } = body;

            if (!storeId || !templateId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "storeId and templateId are required." })
                };
            }

            const validThemes = ["theme1", "theme2", "theme3"];
            if (!validThemes.includes(templateId)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: `Invalid templateId. Must be one of: ${validThemes.join(", ")}` })
                };
            }

            await ddbDocClient.send(new UpdateCommand({
                TableName: "Stores",
                Key: { store_id: storeId },
                UpdateExpression: "SET templateId = :templateId",
                ExpressionAttributeValues: { ":templateId": templateId }
            }));

            console.log(`Updated templateId for store ${storeId} to ${templateId}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, templateId })
            };
        } catch (err) {
            console.error("Error updating templateId:", err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: "Failed to update templateId.", error: err.message })
            };
        }
    }

    // ==========================
    // GET: 店舗設定の取得
    // ==========================
    try {
        // パスパラメータから storeId を取得
        // REST API: /lp/settings/{storeId}
        const storeId = event.pathParameters?.storeId
            || event.pathParameters?.proxy
            || (event.path || "").split("/").pop();

        if (!storeId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "storeId is required." })
            };
        }

        console.log(`Fetching settings for store: ${storeId}`);

        let item = null;

        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: "Stores",
            Key: { store_id: storeId }
        }));

        if (getResult.Item) {
            item = getResult.Item;
        } else {
            // 見つからなかった場合、storeIdに指定された値が「サブドメイン」である可能性を考慮して
            // Subdomainフィールドを対象にスキャン検索を行う
            console.log(`Store not found by store_id, scanning by Subdomain: ${storeId}`);
            const scanResult = await ddbDocClient.send(new ScanCommand({
                TableName: "Stores",
                FilterExpression: "Subdomain = :sub OR subdomain = :sub",
                ExpressionAttributeValues: { ":sub": storeId }
            }));
            if (scanResult.Items && scanResult.Items.length > 0) {
                item = scanResult.Items[0];
                console.log(`Found store via subdomain: ${item.store_id}`);
            }
        }

        if (!item) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: "Store not found." })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                storeId:            item.store_id,
                subdomain:          item.Subdomain || item.subdomain || null,
                subscriptionStatus: item.subscription_status || null,
                planName:           item.plan_name || null,
                trialEnd:           item.trial_end || null,
                templateId:         item.templateId || "theme1",  // ← 追加
                contactEmail:       item.contact_email || null,
            })
        };
    } catch (err) {
        console.error("Error fetching settings:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Failed to fetch settings.", error: err.message })
        };
    }
};
