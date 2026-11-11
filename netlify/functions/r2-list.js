import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || "").trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || "").trim();

async function getCaller(event) {
    const header = event.headers.authorization || event.headers.Authorization || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
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

    const { prefix } = payload;
    if (!prefix || !prefix.startsWith(`${caller.id}/`)) {
        return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });

    try {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
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
