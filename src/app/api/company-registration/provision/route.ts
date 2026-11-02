import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Registration = {
  companyName: string;
  registrationNumber: string;
  country: string;
  city: string;
  officeAddress: string;
  phone: string;
  email: string;
  website: string;
  fullName: string;
  position: string;
  adminPhone: string;
};

type CompanyLogo = {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  bytes: Buffer;
  extension: "png" | "jpg";
};

function readCompanyLogo(value: unknown): CompanyLogo | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 360_000) {
    throw new Error("Company logo must be a PNG or JPEG image smaller than 256 KB.");
  }
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("Company logo must be a valid PNG or JPEG image.");

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 256 * 1024) {
    throw new Error("Company logo must be a PNG or JPEG image smaller than 256 KB.");
  }
  const isPng = match[1] === "png"
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = match[1] === "jpeg"
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) throw new Error("The selected logo file does not match its image type.");

  return {
    dataUrl: value,
    mimeType: isPng ? "image/png" : "image/jpeg",
    bytes,
    extension: isPng ? "png" : "jpg",
  };
}

function readEmbeddedCompanyLogo(value: unknown): CompanyLogo | null {
  if (typeof value !== "string" || !/^data:image\/(?:png|jpeg);base64,/.test(value)) return null;
  return readCompanyLogo(value);
}

function readRegistration(value: unknown): Registration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const readText = (key: string, maxLength: number, required = false) => {
    const raw = record[key];
    if (raw === undefined && !required) return "";
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (text.length > maxLength || (required && !text)) return null;
    return text;
  };

  const companyName = readText("companyName", 200, true);
  const registrationNumber = readText("registrationNumber", 200);
  const country = readText("country", 200);
  const city = readText("city", 200);
  const officeAddress = readText("officeAddress", 500);
  const phone = readText("phone", 100);
  const email = readText("email", 254, true);
  const website = readText("website", 500);
  const fullName = readText("fullName", 200, true);
  const position = readText("position", 150);
  const adminPhone = readText("adminPhone", 60);
  if (
    companyName === null || registrationNumber === null || country === null || city === null
    || officeAddress === null || phone === null || email === null || website === null
    || fullName === null || position === null || adminPhone === null
  ) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return {
    companyName, registrationNumber, country, city, officeAddress, phone,
    email, website, fullName, position, adminPhone,
  };
}

function slugBase(companyName: string) {
  return companyName.split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected company setup error.";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendWelcomeEmail(options: {
  to: string[];
  companyName: string;
  fullName: string;
  loginUrl: string;
  logo: CompanyLogo | null;
}) {
  const smtpHost = process.env.SYSTEM_SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SYSTEM_SMTP_PORT ?? "587");
  const smtpUser = process.env.SYSTEM_SMTP_USER?.trim();
  const smtpPass = process.env.SYSTEM_SMTP_PASS?.trim();
  const fromAddress = process.env.SYSTEM_SMTP_FROM?.trim() || smtpUser;
  if (!smtpHost || !Number.isInteger(smtpPort) || !smtpUser || !smtpPass || !fromAddress) {
    return { sent: false, error: "Welcome email delivery is not configured. Set the server-side SYSTEM_SMTP_* settings." };
  }
  if (!options.to.length) {
    return { sent: false, error: "No valid welcome email recipients were provided." };
  }

  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    requireTLS: smtpPort !== 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const companyName = escapeHtml(options.companyName);
  const fullName = escapeHtml(options.fullName);
  const loginUrl = escapeHtml(options.loginUrl);
  const logoHtml = options.logo
    ? `<img src="cid:company-logo@kilaxtech.com" alt="${companyName} logo" style="display:block;width:auto;height:auto;max-width:180px;max-height:90px;margin:0 auto 24px">`
    : "";
  try {
    await transport.sendMail({
      from: `"Kilax Smart Recruit" <${fromAddress}>`,
      to: options.to.join(", "),
      subject: `Welcome to ${options.companyName} | Kilax Smart Recruit`,
      text: `Hello ${options.fullName},\n\nWelcome to ${options.companyName}. Your company workspace is ready, and you are its Chairman and primary administrator.\n\nLaunch your workspace: ${options.loginUrl}\n\nThank you,\nKilax Smart Recruit`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;text-align:center">${logoHtml}<h1>Welcome, ${fullName}!</h1><p>Your <strong>${companyName}</strong> workspace is ready. You are its Chairman and primary administrator.</p><p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Launch your workspace</a></p><p>Thank you,<br> Kilax Smart Recruit</p></div>`,
      attachments: options.logo ? [{
        filename: `company-logo.${options.logo.extension}`,
        content: options.logo.bytes,
        contentType: options.logo.mimeType,
        cid: "company-logo@kilaxtech.com",
      }] : [],
    });
    return { sent: true as const };
  } finally {
    transport.close();
  }
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Company registration server configuration is incomplete." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to finish company registration." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let user: User;
  try {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json({ error: "Your session is invalid or expired. Sign in again." }, { status: 401 });
    }
    user = data.user;
  } catch (error) {
    console.error("Company registration auth verification failed:", error);
    return NextResponse.json({ error: "Unable to verify your session right now. Please try again." }, { status: 503 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Verify your email before provisioning a company workspace." }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let requestBody: { resendWelcomeEmail?: unknown; logoDataUrl?: unknown };
  try {
    requestBody = await request.json() as { resendWelcomeEmail?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid company provisioning request." }, { status: 400 });
  }
  if (
    requestBody.resendWelcomeEmail !== undefined
    && typeof requestBody.resendWelcomeEmail !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid welcome email retry request." }, { status: 400 });
  }
  const resendWelcomeEmail = requestBody.resendWelcomeEmail === true;
  let uploadedLogo: CompanyLogo | null;
  try {
    uploadedLogo = readCompanyLogo(requestBody.logoDataUrl);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
  const registration = readRegistration(user.user_metadata?.company_registration);
  if (!registration) {
    return NextResponse.json({ error: "Company registration details are missing or invalid. Return to registration and try again." }, { status: 400 });
  }

  let companyId: string | null = null;
  let createdCompanyId: string | null = null;
  try {
    const { data: existingCompany, error: existingCompanyError } = await admin
      .from("companies")
      .select("id")
      .eq("primary_admin_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existingCompanyError) throw existingCompanyError;
    companyId = existingCompany?.id ?? null;

    if (!companyId) {
      const { data: existingMembership, error: membershipLookupError } = await admin
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (membershipLookupError) throw membershipLookupError;
      if (existingMembership) {
        return NextResponse.json(
          { error: "This account already belongs to a company and cannot create another workspace." },
          { status: 409 },
        );
      }

      const base = slugBase(registration.companyName);
      let company: { id: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const suffix = attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 6)}`;
        const slug = `${base}${suffix}`;
        const { data: slugMatch, error: slugLookupError } = await admin
          .from("companies")
          .select("id")
          .eq("slug", slug)
          .limit(1)
          .maybeSingle();
        if (slugLookupError) throw slugLookupError;
        if (slugMatch) continue;

        const { data, error } = await admin
          .from("companies")
          .insert({
            name: registration.companyName,
            slug,
            status: "trial",
            primary_admin_user_id: user.id,
            registration_number: registration.registrationNumber,
            country: registration.country,
            city: registration.city,
            office_address: registration.officeAddress,
            phone: registration.phone,
            email: registration.email,
            website: registration.website,
            logo_url: uploadedLogo?.dataUrl ?? "",
          })
          .select("id")
          .single();
        if (!error) {
          company = data;
          break;
        }
        if (error.code !== "23505") throw error;
      }
      if (!company) throw new Error("Unable to reserve a unique company URL. Please try again.");
      companyId = company.id;
      createdCompanyId = company.id;
    }

    if (uploadedLogo) {
      const { error: logoUpdateError } = await admin
        .from("companies")
        .update({ logo_url: uploadedLogo.dataUrl })
        .eq("id", companyId);
      if (logoUpdateError) throw logoUpdateError;
    }

    const { data: existingMembership, error: existingMemberError } = await admin
      .from("company_memberships")
      .select("status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingMemberError) throw existingMemberError;
    if (existingMembership && existingMembership.status !== "active") {
      throw new Error("The existing company membership is not active. Contact a company administrator.");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ display_name: registration.fullName, phone: registration.adminPhone })
      .eq("id", user.id);
    if (profileError) throw profileError;

    const { error: renameRoleError } = await admin
      .from("company_roles")
      .update({ name: "Chairman" })
      .eq("company_id", companyId)
      .in("name", ["Company Owner / Primary Administrator", "Primary Administrator"]);
    if (renameRoleError) throw renameRoleError;

    const { data: chairmanRole, error: roleError } = await admin
      .from("company_roles")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", "Chairman")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!chairmanRole) throw new Error("The default Chairman role was not seeded. Apply the pending company-role migrations.");

    const { data: branch, error: branchError } = await admin
      .from("company_branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_main_branch", true)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) throw new Error("The company Main Branch was not created. Apply the branch-system migration.");

    if (!existingMembership) {
      const { error: createMembershipError } = await admin
        .from("company_memberships")
        .insert({
          company_id: companyId,
          user_id: user.id,
          role_id: chairmanRole.id,
          branch_id: branch.id,
          status: "active",
        });
      if (createMembershipError) throw createMembershipError;
    }

    if (registration.position) {
      const { data: staff, error: staffError } = await admin
        .from("company_staff_members")
        .update({ position: registration.position })
        .eq("company_id", companyId)
        .eq("linked_user_id", user.id)
        .select("id")
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff) throw new Error("The company staff profile was not created. Apply the staff-management migrations.");
    }

    const registrationCompleted =
      user.app_metadata?.company_registration_completed_company_id !== companyId;
    const welcomeEmailCompanyId = user.app_metadata?.company_welcome_email_company_id;
    let welcomeEmailSent = welcomeEmailCompanyId === companyId;
    let welcomeEmailError: string | undefined;
    const recipients = [...new Set(
      [user.email, registration.email]
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    )];
    if (!welcomeEmailSent || resendWelcomeEmail) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
      const { data: companyRecord, error: companySlugError } = await admin
        .from("companies")
        .select("slug, logo_url")
        .eq("id", companyId)
        .single();
      if (companySlugError) {
        console.error("Unable to load the company login URL for its welcome email:", companySlugError);
        welcomeEmailError = "Workspace created, but its company login URL could not be loaded.";
      } else if (!companyRecord?.slug) {
        welcomeEmailError = "Workspace created, but its company login URL could not be loaded.";
      } else {
        try {
          const delivery = await sendWelcomeEmail({
            to: recipients,
            companyName: registration.companyName,
            fullName: registration.fullName,
            loginUrl: siteUrl
              ? `${siteUrl}/${encodeURIComponent(companyRecord.slug)}/login`
              : `/${encodeURIComponent(companyRecord.slug)}/login`,
            logo: uploadedLogo ?? readEmbeddedCompanyLogo(companyRecord.logo_url),
          });
          welcomeEmailSent = delivery.sent;
          welcomeEmailError = delivery.sent ? undefined : delivery.error;
        } catch (error) {
          welcomeEmailSent = false;
          welcomeEmailError = "The workspace is ready, but the welcome email could not be sent. Retry from this page.";
          console.error("Company welcome email delivery failed:", error);
        }
      }
    }

    const appMetadata = {
      ...user.app_metadata,
      company_registration_completed_company_id: companyId,
      ...(welcomeEmailSent ? { company_welcome_email_company_id: companyId } : {}),
    };
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: appMetadata,
    });
    if (metadataError) {
      console.error("Unable to persist company registration completion metadata:", metadataError);
    }

    return NextResponse.json({
      companyId,
      registrationCompleted,
      welcomeEmailSent,
      welcomeEmailRecipientCount: recipients.length,
      welcomeEmailError,
    });
  } catch (error) {
    if (createdCompanyId) {
      const { error: rollbackError } = await admin
        .from("companies")
        .delete()
        .eq("id", createdCompanyId);
      if (rollbackError) console.error("Company registration rollback failed:", rollbackError);
    }
    console.error("Company registration provisioning failed:", error);
    return NextResponse.json(
      { error: `Company setup failed: ${errorMessage(error)}` },
      { status: 500 },
    );
  }
}
