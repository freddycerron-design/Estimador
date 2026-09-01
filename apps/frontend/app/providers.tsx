"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FolderKanban, Brain, LogOut, ClipboardList, Settings } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { getMe } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "/requirements", label: "Requerimientos", icon: ClipboardList },
  { href: "/estimates", label: "Estimaciones", icon: FileText },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/learning/proposals", label: "Aprendizaje", icon: Brain },
];

function NavBar() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMe()
      .then((me) => setIsAdmin(me.app_role === "admin"))
      .catch(() => setIsAdmin(false));
  }, [user]);

  const links = isAdmin ? [...NAV_LINKS, { href: "/admin", label: "Admin", icon: Settings }] : NAV_LINKS;

  return (
    <header className="bg-nav-gradient shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="h-12 w-12 shrink-0 rounded-lg bg-white shadow-sm"
            style={{ backgroundImage: "url(/brand/estimadora-logo.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <span className="font-display text-xl font-semibold tracking-tight">
            <span className="text-white">Estima</span>
            <span className="text-brand-400">DORA</span>
          </span>
        </Link>
        {!loading && user && (
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
            <div className="ml-3 flex items-center gap-2 border-l border-white/20 pl-3">
              <ThemeToggle />
              <span className="hidden text-xs text-white/60 sm:inline">{user.email}</span>
              <button onClick={() => signOut()} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Cerrar sesión">
                <LogOut className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </AuthProvider>
  );
}
