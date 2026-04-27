import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const ALLOWED_ORIGINS = [
    "https://admin-lp.global-reaches.com",
    "https://register.global-reaches.com",
    "https://shop.yuimaru-ship.box-pals.com",
    "http://localhost:5173",
    "http://[::1]:5173",
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

    let parsedBody;
    try {
        parsedBody = JSON.parse(event.body);
    } catch (error) {
        console.error("Failed to parse event body:", error);
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ message: "Invalid JSON format." }),
        };
    }

    try {
        const { cognito_sub } = parsedBody;

        if (!cognito_sub) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ message: "cognito_sub is required." }),
            };
        }

        // Stores テーブルをスキャンして cognito_sub が一致する店舗を検索
        const scanCommand = new ScanCommand({
            TableName: "Stores",
            FilterExpression: "cognito_sub = :sub",
            ExpressionAttributeValues: {
                ":sub": cognito_sub
            }
        });

        const result = await ddbDocClient.send(scanCommand);

        if (result.Items && result.Items.length > 0) {
            // ★修正: 複数アイテムがある場合は subscription_status=active を優先して返す
            const items = result.Items;
            const activeStore = items.find(item => item.subscription_status === "active");
            const store = activeStore || items[0];

            console.log(`Found ${items.length} store(s) for cognito_sub. Using store_id: ${store.store_id} (status: ${store.subscription_status || "none"})`);

            // ★修正: 常に200で返す（404だとcheckResponse.okがfalseになり再登録されてしまう）
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    found: true,
                    storeId: store.store_id,
                    subscriptionStatus: store.subscription_status || "unpaid",
                    templateId: store.templateId || "theme1"
                })
            };
        } else {
            // ★修正: 404ではなく200+found:falseで返す（再登録を防ぐ）
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    found: false,
                    message: "Store not found for this user."
                })
            };
        }

    } catch (error) {
        console.error("Error fetching store by cognito_sub:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ message: "Internal server error.", error: error.message }),
        };
    }
};
