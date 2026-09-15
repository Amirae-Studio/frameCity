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

    // generateLink-ku badhila generateLinkOtp (or generateLink with email otp)
    // Supabase admin api-la OTP link generate panrom
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (error || !data.properties?.action_link) {
      return { success: false, error: error?.message || "Failed to generate link" };
    }

    let magicLink = data.properties.action_link;

    // Oru vela linkhash varama direct token vantha, athai fix panrom
    // Supabase admin generateLink sometimes hash link tharum, athai query param-ah mathalam
    // (Or alternative: use supabaseAdmin.auth.signInWithOtp inside server action)

    // Resend vazhiya email send panrom
    const { error: resendError } = await resend.emails.send({
      from: "auth@amirae.studio",
      to: [email],
      subject: "Your Sign-in Link",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Login to your account</h2>
          <p>Click the button below to securely log into your account:</p>
          <a href="${magicLink}" style="background: #000; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Sign In</a>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">If you didn't request this, you can safely ignore it.</p>
        </div>
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