import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-southeast-2" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function check() {
    try {
        console.log("Checking store_id: 01KQ6MW5F8RHJ8BVW1V14HG5MB");
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: "Stores",
            Key: { store_id: "01KQ6MW5F8RHJ8BVW1V14HG5MB" }
        }));
        
        if (getResult.Item) {
            console.log("Found by store_id!", getResult.Item);
        } else {
            console.log("Not found by store_id. Scanning all to see if it exists...");
            const scanResult = await ddbDocClient.send(new ScanCommand({
                TableName: "Stores"
            }));
            const allItems = scanResult.Items || [];
            console.log(`Total items in Stores table: ${allItems.length}`);
            
            const match = allItems.find(i => i.store_id === "01KQ6MW5F8RHJ8BVW1V14HG5MB" || String(i.store_id).includes("01KQ"));
            if (match) {
                console.log("Found in scan!", match);
            } else {
                console.log("Not found in scan either.");
            }
        }
    } catch (err) {
        console.error("Error:", err);
    }
}
check();
