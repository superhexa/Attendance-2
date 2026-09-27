import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import AjyalLogin from "@/pages/AjyalLogin";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import TakeAttendance from "@/pages/TakeAttendance";
import AttendanceView from "@/pages/AttendanceView";
import Corrections from "@/pages/Corrections";
import ScanQR from "@/pages/ScanQR";
import Structure from "@/pages/Structure";
import Subjects from "@/pages/Subjects";
import Timetable from "@/pages/Timetable";
import Students from "@/pages/Students";
import StudentDetail from "@/pages/StudentDetail";
import Teachers from "@/pages/Teachers";
import Users from "@/pages/Users";
import PendingSignups from "@/pages/PendingSignups";
import Substitutions from "@/pages/Substitutions";
import OcrAttendance from "@/pages/OcrAttendance";
import Reports from "@/pages/Reports";
import Analytics from "@/pages/Analytics";
import Announcements from "@/pages/Announcements";
import Notifications from "@/pages/Notifications";
import AuditLogs from "@/pages/AuditLogs";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/ajyal-login" element={<AjyalLogin />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/take-attendance" element={<ProtectedRoute perm="attendance.create"><TakeAttendance /></ProtectedRoute>} />
              <Route path="/attendance" element={<ProtectedRoute perm="attendance.view"><AttendanceView /></ProtectedRoute>} />
              <Route path="/corrections" element={<ProtectedRoute perm="attendance.view"><Corrections /></ProtectedRoute>} />
              <Route path="/scan" element={<ProtectedRoute roles={["STUDENT"]}><ScanQR /></ProtectedRoute>} />
              <Route path="/structure" element={<ProtectedRoute perm="structure.view"><Structure /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute perm="subjects.view"><Subjects /></ProtectedRoute>} />
              <Route path="/timetable" element={<ProtectedRoute perm="timetable.view"><Timetable /></ProtectedRoute>} />
              <Route path="/students" element={<ProtectedRoute perm="students.view"><Students /></ProtectedRoute>} />
              <Route path="/students/:id" element={<ProtectedRoute perm="students.view"><StudentDetail /></ProtectedRoute>} />
              <Route path="/teachers" element={<ProtectedRoute perm="teachers.view"><Teachers /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute perm="users.view"><Users /></ProtectedRoute>} />
              <Route path="/signups" element={<ProtectedRoute perm="signups.view"><PendingSignups /></ProtectedRoute>} />
              <Route path="/substitutions" element={<ProtectedRoute perm="substitutions.manage"><Substitutions /></ProtectedRoute>} />
              <Route path="/ocr" element={<ProtectedRoute perm="attendance.create"><OcrAttendance /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute perm="reports.view"><Reports /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute perm="reports.view"><Analytics /></ProtectedRoute>} />
              <Route path="/announcements" element={<ProtectedRoute perm="announcements.view"><Announcements /></ProtectedRoute>} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/audit" element={<ProtectedRoute perm="audit_logs.view"><AuditLogs /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute perm="settings.manage"><Settings /></ProtectedRoute>} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-center" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
