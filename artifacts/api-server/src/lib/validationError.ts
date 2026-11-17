/**
 * Structural shape of a Zod error (api-server doesn't depend on zod
 * directly: the schemas come from @workspace/api-zod).
 */
type ValidationIssue = {
  code: string;
  path: ReadonlyArray<PropertyKey>;
  message: string;
  /** zod 3 */
  type?: unknown;
  /** zod 4 (same meaning as `type`) */
  origin?: unknown;
  maximum?: unknown;
  minimum?: unknown;
  received?: unknown;
};
type ValidationError = { issues: ReadonlyArray<ValidationIssue> };

/** True for zod's own English length messages (zod 3 "String must…", zod 4 "Too big:/Too small:…"). */
function isDefaultLengthMessage(message: string): boolean {
  return /^(String must|Array must|Too big:|Too small:)/.test(message);
}

/** True when the field was missing (zod 3 sets `received`, zod 4 only says it in the message). */
function isMissing(issue: ValidationIssue): boolean {
  return issue.received === "undefined" || /received undefined\s*$/.test(issue.message);
}

/**
 * Turns a Zod validation error into one short, readable message for the
 * client. Routes used to send `error.message`, which for Zod is the full
 * JSON dump of every issue (in English) — the CEO panel and host dashboard
 * showed that raw JSON to the user.
 *
 * Custom messages written in the schema (e.g. "Il manuale casa non può
 * superare 20.000 caratteri") are kept as they are.
 */
export function validationErrorMessage(error: ValidationError): string {
  const issue = error.issues[0];
  if (!issue) return "Dati non validi.";
  const field = issue.path.length > 0 ? `"${issue.path.map((p) => String(p)).join(".")}"` : "";
  const kind = issue.type ?? issue.origin;
  const label = field ? `Il campo ${field}` : "Il valore";

  if (issue.code === "too_big" && kind === "string") {
    if (!isDefaultLengthMessage(issue.message)) return issue.message;
    return `${label} può contenere al massimo ${Number(issue.maximum).toLocaleString("it-IT")} caratteri.`;
  }
  if (issue.code === "too_small" && kind === "string") {
    if (!isDefaultLengthMessage(issue.message)) return issue.message;
    return Number(issue.minimum) <= 1
      ? `${label} è obbligatorio.`
      : `${label} deve contenere almeno ${Number(issue.minimum)} caratteri.`;
  }
  if (issue.code === "too_big" && kind === "array") {
    return `${label} contiene troppi elementi (massimo ${Number(issue.maximum)}).`;
  }
  if (issue.code === "custom") return issue.message;
  if (issue.code === "invalid_type" && isMissing(issue)) {
    return `${label} è obbligatorio.`;
  }
  return `${label} non è valido.`;
}
