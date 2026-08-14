export function redactSensitive(text: string, maxLength = 4000): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[邮箱已脱敏]")
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, "[手机号已脱敏]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[身份证号已脱敏]")
    .replace(/\b(?:sk|qbk)[-_][A-Za-z0-9_-]{12,}\b/g, "[密钥已脱敏]")
    .replace(/https?:\/\/\S+/gi, "[链接已脱敏]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function opaqueDeviceNo(kind: "candidate" | "organization", id: string): string {
  return `${kind}:${id.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 100)}`;
}

