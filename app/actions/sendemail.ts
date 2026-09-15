"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmailAction(email: string, redirectTo: string) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const productionCallback = "https://frame-city.vercel.app/auth/callback";

    // 1. Supabase admin API-la magic link generate panrom
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: productionCallback,
      },
    });

    if (error || !data.properties?.action_link) {
      return { success: false, error: error?.message || "Failed to generate link" };
    }

    let magicLink = data.properties.action_link;

    // 2. Token hash map panrom for callback verification
    const tokenHash = data.properties.hashed_token;
    if (tokenHash) {
      const callbackUrl = new URL(productionCallback);
      callbackUrl.searchParams.set("token_hash", tokenHash);
      callbackUrl.searchParams.set("type", "magiclink");
      magicLink = callbackUrl.toString();
    } else {
      magicLink = magicLink.replace("#access_token=", "?access_token=");
    }

    // 3. Resend vazhiya clean & professional email send panrom
    const { error: resendError } = await resend.emails.send({
      from: "auth@amirae.studio",
      to: [email],
      subject: "Sign in to FrameCity",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sign in to FrameCity</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f0f0f; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1a1a1a; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 40px;">
                    <tr>
                      <td>
                        <!-- Logo / Brand Header -->
                        <h2 style="margin: 0 0 24px 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.5px;">
                          FrameCity
                        </h2>
                        
                        <!-- Main Content -->
                        <h1 style="margin: 0 0 12px 0; color: #ffffff; font-size: 24px; font-weight: 500; letter-spacing: -0.5px;">
                          Your sign-in link
                        </h1>
                        <p style="margin: 0 0 28px 0; color: rgba(255, 255, 255, 0.6); font-size: 14.5px; line-height: 1.6;">
                          Tap the button below to securely access your account. This link is valid for a single use.
                        </p>
                        
                        <!-- Action Button -->
                        <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                          <tr>
                            <td align="center" style="border-radius: 8px; background-color: #ffffff;">
                              <a href="${magicLink}" target="_blank" style="font-size: 14.5px; font-weight: 500; color: #0f0f0f; text-decoration: none; padding: 12px 24px; border-radius: 8px; border: 1px solid #ffffff; display: inline-block;">
                                Sign in to account
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Security Notice / Footer -->
                        <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 13px; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                          If you didn't request this email, you can safely ignore it.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (resendError) {
      return { success: false, error: resendError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Something went wrong" };
  }
}