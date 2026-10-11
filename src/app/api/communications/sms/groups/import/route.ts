import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeUgandanPhone } from "@/lib/server/smsug";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    const { data: membership, error: membershipError } = await supabase.from("company_memberships")
      .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "communications.sms.send",
    });
    if (permissionError || !allowed) return NextResponse.json({ error: "You do not have permission to import SMS contacts." }, { status: 403, headers });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Choose a CSV or XLSX file up to 5 MB." }, { status: 400, headers });
    }
    const fileName = file.name || "contacts.csv";
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "xlsx") {
      return NextResponse.json({ error: "Only CSV and XLSX files are supported." }, { status: 400, headers });
    }
    const workbook = new ExcelJS.Workbook();
    const bytes = Buffer.from(await file.arrayBuffer());
    if (extension === "csv") await workbook.csv.read(Readable.from([bytes]));
    else await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "The file has no worksheet to import." }, { status: 400, headers });

    const firstRow = sheet.getRow(1);
    let phoneColumn = 0;
    firstRow.eachCell((cell, column) => {
      if (/(phone|mobile|contact|number)/i.test(String(cell.text ?? cell.value ?? ""))) phoneColumn = column;
    });
    const members = new Map<string, { company_id: string; display_name: string; phone: string; contact_type: string; candidate_id: null }>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 && phoneColumn) return;
      const values: unknown[] = [];
      if (phoneColumn) values.push(row.getCell(phoneColumn).value);
      else row.eachCell({ includeEmpty: false }, (cell) => values.push(cell.value));
      for (const value of values) {
        const rawPhone = value && typeof value === "object" && "text" in value
          ? String((value as { text: unknown }).text)
          : value === null || value === undefined ? "" : String(value);
        const phone = normalizeUgandanPhone(rawPhone);
        if (!phone) continue;
        members.set(phone, {
          company_id: membership.company_id,
          display_name: `Imported contact ${members.size + 1}`,
          phone,
          contact_type: "Other",
          candidate_id: null,
        });
        break;
      }
    });
    if (!members.size) return NextResponse.json({ error: "No valid Ugandan phone numbers were found." }, { status: 400, headers });
    if (members.size > 3000) return NextResponse.json({ error: "A contact group can contain at most 3,000 numbers." }, { status: 400, headers });

    const requestedName = form.get("groupName");
    const derivedName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9 -]/g, " ").trim();
    const name = (typeof requestedName === "string" && requestedName.trim() ? requestedName.trim() : derivedName).slice(0, 120);
    if (!name) return NextResponse.json({ error: "Enter a group name." }, { status: 400, headers });
    const { data: group, error: groupError } = await supabase.from("sms_contact_groups")
      .insert({ company_id: membership.company_id, created_by: user.id, name })
      .select("id, name, created_at").single();
    if (groupError) {
      if (groupError.code === "23505") return NextResponse.json({ error: "A group with that name already exists." }, { status: 409, headers });
      throw groupError;
    }
    const { error: membersError } = await supabase.from("sms_contact_group_members")
      .insert([...members.values()].map((member) => ({ ...member, group_id: group.id })));
    if (membersError) {
      await supabase.from("sms_contact_groups").delete().eq("id", group.id).eq("company_id", membership.company_id);
      throw membersError;
    }
    return NextResponse.json({ group: { ...group, members: members.size }, imported: members.size }, { status: 201, headers });
  } catch (error) {
    console.error("SMS contact import failed", error);
    return NextResponse.json({ error: "Unable to import contacts. Check that the file contains valid phone numbers." }, { status: 503, headers });
  }
}