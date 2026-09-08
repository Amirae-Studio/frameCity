import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function createPdfBuffer(params: {
  licenseeName: string;
  licenseeEmail: string;
  licenseCode: string;
  issueDate: string;
}): Uint8Array {
  const sanitize = (str: string) => str.replace(/[()\\]/g, "\\$&");

  const name = sanitize(params.licenseeName);
  const email = sanitize(params.licenseeEmail);
  const code = sanitize(params.licenseCode);
  const date = sanitize(params.issueDate);

  const streamContent = `
BT
/F1 24 Tf
0.96 0.62 0.15 rg
50 740 Td
(FRAMECITY OFFICIAL COMMERCIAL LICENSE) Tj
ET

BT
/F2 10 Tf
0.4 0.4 0.4 rg
50 720 Td
(VERIFIED MERCHANT 3D PRINT & SELL AUTHORIZATION) Tj
ET

BT
/F2 11 Tf
0.2 0.2 0.2 rg
50 685 Td
(License Certificate ID: ${code}) Tj
50 668 Td
(Issue Date: ${date}) Tj
ET

BT
/F1 14 Tf
0.1 0.1 0.1 rg
50 630 Td
(LICENSEE DETAILS) Tj
ET

BT
/F2 11 Tf
0.2 0.2 0.2 rg
50 610 Td
(Authorized Merchant: ${name}) Tj
50 594 Td
(Registered Email:    ${email}) Tj
50 578 Td
(License Tier:        MERCHANT / COMMERCIAL TIER) Tj
ET

BT
/F1 14 Tf
0.1 0.1 0.1 rg
50 535 Td
(TERMS & AUTHORIZATION RIGHTS) Tj
ET

BT
/F2 10 Tf
0.25 0.25 0.25 rg
50 510 Td
(1. COMMERCIAL PRINTING RIGHT: The Licensee is hereby granted a worldwide, non-exclusive) Tj
50 495 Td
(   commercial license to 3D print and physically produce model products derived from FrameCity.) Tj

50 470 Td
(2. PHYSICAL SALES AUTHORIZATION: Licensee is authorized to sell, market, and distribute) Tj
50 455 Td
(   physical 3D prints created using official FrameCity digital city model files.) Tj

50 430 Td
(3. DIGITAL FILE PROTECTION: Digital files (GLB, STL, 3MF, STEP) remain the intellectual) Tj
50 415 Td
(   property of FrameCity and may NOT be resold, re-shared, uploaded, or sub-licensed.) Tj

50 390 Td
(4. UNLIMITED PRODUCTION: Licensee enjoys unlimited physical 3D print creation for commercial) Tj
50 375 Td
(   resale with no per-unit royalty restrictions while active.) Tj
ET

BT
/F1 12 Tf
0.96 0.62 0.15 rg
50 320 Td
(FrameCity 3D Architecture Studio) Tj
ET

BT
/F2 9 Tf
0.5 0.5 0.5 rg
50 300 Td
(Authenticated digital license token generated automatically via FrameCity Platform.) Tj
50 285 Td
(Verify license validity at https://framecity.app/account) Tj
ET
`.trim();

  const streamLength = Buffer.byteLength(streamContent);

  const pdfString = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj

2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj

3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /Resources <<
    /Font <<
      /F1 4 0 R
      /F2 5 0 R
    >>
  >>
  /MediaBox [0 0 612 792]
  /Contents 6 0 R
>>
endobj

4 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
>>
endobj

5 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
>>
endobj

6 0 obj
<<
  /Length ${streamLength}
>>
stream
${streamContent}
endstream
endobj

xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000264 00000 n 
0000000345 00000 n 
0000000421 00000 n 
trailer
<<
  /Size 7
  /Root 1 0 R
>>
startxref
${500 + streamLength}
%%EOF`;

  return new TextEncoder().encode(pdfString);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, redeemed_code, redeemed_at, has_access")
    .eq("id", user.id)
    .single();

  let tier = profile?.tier;
  if (profile?.redeemed_code) {
    const { data: codeRow } = await supabase
      .from("access_codes")
      .select("tier")
      .eq("code", profile.redeemed_code)
      .single();
    if (codeRow?.tier) tier = codeRow.tier;
  }

  const isMerchant = tier === "merchant" || tier === "studio";

  if (!profile?.has_access || !isMerchant) {
    return new NextResponse("Forbidden: Merchant access required to download Commercial License.", {
      status: 403,
    });
  }

  const licenseeName =
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Licensed FrameCity Merchant";
  const licenseeEmail = user.email || "N/A";
  const licenseCode =
    profile?.redeemed_code || `FC-MERCHANT-${user.id.slice(0, 8).toUpperCase()}`;
  const issueDate = profile?.redeemed_at
    ? new Date(profile.redeemed_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const pdfBytes = createPdfBuffer({
    licenseeName,
    licenseeEmail,
    licenseCode,
    issueDate,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="FrameCity_Commercial_License.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
