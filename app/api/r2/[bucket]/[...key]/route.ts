import { NextRequest, NextResponse } from "next/server";
import { getR2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket, key } = await context.params;
  const objectKey = Array.isArray(key) ? key.join("/") : (key as string);

  if (!bucket || !objectKey) {
    return new NextResponse("Invalid request parameters", { status: 400 });
  }

  try {
    const client = getR2Client();
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const res = await client.send(cmd);

    if (!res.Body) {
      return new NextResponse("Object body not found", { status: 404 });
    }

    const headers = new Headers();
    if (res.ContentType) {
      headers.set("Content-Type", res.ContentType);
    } else if (objectKey.endsWith(".stl")) {
      headers.set("Content-Type", "model/stl");
    } else if (objectKey.endsWith(".glb")) {
      headers.set("Content-Type", "model/gltf-binary");
    } else {
      headers.set("Content-Type", "application/octet-stream");
    }

    if (res.ContentLength) {
      headers.set("Content-Length", res.ContentLength.toString());
    }
    // Cache for 1 year, support CORS
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    // Convert AWS SDK v3 stream to Web ReadableStream
    const body = res.Body as any;
    const stream = typeof body.transformToWebStream === "function"
      ? body.transformToWebStream()
      : (body as ReadableStream);

    return new NextResponse(stream, { headers });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Error fetching R2 object";
    console.error(`[API /api/r2] Failed to fetch "${bucket}/${objectKey}":`, errMsg);
    return new NextResponse(errMsg, { status: 404 });
  }
}
