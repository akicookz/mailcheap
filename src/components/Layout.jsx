import { NavLink, Outlet } from "react-router-dom";
import {
  Mail,
  LayoutDashboard,
  Send,
  Users,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
export default function Layout({ onLogout }) {
  const status = useResource("admin/status");
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="logo">
          <Mail size={22} /> Mailcheap
        </NavLink>
        <nav aria-label="Main navigation">
          {[
            ["/", "Overview", LayoutDashboard],
            ["/campaigns", "Campaigns", Send],
            ["/contacts", "Contacts", Users],
            ["/newsletters", "Newsletters", BookOpen],
            ["/settings", "Settings", Settings],
          ].map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span
            className={`connection ${status.data?.sending_enabled ? "enabled" : ""}`}
          >
            <i />
            {status.data?.local_preview
              ? "Local preview"
              : status.data?.sending_enabled
                ? "Sending enabled"
                : "Sending is off"}
          </span>
          <button
            onClick={async () => {
              try {
                await api("logout", { method: "POST" });
                onLogout();
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <Outlet context={{ status: status.data }} />
      </main>
    </div>
  );
}
