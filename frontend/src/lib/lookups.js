import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useActiveYear() {
  return useQuery({
    queryKey: ["years"],
    queryFn: async () => (await api.get("/academic-years")).data,
    select: (rows) => rows,
  });
}

export function useGrades(yearId) {
  return useQuery({
    queryKey: ["grades", yearId || "all"],
    queryFn: async () => (await api.get("/grades", { params: yearId ? { academic_year_id: yearId } : {} })).data,
  });
}

export function useSections(params = {}) {
  return useQuery({
    queryKey: ["sections", params.grade_id || "all", params.academic_year_id || "all"],
    queryFn: async () => (await api.get("/sections", { params })).data,
  });
}

export function useSubjects() {
  return useQuery({ queryKey: ["subjects"], queryFn: async () => (await api.get("/subjects")).data });
}

export function useTeachersList() {
  return useQuery({ queryKey: ["teachers-all"], queryFn: async () => (await api.get("/teachers", { params: { limit: 200 } })).data });
}
