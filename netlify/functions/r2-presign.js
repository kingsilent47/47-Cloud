import {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
    DeleteObjectsCommand, CopyObjectCommand, ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function makeClient() {
    return new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
}

async function getCaller(event) {
    const header = event.headers.authorization || event.headers.Authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
}

async function isSharedWith(caller, ownerId, fileName, folderId, token) {
    const folderFilter = folderId ? `folder_id=eq.${folderId}` : "folder_id=is.null";
    const url = `${SUPABASE_URL}/rest/v1/shared_files?owner_id=eq.${ownerId}` +
        `&file_name=eq.${encodeURIComponent(fileName)}` +
        `&shared_with_email=eq.${encodeURIComponent(caller.email)}` +
        `&${folderFilter}&select=id`;
    const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
}

async function listAll(s3, Bucket, Prefix) {
    const objects = [];
    let ContinuationToken;
    do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
        for (const item of page.Contents || []) objects.push(item);
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return objects;
}

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

    const caller = await getCaller(event);
    if (!caller) {
        return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }

    const { action, fileName, userId, folderId, newName } = payload;
    if (!action || !userId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing action or userId" }) };
    }

    const owns = caller.id === userId;
    const s3 = makeClient();
    const Bucket = process.env.R2_BUCKET_NAME;
    const key = folderId ? `${userId}/${folderId}/${fileName}` : `${userId}/${fileName}`;
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");

    try {
        if (action === "upload") {
            if (!owns || !fileName) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
            const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url, key }) };
        }

        if (action === "download") {
            if (!fileName) return { statusCode: 400, body: JSON.stringify({ error: "Missing fileName" }) };
            const allowed = owns || await isSharedWith(caller, userId, fileName, folderId || null, token);
            if (!allowed) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
            const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
            return { statusCode: 200, body: JSON.stringify({ url }) };
        }

        if (action === "delete") {
            if (!owns || !fileName) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
            await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        if (action === "rename") {
            if (!owns || !fileName || !newName || newName.includes("/")) {
                return { statusCode: 400, body: JSON.stringify({ error: "Invalid rename" }) };
            }
            const newKey = folderId ? `${userId}/${folderId}/${newName}` : `${userId}/${newName}`;
            const copySource = `${Bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
            await s3.send(new CopyObjectCommand({ Bucket, Key: newKey, CopySource: copySource }));
            await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
            return { statusCode: 200, body: JSON.stringify({ success: true, key: newKey }) };
        }

        if (action === "delete-folder") {
            if (!owns || !folderId) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
            const objects = await listAll(s3, Bucket, `${userId}/${folderId}/`);
            for (let i = 0; i < objects.length; i += 1000) {
                const batch = objects.slice(i, i + 1000).map(o => ({ Key: o.Key }));
                await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch } }));
            }
            return { statusCode: 200, body: JSON.stringify({ success: true, deleted: objects.length }) };
        }

        if (action === "usage") {
            if (!owns) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
            const objects = await listAll(s3, Bucket, `${userId}/`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    objects: objects.map(o => ({ name: o.Key.split("/").pop(), size: o.Size || 0 })),
                }),
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Invalid action" }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}
