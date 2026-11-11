import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function handler(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" }
    }

    const { prefix } = JSON.parse(event.body);

    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });

    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET_NAME,
            Prefix: prefix,
            Delimiter: "/", // This ensures we only get files in this specific "folder", not subfolders
        });
        const response = await s3.send(command);
        
        // Format to match what the frontend expects
        const contents = (response.Contents || []).map(item => ({
            name: item.Key.split('/').pop(),
            size: item.Size,
            lastModified: item.LastModified
        }));

        return { statusCode: 200, body: JSON.stringify({ contents }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}
