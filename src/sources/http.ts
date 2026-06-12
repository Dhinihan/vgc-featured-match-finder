import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";

// O TCP connect ate o PokéData (OVH) leva ~300ms; o default de 250ms do
// Happy Eyeballs do Node derruba a tentativa antes de completar (ETIMEDOUT).
try {
  setDefaultAutoSelectFamilyAttemptTimeout(2000);
} catch {
  // versoes antigas do Node nao expoem o setter; segue com o default.
}
