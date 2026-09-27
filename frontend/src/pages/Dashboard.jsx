import React from "react";
import { useAuth } from "@/lib/auth";
import AdminDashboard from "@/pages/dashboards/AdminDashboard";
import TeacherDashboard from "@/pages/dashboards/TeacherDashboard";
import StudentDashboard from "@/pages/dashboards/StudentDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;
  if (role === "STUDENT") return <StudentDashboard />;
  if (role === "TEACHER") return <TeacherDashboard />;
  return <AdminDashboard />;
}
