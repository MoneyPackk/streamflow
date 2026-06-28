import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Home from "../pages/Home";
import Browse from "../pages/Browse";
import MovieDetail from "../pages/MovieDetail";
import Player from "../pages/Player";
import Search from "../pages/Search";
import Auth from "../pages/Auth";
import Pricing from "../pages/Pricing";
import Account from "../pages/Account";
import { useAuthStore } from "../store/authStore";

function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-6xl font-display font-bold text-primary mb-4">404</h1>
        <p className="text-muted-foreground mb-6">Page not found</p>
        <a href="/" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors">
          Go Home
        </a>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  const { user } = useAuthStore();

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/player/:id" element={<Player />} />
        <Route path="/search" element={<Search />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/account" element={<Account />} />
        <Route path="/auth" element={user ? <Navigate to="/" /> : <Auth />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
