import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useMovieStore } from "../store/authStore";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    features: ["Browse and search", "5-minute previews", "Standard quality (720p)", "1 device", "Ads supported"],
    highlighted: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: 7.99,
    features: ["Unlimited streaming", "1080p Full HD", "1 simultaneous device", "Ad-free", "Watch history sync"],
    highlighted: false,
  },
  {
    id: "premium",
    name: "Premium",
    price: 14.99,
    features: ["Everything in Basic", "4K Ultra HD + HDR", "4 simultaneous devices", "Early access", "Download for offline", "Priority support"],
    highlighted: true,
  },
  {
    id: "max",
    name: "Max",
    price: 24.99,
    features: ["Everything in Premium", "10 simultaneous devices", "Exclusive content", "Family sharing (5 accounts)", "Highest bitrate", "24/7 priority support"],
    highlighted: false,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user, subscription, setSubscription } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isSubscribed = subscription && ["active", "trialing"].includes(subscription.status);
  const currentPlan = subscription?.plan || "free";

  const handleSubscribe = async (planId: string) => {
    if (planId === "free") {
      if (!isSubscribed) {
        setSubscription({ plan: "free", status: "active", current_period_end: null });
      }
      navigate("/");
      return;
    }

    if (!user) {
      navigate("/auth");
      return;
    }

    if (isSubscribed && currentPlan === planId) {
      navigate("/account");
      return;
    }

    setLoading(planId);
    setError("");

    try {
      const { subscriptionApi } = await import("../services/api");
      const successUrl = `${window.location.origin}/account?success=true`;
      const cancelUrl = `${window.location.origin}/pricing`;
      const data = await subscriptionApi.checkout(planId, successUrl, cancelUrl);
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold">Choose your plan</h1>
        <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
          Stream anywhere, anytime. Cancel anytime. All plans include a 7-day free trial.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const isCurrent = isSubscribed && currentPlan === plan.id;
          const isLoading = loading === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative bg-card rounded-xl border transition-all ${
                plan.highlighted
                  ? "border-primary/50 ring-1 ring-primary/20 scale-[1.02]"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              <div className="p-6">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <svg className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isLoading}
                  className={`mt-8 w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
                    isCurrent
                      ? "bg-primary/20 text-primary cursor-default"
                      : plan.id === "free"
                        ? "bg-card border border-zinc-700 text-foreground hover:bg-zinc-800"
                        : "bg-primary text-primary-foreground hover:bg-emerald-600 disabled:opacity-50"
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : isCurrent ? (
                    "Current Plan"
                  ) : plan.id === "free" ? (
                    "Get Started"
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-display font-bold text-center mb-6">Compare Plans</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 font-medium">Feature</th>
                {plans.map((p) => (
                  <th key={p.id} className="py-3 px-4 font-medium text-center">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              <tr><td className="py-3 px-4 text-muted-foreground">Video Quality</td><td className="py-3 px-4 text-center">720p</td><td className="py-3 px-4 text-center">1080p</td><td className="py-3 px-4 text-center">4K HDR</td><td className="py-3 px-4 text-center">4K HDR</td></tr>
              <tr><td className="py-3 px-4 text-muted-foreground">Devices</td><td className="py-3 px-4 text-center">1</td><td className="py-3 px-4 text-center">1</td><td className="py-3 px-4 text-center">4</td><td className="py-3 px-4 text-center">10</td></tr>
              <tr><td className="py-3 px-4 text-muted-foreground">Ads</td><td className="py-3 px-4 text-center">Yes</td><td className="py-3 px-4 text-center">No</td><td className="py-3 px-4 text-center">No</td><td className="py-3 px-4 text-center">No</td></tr>
              <tr><td className="py-3 px-4 text-muted-foreground">Downloads</td><td className="py-3 px-4 text-center">—</td><td className="py-3 px-4 text-center">—</td><td className="py-3 px-4 text-center">✓</td><td className="py-3 px-4 text-center">✓</td></tr>
              <tr><td className="py-3 px-4 text-muted-foreground">Family Sharing</td><td className="py-3 px-4 text-center">—</td><td className="py-3 px-4 text-center">—</td><td className="py-3 px-4 text-center">—</td><td className="py-3 px-4 text-center">5 accounts</td></tr>
              <tr><td className="py-3 px-4 text-muted-foreground">Support</td><td className="py-3 px-4 text-center">Basic</td><td className="py-3 px-4 text-center">Standard</td><td className="py-3 px-4 text-center">Priority</td><td className="py-3 px-4 text-center">24/7 Priority</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
