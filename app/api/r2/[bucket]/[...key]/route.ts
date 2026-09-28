import { NextRequest, NextResponse } from "next/server";
import { getR2Client, R2_BUCKET } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";

// Only the model buckets are served here — never let the URL pick an
// arbitrary bucket the R2 token happens to have access to.
const ALLOWED_BUCKETS = new Set<string>([R2_BUCKET.cityModels, R2_BUCKET.buildings]);
const MODEL_EXTENSIONS = /\.(glb|stl)$/i;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket, key } = await context.params;
  const objectKey = Array.isArray(key) ? key.join("/") : (key as string);

  if (!bucket || !objectKey || !ALLOWED_BUCKETS.has(bucket) || !MODEL_EXTENSIONS.test(objectKey)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Same gate as getModelFiles: signed in + redeemed an access code.
  // Done here (not in middleware) because the middleware matcher skips *.stl.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access")
    .eq("id", user.id)
    .single();
  if (!profile?.has_access) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const client = getR2Client();
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const res = await client.send(cmd);

    if (!res.Body) {
      return new NextResponse("Not found", { status: 404 });
    }

    const headers = new Headers();
    if (res.ContentType) {
      headers.set("Content-Type", res.ContentType);
    } else if (objectKey.toLowerCase().endsWith(".stl")) {
      headers.set("Content-Type", "model/stl");
    } else {
      headers.set("Content-Type", "model/gltf-binary");
    }

    if (res.ContentLength) {
      headers.set("Content-Length", res.ContentLength.toString());
    }
    if (res.ETag) {
      headers.set("ETag", res.ETag);
    }
    // Paid content: browser-only cache, never shared caches/CDN. Kept short so
    // a re-uploaded model under the same key shows up within minutes.
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Vary", "Cookie");

    // Convert AWS SDK v3 stream to Web ReadableStream
    const body = res.Body as any;
    const stream = typeof body.transformToWebStream === "function"
      ? body.transformToWebStream()
      : (body as ReadableStream);

    return new NextResponse(stream, { headers });
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    console.error(`[API /api/r2] Failed to fetch "${bucket}/${objectKey}":`, err);
    if (name === "NoSuchKey" || name === "NotFound") {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse("Failed to load model", { status: 502 });
  }
}
