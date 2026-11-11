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
        endpoint: `https://${process.env.a7d85b9d3208887d23e39c1862f8709a}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.92795e773d989c11f9c40fc22ee1acc0,
            secretAccessKey: process.env.8c3824a487077500c4d66b841a54a75e416bd53376c0a78bc9a056dfccf4aa96,
        },
    });

    try {
        if (action === 'upload') {
            const command = new PutObjectCommand({
                Bucket: process.env.47-cloud-storage,
                Key: objectKey,
            });
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url, key: objectKey }) };
        } 
        
        if (action === 'download') {
            const command = new GetObjectCommand({
                Bucket: process.env.47-cloud-storage,
                Key: objectKey,
            });
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url }) };
        }

        if (action === 'delete') {
            const command = new DeleteObjectCommand({
                Bucket: process.env.47-cloud-storage,
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
