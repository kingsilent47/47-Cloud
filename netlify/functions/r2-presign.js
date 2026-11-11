import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function handler(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { action, fileName, userId, folderId } = JSON.parse(event.body);
    const objectKey = folderId ? `${userId}/${folderId}/${fileName}` : `${userId}/${fileName}`;

    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });

    try {
        if (action === 'upload') {
            const command = new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            });
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url, key: objectKey }) };
        } 
        
        if (action === 'download') {
            const command = new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            });
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url }) };
        }

        if (action === 'delete') {
            const command = new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: objectKey,
            });
            await s3.send(command);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Invalid action" }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}
