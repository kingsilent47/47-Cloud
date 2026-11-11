import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

    const { action, fileName, userId, folderId } = payload;
    if (!action || !fileName || !userId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing action, fileName, or userId" }) };
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

    const objectKey = folderId ? `${userId}/${folderId}/${fileName}` : `${userId}/${fileName}`;

    try {
        if (action === "upload") {
            const url = await getSignedUrl(s3, new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            }), { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url, key: objectKey }) };
        }

        if (action === "download") {
            const url = await getSignedUrl(s3, new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            }), { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url }) };
        }

        if (action === "delete") {
            await s3.send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            }));
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Invalid action" }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}
