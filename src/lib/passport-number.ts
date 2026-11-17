const ugandaNationalities = new Set(["UG", "UGANDA", "UGANDAN"]);
const zambiaNationalities = new Set(["ZM", "ZAMBIA", "ZAMBIAN"]);

export function normalizePassportNumber(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function isPassportNumberValid(nationality: string, value: string) {
  const country = nationality.normalize("NFKC").trim().toUpperCase();
  const passportNumber = normalizePassportNumber(value);
  if (!country || !/^[A-Z0-9]+$/.test(passportNumber)) return false;
  if (ugandaNationalities.has(country)) return passportNumber.length === 9;
  if (zambiaNationalities.has(country)) return passportNumber.length === 8;
  return passportNumber.length >= 1 && passportNumber.length <= 9;
}

export function passportNumberRule(nationality: string) {
  const country = nationality.normalize("NFKC").trim().toUpperCase();
  if (ugandaNationalities.has(country)) return "Ugandan passport numbers must be exactly 9 letters or digits.";
  if (zambiaNationalities.has(country)) return "Zambian passport numbers must be exactly 8 letters or digits.";
  return "Passport numbers for other nationalities must contain 1–9 letters or digits.";
}

export function passportRegistrationDuplicateMessage(match: {
  registered_last_name?: string | null;
  registered_agent_name?: string | null;
  belongs_to_another_agent?: boolean | null;
}) {
  const lastName = match.registered_last_name?.trim() || "This candidate";
  const agentName = match.registered_agent_name?.trim();

  if (match.belongs_to_another_agent) {
    return `This candidate belongs to another agent. ${lastName} is already registered at the office${agentName ? ` under ${agentName}` : ""}.`;
  }

  return `${lastName} is already registered at the office.`;
}
