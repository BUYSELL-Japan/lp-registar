/**
 * LP_GetSettings — settings Lambda
 *
 * GET /lp/settings/{storeId} に対して DynamoDB Stores テーブルから店舗情報を返す。
 * templateId フィールドも含めてレスポンスする。
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "http://localhost:5173"
];

export const handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

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

        const result = await ddbDocClient.send(new GetCommand({
            TableName: "Stores",
            Key: { store_id: storeId }
        }));

        if (!result.Item) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: "Store not found." })
            };
        }

        const item = result.Item;

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
