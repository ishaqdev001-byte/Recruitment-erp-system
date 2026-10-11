import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";

export type ImapSmtpSettings = {
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
};
type ResolvedMailHost = { hostname: string; address: string; family: 4 | 6 };

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    const mappedAddress = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedAddress) return isPrivateAddress(mappedAddress);
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
      || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
      || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  const [first, second] = normalized.split(".").map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19))
    || (first === 203 && second === 0);
}

export async function resolvePublicMailHost(host: string): Promise<ResolvedMailHost> {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || isIP(normalized) || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized)
    || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Use a public mail server hostname.");
  }
  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The mail server hostname must resolve to public addresses.");
  }
  const address = addresses[0];
  return { hostname: normalized, address: address.address, family: address.family as 4 | 6 };
}

export function createSmtpTransport(settings: ImapSmtpSettings, server: ResolvedMailHost) {
  return nodemailer.createTransport({
    host: server.address,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: { user: settings.username, pass: settings.password },
    requireTLS: !settings.smtpSecure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: true, servername: server.hostname },
  });
}

export async function verifyImapSmtpSettings(settings: ImapSmtpSettings) {
  const imapServer = await resolvePublicMailHost(settings.imapHost);
  const smtpServer = await resolvePublicMailHost(settings.smtpHost);
  const client = new ImapFlow({
    host: imapServer.address,
    port: settings.imapPort,
    secure: settings.imapSecure,
    doSTARTTLS: !settings.imapSecure,
    auth: { user: settings.username, pass: settings.password },
    tls: { servername: imapServer.hostname, rejectUnauthorized: true },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await client.connect();
  } finally {
    if (client.usable) await client.logout();
  }
  const transport = createSmtpTransport(settings, smtpServer);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function readImapFolder(settings: ImapSmtpSettings, folder: "inbox" | "starred" | "sent" | "drafts") {
  const imapServer = await resolvePublicMailHost(settings.imapHost);
  const client = new ImapFlow({
    host: imapServer.address,
    port: settings.imapPort,
    secure: settings.imapSecure,
    doSTARTTLS: !settings.imapSecure,
    auth: { user: settings.username, pass: settings.password },
    tls: { servername: imapServer.hostname, rejectUnauthorized: true },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await client.connect();
    const folders = await client.list();
    const specialUse = { sent: "\\sent", drafts: "\\drafts" } as const;
    const allMailFolder = folders.find((item) => String(item.specialUse ?? "").toLowerCase() === "\\all")
      ?? folders.find((item) => /(^|\/)(allmail|all mail)$/.test(item.path.toLowerCase().replace(/\s+/g, "")));
    const match = folder === "inbox" || folder === "starred" ? null : folders.find((item) => {
      const usage = String(item.specialUse ?? "").toLowerCase();
      const path = item.path.toLowerCase().replace(/\s+/g, "");
      return usage === specialUse[folder]
        || folder === "sent" && /(^|\/)(sent|sentmail|sentitems)$/.test(path)
        || folder === "drafts" && /(^|\/)drafts$/.test(path);
    });
    const mailboxPath = folder === "inbox" ? "INBOX" : folder === "starred" ? allMailFolder?.path ?? "INBOX" : match?.path;
    if (!mailboxPath) return [];
    const lock = await client.getMailboxLock(mailboxPath);
    try {
      const mailbox = client.mailbox;
      const total = mailbox && typeof mailbox === "object" ? mailbox.exists : 0;
      const flagged = folder === "starred" ? await client.search({ flagged: true }) : null;
      const range = folder === "starred"
        ? Array.isArray(flagged) ? flagged.slice(-25).join(",") : ""
        : total ? `${Math.max(1, total - 24)}:${total}` : "";
      if (!range) return [];
      const messages = [];
      for await (const item of client.fetch(range, { envelope: true, source: true, internalDate: true })) {
        if (!item.source) continue;
        const parsed = await (simpleParser as (source: Buffer) => Promise<ParsedMail>)(item.source);
        const messageDate = item.internalDate ?? item.envelope?.date ?? new Date();
        messages.push({
          id: `outlook-${item.uid}`,
          provider: "outlook" as const,
          direction: folder === "sent" || folder === "drafts" ? "Outbound" as const : "Inbound" as const,
          from: item.envelope?.from?.map((address) => address.name ? `${address.name} <${address.address ?? ""}>` : address.address ?? "").join(", ") ?? "",
          to: item.envelope?.to?.map((address) => address.address ?? "").filter(Boolean).join(", ") ?? "",
          subject: item.envelope?.subject || "(No subject)",
          body: typeof parsed.text === "string" ? parsed.text : parsed.html?.toString().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "",
          date: new Date(messageDate).toISOString(),
          status: folder === "drafts" ? "Draft" as const : folder === "sent" ? "Sent" as const : "Received" as const,
        });
      }
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    if (client.usable) await client.logout();
  }
}