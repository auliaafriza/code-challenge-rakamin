import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { tenantAtom } from "@/stores/tenantAtom";
import { authAtom, clearToken } from "@/stores/authAtom";
import { roleLabel } from "@/services/auth";
import { Button } from "@/components/ui/button";
import SidebarNav, { type NavItem } from "@/components/layout/Sidebar";
import { LayoutDashboard, ClipboardList, Briefcase, Users, BarChart3, LogOut, Menu, X } from "lucide-react";
import ThemeToggle from "@/theme/ThemeToggle";

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assessments", label: "Assessment", icon: ClipboardList },
  { href: "/vacancies", label: "Vacancy", icon: Briefcase },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function AssessorLayout() {
  const tenant = useAtomValue(tenantAtom);
  const { user } = useAtomValue(authAtom);
  const setAuth = useSetAtom(authAtom);
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const handleLogout = () => {
    clearToken();
    setAuth({ token: null, user: null });
    navigate("/login");
  };

  const displayName = user?.display_name ?? user?.email ?? "Pengguna";
  const initials = displayName.trim().charAt(0).toUpperCase();

  const brand = (
    <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        R
      </span>
      <span className="truncate text-sm font-semibold">Rakamin AI Interview</span>
    </Link>
  );

  const userCard = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Tema</span>
        <ThemeToggle />
      </div>
      {tenant.name && (
        <p className="truncate rounded-lg bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
          Tenant: {tenant.name}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.role_label ?? roleLabel(user?.role)}
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Keluar" className="shrink-0 px-2">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav items={navItems} />
        </div>
        <div className="border-t p-3">{userCard}</div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-card px-4 lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu"
          aria-expanded={drawerOpen}
          className="px-2"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        {brand}
        <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Keluar" className="px-2">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-foreground/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              {brand}
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)} aria-label="Tutup menu" className="px-2">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav items={navItems} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-t p-3">{userCard}</div>
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
