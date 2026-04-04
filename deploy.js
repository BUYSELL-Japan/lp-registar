const { LambdaClient, UpdateFunctionCodeCommand } = require("@aws-sdk/client-lambda");
const fs = require('fs');

const lambda = new LambdaClient({ region: "ap-southeast-2" });

async function deploy() {
    try {
        const zipFile = fs.readFileSync('lambda_deploy.zip');
        const command = new UpdateFunctionCodeCommand({
            FunctionName: 'registerStore',
            ZipFile: zipFile,
        });
        const response = await lambda.send(command);
        console.log("Deployment successful:", response.LastModified);
    } catch (e) {
        console.error("Deployment failed:", e);
    }
}
deploy();
