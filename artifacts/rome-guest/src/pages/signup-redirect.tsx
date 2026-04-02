import { Redirect } from "wouter";

/** Opens the landing registration modal via query param handled in `landing.tsx`. */
export default function SignupRedirect() {
  return <Redirect to="/?register=1" />;
}
