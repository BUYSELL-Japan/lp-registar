const https = require('https');
const fs = require('fs');
const extract = require('extract-zip');
const path = require('path');

const url = "https://awslambda-ap-se-2-tasks.s3.ap-southeast-2.amazonaws.com/snapshots/440744213149/registerStore-26e3769d-e5f2-4f94-8243-af531a697793?versionId=FYkSkoHUeRz494xo.rpFzBXaTcXI7KlG&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEC0aDmFwLXNvdXRoZWFzdC0yIkgwRgIhAKthpJf23UbknaTPR%2FZG5eEXYdBmbBxvc03s8XWcEfC6AiEAppRFPhDUXa6LQHbKn1YyUwhGo039IWJKP%2FFHGf%2FJ2HkqlAII9v%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARADGgw1ODcyMjcyNzI5NTgiDPcexXuMRQMfVRBfRSroAQ1Pw%2FzC8st1smmnHPlX71HLw%2Bcbd7HkGu0ssMCDUlZd97Bsz7ErSQIXZUGe1EbaiUSvUncoEjrSgkfOH4S3ebm3F9nUDqh%2F%2FeXL9QvjrWrhH%2B%2BYXVW13kd2dsVsw4k6IZKlyzFVY3zQkGq2Z5%2FsV4EyCPFa9UElz4MCECeMKmUFXYUT4mpMP66qEC0PQ2M0jX9E5Jdk4JjTQS6RftRnLh4tl5qMMDwL3v9A80yt3TrwD5%2BU3vrb2fwulcSR%2FLgcj%2FFqytAGwR3zdVkfnwzVqfnOXlTTwV4wgZLHZwSoS1asqjO3lQJAp0QwgfLmzQY6jAEevAQnrDhuC3kRjrpiZmHTVB%2FQP06JkeQMNPqaBLtiXjxwAjvVEN0zhqzh1DtXmV93%2BtjP3sQM%2F7skPzgDWAS%2F8%2BVmD7fgTWVAsCi3uczoXwiRrPbGAX0qcXJVWdGuyYNk9FcjwVb4h9lKCS06tYOUOcCT%2FYX3vYViNDhu%2B0rTBvXTRTK9zYkrBM2G3w%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260317T231146Z&X-Amz-SignedHeaders=host&X-Amz-Expires=600&X-Amz-Credential=ASIAYROLZC37K4TIWIKI%2F20260317%2Fap-southeast-2%2Fs3%2Faws4_request&X-Amz-Signature=4965d119ef9c4409af2f47b3ead08ca669e419cdc52638ef89d7a53d93d5ac62";
const zipdest = path.join(__dirname, 'lambda.zip');
const extractdest = path.join(__dirname, 'lambda_src');

const file = fs.createWriteStream(zipdest);
https.get(url, function(response) {
  response.pipe(file);
  file.on('finish', async function() {
    file.close();  // close() is async, call cb after close completes.
    console.log("Download completed");
    try {
        await extract(zipdest, { dir: extractdest })
        console.log('Extraction complete');
    } catch (err) {
        console.error('Extract error', err);
    }
  });
}).on('error', function(err) { // Handle errors
  fs.unlink(zipdest, () => {}); // Delete the file async. (But we don't check the result)
  console.error(err.message);
});
