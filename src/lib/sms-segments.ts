const gsm7Basic =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const gsm7Extension = "^{}\\[~]|€\f";

export function getSmsSegmentInfo(message: string) {
  let septets = 0;
  let gsm7 = true;

  for (const character of message) {
    if (gsm7Basic.includes(character)) {
      septets += 1;
    } else if (gsm7Extension.includes(character)) {
      septets += 2;
    } else {
      gsm7 = false;
      break;
    }
  }

  const length = gsm7 ? septets : message.length;
  const singleLimit = gsm7 ? 160 : 70;
  const multipartLimit = gsm7 ? 153 : 67;
  const segments = length === 0 ? 0 : length <= singleLimit ? 1 : Math.ceil(length / multipartLimit);

  return {
    encoding: gsm7 ? "GSM-7" : "UCS-2",
    units: length,
    segments,
    remainingCharacters: Math.max(0, 480 - message.length),
  } as const;
}
