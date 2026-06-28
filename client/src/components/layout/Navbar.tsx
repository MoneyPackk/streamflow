import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useState } from "react";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, subscription, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  const isSubscribed = subscription && ["active", "trialing"].includes(subscription.status);
  const plan = subscription?.plan || "free";

  const links = [
    { to: "/", label: "Home" },
    { to: "/browse", label: "Browse" },
  ];

  const planBadge: Record<string, string> = {
    free: "text-zinc-500",
    basic: "text-blue-400",
    premium: "text-emerald-400",
    max: "text-amber-400",
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-display text-2xl font-bold text-primary tracking-tight">
            Streamora
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === l.to ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/pricing"
              className={`text-sm font-medium transition-colors ${
                location.pathname === "/pricing" ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/search" className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/account" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
                <span>{user.username || user.email.split("@")[0]}</span>
                {isSubscribed && (
                  <span className={`text-xs font-medium ${planBadge[plan] || "text-zinc-500"}`}>
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </span>
                )}
              </Link>
              <button onClick={() => { logout(); navigate("/"); }} className="text-xs text-muted-foreground hover:text-red-400 transition-colors">Logout</button>
            </div>
          ) : (
            <Link to="/auth" className="text-sm font-medium text-primary hover:text-emerald-400 transition-colors">Sign In</Link>
          )}
          <button className="md:hidden text-muted-foreground" onClick={() => setOpen(!open)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-zinc-800 px-4 py-3 space-y-2">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">{l.label}</Link>
          ))}
          <Link to="/pricing" onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
          <Link to="/search" onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">Search</Link>
        </div>
      )}
    </header>
  );
}
