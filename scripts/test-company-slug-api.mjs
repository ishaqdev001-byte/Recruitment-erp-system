#!/usr/bin/env node

/**
 * Test script to verify company slug API endpoint works after migration
 * Usage: node scripts/test-company-slug-api.mjs [companySlug]
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const companySlug = args[0] || "kilax";

async function testCompanySlugAPI() {
  try {
    console.log(`Testing company slug API for: ${companySlug}`);
    console.log(`Endpoint: ${SITE_URL}/api/companies/${companySlug}\n`);

    const response = await fetch(`${SITE_URL}/api/companies/${companySlug}`);

    if (!response.ok) {
      console.error(`❌ API returned status ${response.status}`);
      const errorText = await response.text();
      console.error("Error response:", errorText);
      process.exit(1);
    }

    const company = await response.json();
    console.log("✅ Company slug API is working!\n");
    console.log("Company data:");
    console.log(JSON.stringify(company, null, 2));

    // Verify required fields
    const requiredFields = [
      "id",
      "name",
      "slug",
      "logo_url",
      "primary_admin_email",
      "primary_admin_first_name",
      "primary_admin_last_name",
    ];

    const missing = requiredFields.filter((field) => !(field in company));
    if (missing.length > 0) {
      console.warn(`\n⚠️  Missing fields: ${missing.join(", ")}`);
    } else {
      console.log("\n✅ All required fields present");
    }
  } catch (error) {
    console.error("❌ Error testing API:", error.message);
    process.exit(1);
  }
}

testCompanySlugAPI();
