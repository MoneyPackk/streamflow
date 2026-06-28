import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const planNames: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  max: "Max",
};

const planColors: Record<string, string> = {
  free: "bg-zinc-700",
  basic: "bg-blue-600",
  premium: "bg-primary",
  max: "bg-amber-600",
};

export default function Account() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, subscription, logout } = useAuthStore();
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      // Refresh page to pick up updated subscription state
      window.location.reload();
    }
  }, [searchParams]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Sign in to manage your account</p>
          <button onClick={() => navigate("/auth")} className="mt-4 bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-emerald-600 transition-colors">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const isSubscribed = subscription && ["active", "trialing"].includes(subscription.status);
  const plan = subscription?.plan || "free";
  const planName = planNames[plan] || "Free";
  const planColor = planColors[plan] || "bg-zinc-700";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const isCanceled = subscription?.status === "canceled" || !!subscription?.canceled_at;

  const handlePortal = async () => {
    setPortalLoading(true);
    setError("");
    try {
      const { subscriptionApi } = await import("../services/api");
      const data = await subscriptionApi.portal();
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-display font-bold mb-8">Account</h1>

      {/* Profile */}
      <section className="bg-card rounded-xl border border-zinc-800 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Display Name</span>
            <span>{user.username || "Not set"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member Since</span>
            <span>Today</span>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="bg-card rounded-xl border border-zinc-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Subscription</h2>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-white ${planColor}`}>
            {planName}
          </span>
        </div>

        {isSubscribed ? (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={subscription?.status === "trialing" ? "text-yellow-400" : "text-green-400"}>
                {subscription?.status === "trialing" ? "Trial" : "Active"}
              </span>
            </div>
            {periodEnd && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isCanceled ? "Ends" : "Next Billing"}</span>
                <span>{periodEnd}</span>
              </div>
            )}
            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Loading..." : "Manage Billing"}
              </button>
              <button
                onClick={() => navigate("/pricing")}
                className="bg-card border border-zinc-700 text-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
              >
                Change Plan
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              You're currently on the Free plan. Subscribe to unlock unlimited streaming in HD and 4K.
            </p>
            <button
              onClick={() => navigate("/pricing")}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              View Plans
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      </section>

      {/* Sign Out */}
      <section className="text-center">
        <button
          onClick={async () => { await logout(); navigate("/"); }}
          className="text-sm text-muted-foreground hover:text-red-400 transition-colors"
        >
          Sign Out
        </button>
      </section>
    </div>
  );
}
