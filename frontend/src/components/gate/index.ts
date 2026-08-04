/**
 * The private door. Read `gate-store.ts` first: it is a curtain, not a lock,
 * and the difference is the whole of what may be put behind it.
 *
 * For a gated route, wrap its layout:
 *
 *     import { Gate } from "@/components/gate";
 *
 *     export default function DashboardLayout({ children }: { children: React.ReactNode }) {
 *       return <Gate>{children}</Gate>;
 *     }
 *
 * `Gate` is a client component and takes one prop, `children`. The layout
 * wrapping it stays a server component; `children` is passed through untouched.
 * Put it outermost, above the route's own chrome, so a locked visitor gets a
 * bare 404 rather than one framed in the product's furniture.
 *
 * `GateEntry` is mounted once, in the root layout, and listens for the sequence
 * everywhere. A gated route does not need it and must not mount a second one.
 *
 * `useGateUnlocked` and `lockGate` are here for a surface that wants its own
 * control — a "lock" item in a menu, say. `GateEntry`'s prompt already offers
 * one, so nothing has to.
 */

export { Gate } from "@/components/gate/gate";
export { GateEntry } from "@/components/gate/gate-entry";
export { GATE_KEY, isGateUnlocked, lockGate, subscribeToGate, unlockGate } from "@/components/gate/gate-store";
export { useGateUnlocked } from "@/components/gate/use-gate";
