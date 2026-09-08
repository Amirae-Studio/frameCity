import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isInline = searchParams.get("inline") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Check user tier
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, redeemed_code, has_access")
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
    return new NextResponse(
      "Forbidden: Merchant access required to download Merchant Badge.",
      { status: 403 }
    );
  }

  const filePath = path.join(process.cwd(), "public", "Badge.png");
  if (!fs.existsSync(filePath)) {
    return new NextResponse("Badge image not found", { status: 444 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": isInline
        ? `inline; filename="FrameCity_Verified_Merchant_Badge.png"`
        : `attachment; filename="FrameCity_Verified_Merchant_Badge.png"`,
      "Cache-Control": "private, no-cache",
    },
  });
}