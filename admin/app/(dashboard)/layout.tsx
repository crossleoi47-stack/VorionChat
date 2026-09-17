"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearTokens } from "@/lib/api";
import { resetSocket } from "@/lib/socket";
import { CallProvider } from "@/components/CallProvider";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { LogoMark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import {
  IconAudit,
  IconChats,
  IconClients,
  IconDashboard,
  IconEye,
  IconPlug,
  IconShield,
  IconStatus,
  IconTeam,
  IconTransfer,
  IconUser,
} from "@/components/Icons";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const { user, canManageEmployees, canReassign, canSeeAudit } = useCurrentUser();

  useEffect(() => {
    const token = window.localStorage.getItem("custodian.accessToken");
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  const top = [
    { href: "/inbox", label: "Chats", Icon: IconChats, show: true },
    { href: "/status", label: "Status", Icon: IconStatus, show: true },
    { href: "/clients", label: "Clients", Icon: IconClients, show: true },
  ].filter((i) => i.show);

  const admin = [
    { href: "/", label: "Dashboard", Icon: IconDashboard, show: true },
    { href: "/departments", label: "Departments", Icon: IconTeam, show: canManageEmployees },
    { href: "/employees", label: "Employees", Icon: IconUser, show: canManageEmployees },
    { href: "/assignments", label: "Assignments", Icon: IconTransfer, show: canReassign },
    { href: "/controls", label: "Controls", Icon: IconShield, show: canManageEmployees },
    { href: "/oversight", label: "Oversight", Icon: IconEye, show: canSeeAudit },
    { href: "/whatsapp", label: "WhatsApp setup", Icon: IconPlug, show: canManageEmployees },
    { href: "/audit-log", label: "Audit log", Icon: IconAudit, show: canSeeAudit },
  ].filter((i) => i.show);

  // Chats and Status both use the full-height two-pane shell rather than the
  // padded document layout the admin pages use.
  const isChat = pathname === "/inbox" || pathname === "/status";

  return (
    <CallProvider>
    <div className="app">
      <nav className="rail" aria-label="Main">
        <div className="rail-logo">
          <LogoMark size={34} />
        </div>

        {top.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`rail-btn ${pathname === href ? "active" : ""}`}
            aria-label={label}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon />
            <span className="tip">{label}</span>
          </Link>
        ))}

        <div className="rail-sep" />

        {admin.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`rail-btn ${pathname === href ? "active" : ""}`}
            aria-label={label}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon />
            <span className="tip">{label}</span>
          </Link>
        ))}

        <div className="rail-spacer" />

        {user && (
          <button
            className="rail-btn"
            onClick={() => {
              resetSocket();
              clearTokens();
              router.replace("/login");
            }}
            aria-label={`${user.fullName} — sign out`}
          >
            <Avatar name={user.fullName} seed={user.id} size="sm" />
            <span className="tip">
              {user.fullName} · sign out
            </span>
          </button>
        )}
      </nav>

      <div className={`app-main${isChat ? " chat-mode" : ""}`}>
        {isChat ? children : <div className="page">{children}</div>}
      </div>
    </div>
    </CallProvider>
  );
}
