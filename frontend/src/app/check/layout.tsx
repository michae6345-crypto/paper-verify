import { Gate } from "@/components/gate";

/**
 * `/check` is behind the curtain. This layout exists for no other reason — the
 * route had none before, and the page still owns everything it renders.
 *
 * The guard is a client component and this stays a server one, so the page below
 * is unaffected: it is passed through as `children` and rendered on the server
 * either way. `components/gate/gate-store.ts` is explicit about what that means
 * and about what may never be put behind it.
 */
export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return <Gate>{children}</Gate>;
}
