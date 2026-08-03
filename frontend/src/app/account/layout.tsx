import { AuthShell } from "@/components/auth/auth-shell";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
