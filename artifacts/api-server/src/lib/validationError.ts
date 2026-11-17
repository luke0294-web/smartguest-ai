/**
 * Structural shape of a Zod error (api-server doesn't depend on zod
 * directly: the schemas come from @workspace/api-zod).
 */
type ValidationIssue = {
  code: string;
  path: ReadonlyArray<string | number>;
  message: string;
  type?: unknown;
  maximum?: unknown;
  minimum?: unknown;
  received?: unknown;
};
type ValidationError = { issues: ReadonlyArray<ValidationIssue> };

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
  const field = issue.path.length > 0 ? `"${issue.path.join(".")}"` : "";
  const label = field ? `Il campo ${field}` : "Il valore";

  if (issue.code === "too_big" && issue.type === "string") {
    if (!issue.message.startsWith("String must")) return issue.message;
    return `${label} può contenere al massimo ${Number(issue.maximum).toLocaleString("it-IT")} caratteri.`;
  }
  if (issue.code === "too_small" && issue.type === "string") {
    if (!issue.message.startsWith("String must")) return issue.message;
    return Number(issue.minimum) <= 1
      ? `${label} è obbligatorio.`
      : `${label} deve contenere almeno ${Number(issue.minimum)} caratteri.`;
  }
  if (issue.code === "too_big" && issue.type === "array") {
    return `${label} contiene troppi elementi (massimo ${Number(issue.maximum)}).`;
  }
  if (issue.code === "custom") return issue.message;
  if (issue.code === "invalid_type" && issue.received === "undefined") {
    return `${label} è obbligatorio.`;
  }
  return `${label} non è valido.`;
}
