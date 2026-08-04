import { AuthShell } from "@/components/auth/auth-shell";
import { Gate } from "@/components/gate";

/**
 * The guard sits outside `AuthShell`, not inside it: a locked visitor should get
 * what a missing route gets, and a missing route has no header and no footer.
 * See `components/gate/gate-store.ts` for what this does and does not hold shut.
 */
export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return (
    <Gate>
      <AuthShell>{children}</AuthShell>
    </Gate>
  );
}
