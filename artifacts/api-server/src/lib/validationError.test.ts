import { describe, expect, it } from "vitest";
import {
  HostUpdatePropertyBody,
  SendPropertyChatBody,
  SetHostPasswordBody,
  CreateLeadBody,
} from "@workspace/api-zod";
import { validationErrorMessage } from "./validationError";

type Schema = { safeParse: (v: unknown) => { success: true } | { success: false; error: Parameters<typeof validationErrorMessage>[0] } };
const msg = (schema: Schema, value: unknown): string => {
  const r = schema.safeParse(value);
  if (r.success) throw new Error("expected failure");
  return validationErrorMessage(r.error);
};

describe("validationErrorMessage", () => {
  it("keeps the custom Italian messages written in the schemas", () => {
    expect(msg(HostUpdatePropertyBody, { content: "x".repeat(20001) })).toBe(
      "Il manuale casa non può superare 20.000 caratteri",
    );
    expect(msg(SetHostPasswordBody, { hostPassword: "abc" })).toBe("La password deve contenere almeno 8 caratteri");
  });

  it("translates default length errors and names the field", () => {
    expect(msg(HostUpdatePropertyBody, { name: "x".repeat(201) })).toBe(
      'Il campo "name" può contenere al massimo 200 caratteri.',
    );
    expect(msg(SendPropertyChatBody, { message: "ciao", language: "xx-evil-prompt" })).toBe(
      'Il campo "language" può contenere al massimo 10 caratteri.',
    );
  });

  it("handles missing fields, arrays and wrong types without leaking JSON", () => {
    expect(msg(CreateLeadBody, { email: "a@b.it", propertyName: "Casa" })).toBe('Il campo "hostName" è obbligatorio.');
    const history = Array.from({ length: 50 }, () => ({ role: "user", content: "a" }));
    expect(msg(SendPropertyChatBody, { message: "ciao", conversationHistory: history })).toMatch(
      /^Il campo "conversationHistory" contiene troppi elementi \(massimo \d+\)\.$/,
    );
    const wrongType = msg(SendPropertyChatBody, { message: 42 });
    expect(wrongType).toBe('Il campo "message" non è valido.');
    expect(wrongType).not.toContain("{");
  });
});
