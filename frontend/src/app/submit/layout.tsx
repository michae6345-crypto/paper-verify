import { AuthShell } from "@/components/auth/auth-shell";

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
