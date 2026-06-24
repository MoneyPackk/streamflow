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
      </Routes>
    </>
  );
}
