import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { v2 as webdav } from "webdav-server";

const host = process.env.WEBDAV_HOST || "0.0.0.0";
const port = Number(process.env.WEBDAV_PORT || 1900);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the WebDAV mount service.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class DriveBasicAuth {
  askForAuthentication() {
    return { "WWW-Authenticate": 'Basic realm="Company Drive"' };
  }

  async getUser(ctx, callback) {
    const header = ctx.headers.find("authorization");
    if (!header || !header.toLowerCase().startsWith("basic ")) {
      callback(new Error("Authentication required."));
      return;
    }

    const encoded = header.slice(6).trim();
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      callback(new Error("Invalid mount credentials."));
      return;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    const [companyId, userId] = username.split(":");
    if (!companyId || !userId) {
      callback(new Error("Invalid mount user."));
      return;
    }

    const providedHash = crypto.createHash("sha256").update(password).digest("hex");
    const { data, error } = await supabase.from("company_drive_mounts")
      .select("token_hash, revoked_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !data || data.token_hash !== providedHash) {
      callback(new Error("Invalid or revoked mount credentials."));
      return;
    }

    callback(null, {
      uid: userId,
      username,
      password,
      isAdministrator: false,
      isDefaultUser: false,
    });
  }
}

const server = new webdav.WebDAVServer({
  hostname: host,
  port,
  requireAuthentification: true,
  httpAuthentication: new DriveBasicAuth(),
});

const root = new webdav.VirtualFileSystem();
root.addSubTree(server.createExternalContext(), {
  "company-drive": webdav.ResourceType.Directory,
});
server.setFileSystemSync("/", root, true);

server.start(() => {
  console.log(`Company drive WebDAV mount is running on http://${host}:${port}/`);
});
