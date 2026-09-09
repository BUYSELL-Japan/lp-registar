import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event) => {
    console.log("--- START: LP_ReminderEmail ---");

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const fortyEightHoursAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000));

    try {
        // 1. スキャンして対象ストアを取得
        // subscription_status が未設定（未決済）かつ reminder_sent が未設定のものを探す
        const scanCommand = new ScanCommand({
            TableName: "Stores",
            FilterExpression: "(attribute_not_exists(subscription_status) OR subscription_status = :unpaid) AND attribute_not_exists(reminder_sent)",
            ExpressionAttributeValues: {
                ":unpaid": "unpaid"
            }
        });

        const scanResult = await ddbDocClient.send(scanCommand);
        const stores = scanResult.Items || [];

        console.log(`Found ${stores.length} potential stores without subscription.`);

        let sentCount = 0;

        for (const store of stores) {
            const createdAt = new Date(store.created_at);
            
            // 24時間以上〜48時間未満のレコードのみ対象とする
            if (createdAt < twentyFourHoursAgo && createdAt > fortyEightHoursAgo) {
                const toEmail = store.contact_email;
                if (!toEmail) {
                    console.log(`Store ${store.store_id} has no contact_email. Skipping.`);
                    continue;
                }

                console.log(`Sending reminder to ${toEmail} for store ${store.store_id}...`);

                // 2. メール送信 (Resend)
                const success = await sendReminderEmail(toEmail, store.store_name_kanji || "店舗オーナー");

                if (success) {
                    // 3. 送信フラグをDynamoDBに保存 (二重送信防止)
                    const updateCommand = new UpdateCommand({
                        TableName: "Stores",
                        Key: { store_id: store.store_id },
                        UpdateExpression: "SET reminder_sent = :rs, reminder_sent_at = :rsa",
                        ExpressionAttributeValues: {
                            ":rs": true,
                            ":rsa": now.toISOString()
                        }
                    });
                    await ddbDocClient.send(updateCommand);
                    console.log(`Store ${store.store_id} marked as reminded.`);
                    sentCount++;
                }
            } else {
                console.log(`Store ${store.store_id} created at ${store.created_at} is out of the 24-48h window. Skipping.`);
            }
        }

        console.log(`--- END: LP_ReminderEmail. Sent ${sentCount} reminders. ---`);
        return { statusCode: 200, body: `Sent ${sentCount} reminders.` };

    } catch (error) {
        console.error("Error in reminder job:", error);
        throw error;
    }
};

async function sendReminderEmail(toEmail, storeName) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "support@mail.global-reaches.com";

    if (!apiKey) {
        console.error("RESEND_API_KEY is not set.");
        return false;
    }

    const emailSubject = "【Landy】アカウント登録ありがとうございます（次のステップのご案内）";
    
    // 寄り添い・ご案内型のトーン
    const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <h2 style="color: #0d9488;">Landy（ランディー）へのご登録ありがとうございます</h2>
        
        <p>${storeName} 様</p>
        
        <p>はじめまして、飲食店向け多言語自動生成SaaS「Landy」サポートチームです。<br>
        この度は、店舗情報のご入力・アカウント作成をいただき、誠にありがとうございます。</p>

        <p>現在、${storeName} 様の多言語サイトを作成するための準備が整っております。<br>
        サイトを実際にAIで構築し、全世界へ向けて公開するためには、初期費用およびシステム利用料の決済を完了していただく必要がございます。</p>

        <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 15px; margin: 25px 0;">
            <p style="margin: 0;"><strong>💡 次のステップ：サイトの公開</strong></p>
            <p style="margin: 10px 0 0 0;">
                以下の管理画面リンクより再度ログインしていただくと、決済画面へお進みいただけます。<br>
                決済完了後、即座にAIが翻訳・構築を行い、4言語のページが公開されます。
            </p>
            <div style="text-align: center; margin-top: 20px;">
                <a href="https://admin-lp.global-reaches.com/" style="background-color: #0d9488; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">管理画面へログインして公開手続きへ進む</a>
            </div>
        </div>

        <p><strong>何かご不明な点はおありでしょうか？</strong></p>
        <p>「管理画面の使い方がわからない」「決済前に確認したいことがある」など、ご不安な点がございましたら、このメールにそのままご返信いただくか、サポート窓口までお気軽にご相談ください。</p>

        <p>引き続き、Landyをよろしくお願いいたします。</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">
            Landy サポートチーム<br>
            <a href="https://webdesign.neural-seeds.com" style="color: #0d9488;">https://webdesign.neural-seeds.com</a>
        </p>
    </div>
    `;

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: `Landy Support <${fromEmail}>`,
                to: [toEmail],
                subject: emailSubject,
                html: emailHtml,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Resend API Error:", result);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Fetch Error:", error);
        return false;
    }
}
