import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function handler(event) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    let payload;
    try {
        payload = JSON.parse(event.body || "{}");
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    const { prefix } = payload;
    if (!prefix) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing prefix" }) };
    }

    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });

    try {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET_NAME,
            Prefix: prefix,
            Delimiter: "/",
        }));

        const contents = (response.Contents || [])
            .filter(item => item.Key !== prefix)
            .map(item => ({
                name: item.Key.split("/").pop(),
                size: item.Size,
                lastModified: item.LastModified,
            }));

        return { statusCode: 200, body: JSON.stringify({ contents }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}
