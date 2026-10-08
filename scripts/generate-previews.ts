/**
 * scripts/generate-previews.ts
 *
 * One-time (and re-runnable) script that converts every full-quality STL / GLB
 * in the city-models and buildings R2 buckets into a lightweight preview GLB
 * stored under the "preview/" prefix of the same bucket.
 *
 * Preview copies are:
 *   • ~80–90% fewer triangles  (not worth printing, still looks fine on screen)
 *   • Draco-compressed          (3–5× smaller download)
 *
 * Usage:
 *   pnpm preview-gen
 *   pnpm preview-gen --bucket city-models   (single bucket)
 *   pnpm preview-gen --force                 (re-generate even if preview exists)
 *
 * Requires the dev-dependencies installed by:
 *   pnpm add -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions draco3dgltf meshoptimizer tsx
 */

import * as path from "path";
import * as dotenv from "dotenv";
import { Readable } from "stream";

// Load .env / .env.local so R2 creds are available without a running Next.js server.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  Document,
  NodeIO,
  Accessor,
  Buffer as GltfBuffer,
  Primitive,
  Mesh,
  Node,
  Scene,
} from "@gltf-transform/core";
import { simplify, dedup, prune } from "@gltf-transform/functions";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";
// @ts-ignore — draco3dgltf ships CJS without type declarations
import draco3dgltf from "draco3dgltf";

// ─── Config ────────────────────────────────────────────────────────────────

const SIMPLIFY_RATIO = 0.10; // keep 10% of triangles (90% reduction)
const SIMPLIFY_ERROR = 0.01; // max allowable geometry error

const BUCKETS = {
  "city-models": process.env.R2_BUCKET_CITY_MODELS ?? "city-models",
  buildings: process.env.R2_BUCKET_BUILDINGS ?? "buildings",
} as const;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const SINGLE_BUCKET = (() => {
  const idx = args.indexOf("--bucket");
  return idx !== -1 ? args[idx + 1] : null;
})();

// ─── R2 client ─────────────────────────────────────────────────────────────

function makeR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 env vars: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  });
}

// ─── R2 helpers ────────────────────────────────────────────────────────────

async function listObjects(
  client: S3Client,
  bucket: string,
  prefix = ""
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function keyExists(
  client: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadBytes(
  client: S3Client,
  bucket: string,
  key: string
): Promise<Uint8Array> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const body = res.Body as any;
  if (typeof body.transformToByteArray === "function") {
    return body.transformToByteArray();
  }
  // Fallback for Node.js Readable streams
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function uploadBytes(
  client: S3Client,
  bucket: string,
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(data),
      ContentType: contentType,
    })
  );
}

// ─── STL parser ────────────────────────────────────────────────────────────

/**
 * Parse binary or ASCII STL into flat position + normal Float32Arrays.
 * Returns null if the data cannot be parsed.
 */
function parseSTL(
  data: Uint8Array
): { positions: Float32Array; normals: Float32Array } | null {
  try {
    // Binary STL: 80-byte header, 4-byte uint32 triangle count, then N * 50 bytes
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const triangleCount = view.getUint32(80, true);
    const expectedSize = 84 + triangleCount * 50;

    if (data.byteLength >= expectedSize && triangleCount > 0) {
      const positions = new Float32Array(triangleCount * 9);
      const normals = new Float32Array(triangleCount * 9);
      let offset = 84;
      for (let i = 0; i < triangleCount; i++) {
        const ni = i * 9;
        normals[ni] = view.getFloat32(offset, true);
        normals[ni + 1] = view.getFloat32(offset + 4, true);
        normals[ni + 2] = view.getFloat32(offset + 8, true);
        // same normal for all 3 vertices
        normals[ni + 3] = normals[ni];
        normals[ni + 4] = normals[ni + 1];
        normals[ni + 5] = normals[ni + 2];
        normals[ni + 6] = normals[ni];
        normals[ni + 7] = normals[ni + 1];
        normals[ni + 8] = normals[ni + 2];
        offset += 12;
        for (let v = 0; v < 3; v++) {
          const pi = ni + v * 3;
          positions[pi] = view.getFloat32(offset, true);
          positions[pi + 1] = view.getFloat32(offset + 4, true);
          positions[pi + 2] = view.getFloat32(offset + 8, true);
          offset += 12;
        }
        offset += 2; // attribute byte count
      }
      return { positions, normals };
    }
  } catch {
    // fall through to ASCII
  }

  // ASCII STL fallback
  try {
    const text = new TextDecoder().decode(data);
    const posArr: number[] = [];
    const norArr: number[] = [];
    let lastNormal = [0, 0, 1];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("facet normal")) {
        const parts = t.split(/\s+/);
        lastNormal = [
          parseFloat(parts[2]),
          parseFloat(parts[3]),
          parseFloat(parts[4]),
        ];
      } else if (t.startsWith("vertex")) {
        const parts = t.split(/\s+/);
        posArr.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        norArr.push(...lastNormal);
      }
    }
    if (posArr.length > 0) {
      return {
        positions: new Float32Array(posArr),
        normals: new Float32Array(norArr),
      };
    }
  } catch {
    // ignore
  }

  return null;
}

// ─── Build gltf-transform Document from raw geometry ──────────────────────

function buildDocument(
  positions: Float32Array,
  normals: Float32Array
): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const posAcc = doc
    .createAccessor()
    .setType(Accessor.Type.VEC3)
    .setArray(positions as unknown as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);

  const norAcc = doc
    .createAccessor()
    .setType(Accessor.Type.VEC3)
    .setArray(normals as unknown as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);

  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setAttribute("NORMAL", norAcc);

  const mesh = doc.createMesh("mesh").addPrimitive(prim);
  const node = doc.createNode("node").setMesh(mesh);
  const scene = doc.createScene("scene").addChild(node);
  doc.getRoot().setDefaultScene(scene);

  return doc;
}

// ─── Process one key ───────────────────────────────────────────────────────

async function processKey(
  client: S3Client,
  bucket: string,
  key: string,
  io: NodeIO,
  encoder: any
): Promise<"skipped" | "generated" | "error"> {
  const previewKey = `preview/${key.replace(/\.(stl|glb)$/i, ".glb")}`;

  if (!FORCE && (await keyExists(client, bucket, previewKey))) {
    return "skipped";
  }

  let doc: Document;
  try {
    const bytes = await downloadBytes(client, bucket, key);

    if (key.toLowerCase().endsWith(".stl")) {
      const geo = parseSTL(bytes);
      if (!geo) throw new Error("STL parse failed");
      doc = buildDocument(geo.positions, geo.normals);
    } else {
      // GLB — read directly
      doc = await io.readBinary(bytes);
    }
  } catch (err) {
    console.error(`  ✕ download/parse failed: ${err}`);
    return "error";
  }

  try {
    // Initialise MeshoptSimplifier (async WASM bootstrap)
    await MeshoptSimplifier.ready;

    // Deduplicate vertices, then simplify (decimate)
    await doc.transform(
      dedup(),
      simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }),
      prune()
    );

    // Draco-compress
    (doc.createExtension(KHRDracoMeshCompression) as KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({
        decodeSpeed: 5,
        encodeSpeed: 5,
        method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
        quantizationBits: { POSITION: 14, NORMAL: 10 },
      });

    const glbBytes = await io.writeBinary(doc);
    await uploadBytes(client, bucket, previewKey, glbBytes, "model/gltf-binary");
    return "generated";
  } catch (err) {
    console.error(`  ✕ transform/upload failed: ${err}`);
    return "error";
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const client = makeR2Client();

  // Register Draco encoder/decoder with gltf-transform IO
  const dracoModule = await draco3dgltf.createDecoderModule();
  const dracoEncoder = await draco3dgltf.createEncoderModule();

  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    "draco3d.decoder": dracoModule,
    "draco3d.encoder": dracoEncoder,
  });

  const bucketsToProcess =
    SINGLE_BUCKET
      ? [[SINGLE_BUCKET, BUCKETS[SINGLE_BUCKET as keyof typeof BUCKETS] ?? SINGLE_BUCKET] as [string, string]]
      : (Object.entries(BUCKETS) as [string, string][]);

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [label, bucketName] of bucketsToProcess) {
    console.log(`\n📦 Bucket: ${bucketName} (${label})`);

    let allKeys: string[];
    try {
      allKeys = await listObjects(client, bucketName);
    } catch (err) {
      console.error(`  ✕ Could not list bucket "${bucketName}": ${err}`);
      continue;
    }

    // Only process real model files; skip preview/ keys themselves
    const modelKeys = allKeys.filter(
      (k) => /\.(stl|glb)$/i.test(k) && !k.startsWith("preview/")
    );

    console.log(`  Found ${modelKeys.length} model files (${allKeys.length} total objects)`);

    for (const key of modelKeys) {
      process.stdout.write(`  → ${key} ... `);
      const result = await processKey(client, bucketName, key, io, dracoEncoder);
      const previewKey = `preview/${key.replace(/\.(stl|glb)$/i, ".glb")}`;
      if (result === "skipped") {
        console.log("skipped (preview exists, use --force to overwrite)");
        totalSkipped++;
      } else if (result === "generated") {
        console.log(`✓ → ${previewKey}`);
        totalGenerated++;
      } else {
        totalErrors++;
      }
    }
  }

  console.log(`\n✅ Done — generated: ${totalGenerated}, skipped: ${totalSkipped}, errors: ${totalErrors}`);
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
