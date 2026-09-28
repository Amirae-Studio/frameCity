/**
 * Cloudflare R2 client — S3-compatible via @aws-sdk/client-s3
 *
 * All operations use the env vars set in .env:
 *   R2_ENDPOINT         — https://<account_id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID    — R2 API token access key
 *   R2_SECRET_ACCESS_KEY— R2 API token secret
 *   R2_PUBLIC_URL       — Public CDN base URL for public buckets (gallery)
 *   R2_BUCKET_GALLERY   — bucket name for gallery images  (default: "gallery")
 *   R2_BUCKET_CITY_MODELS — bucket name for city GLBs     (default: "city-models")
 *   R2_BUCKET_BUILDINGS — bucket name for building GLBs   (default: "buildings")
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// -- Bucket name helpers -------------------------------------------------------

export const R2_BUCKET = {
  gallery: process.env.R2_BUCKET_GALLERY ?? "gallery",
  cityModels: process.env.R2_BUCKET_CITY_MODELS ?? "city-models",
  buildings: process.env.R2_BUCKET_BUILDINGS ?? "buildings",
} as const;

// -- S3Client (singleton per process) -----------------------------------------

function createR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "[R2] Missing env vars: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // ─── R2-specific requirements ─────────────────────────────────────────
    // 1. R2 uses path-style URLs (endpoint/bucket/key), not virtual-hosted
    //    (bucket.endpoint/key). Without this flag the SDK signs a different
    //    URL than the one actually sent → SignatureDoesNotMatch.
    forcePathStyle: true,
    // 2. AWS SDK v3 auto-adds CRC32/SHA256 checksum headers that R2 doesn't
    //    accept. Setting this to "when_required" disables the extra headers
    //    that corrupt the canonical request used in SigV4 signing.
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  });
}

let _r2: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!_r2) _r2 = createR2Client();
  return _r2;
}

// -- List objects under a prefix ----------------------------------------------

export async function listR2Objects(
  bucket: string,
  prefix: string = "",
  maxKeys: number = 1000
): Promise<{ key: string; size: number }[]> {
  const client = getR2Client();
  const results: { key: string; size: number }[] = [];

  let continuationToken: string | undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const res = await client.send(cmd);

    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        results.push({ key: obj.Key, size: obj.Size ?? 0 });
      }
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}

// -- Generate a presigned GET URL (private buckets) ---------------------------

export async function getR2PresignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number = 300
): Promise<string> {
  const client = getR2Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}

// -- Build a public CDN URL (public buckets — one URL per bucket) -------------

/** Returns the public CDN base URL for the given bucket. */
export function getBucketPublicBase(bucket: string): string {
  const map: Record<string, string | undefined> = {
    [R2_BUCKET.gallery]:    process.env.R2_PUBLIC_URL_GALLERY,
    [R2_BUCKET.cityModels]: process.env.R2_PUBLIC_URL_CITY_MODELS,
    [R2_BUCKET.buildings]:  process.env.R2_PUBLIC_URL_BUILDINGS,
  };

  const base = map[bucket]?.replace(/\/$/, "");
  if (!base) {
    throw new Error(
      `[R2] Missing public URL env var for bucket "${bucket}". ` +
      `Set R2_PUBLIC_URL_GALLERY / R2_PUBLIC_URL_CITY_MODELS / R2_PUBLIC_URL_BUILDINGS.`
    );
  }
  return base;
}

/** Returns the full public CDN URL for an object key in the given bucket. */
export function getR2PublicUrl(key: string, bucket: string = R2_BUCKET.gallery): string {
  const base = getBucketPublicBase(bucket);
  return `${base}/${key}`;
}
