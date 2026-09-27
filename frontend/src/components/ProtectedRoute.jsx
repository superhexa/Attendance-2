import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { hasAjyalSession } from "@/lib/ajyalAuth";

export function ProtectedRoute({ children, perm, roles }) {
  const { user, can, hasRole } = useAuth();
  const location = useLocation();

  if (user === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (user === false) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!hasAjyalSession(user.id)) {
    return <Navigate to="/ajyal-login" state={{ from: location }} replace />;
  }
  if (perm && !can(perm)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (roles && !hasRole(...roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
