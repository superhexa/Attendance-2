import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--chart-3))"];
const STATUS_AR = { PRESENT: "حاضر", ABSENT: "غائب", LATE: "متأخر", EXCUSED: "بعذر", LEFT_EARLY: "خروج مبكر" };

export default function Analytics() {
  const { t } = useLang();
  const { data, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: async () => (await api.get("/analytics", { params: { days: 30 } })).data });

  if (isLoading) return <div><PageHeader title={t("nav.analytics")} breadcrumb={t("group_insights")} /><LoadingState rows={6} /></div>;

  const dist = Object.entries(data.distribution).map(([k, v]) => ({ name: STATUS_AR[k], value: v }));
  const hasData = dist.some((d) => d.value > 0);

  return (
    <div>
      <PageHeader title={t("nav.analytics")} subtitle="تحليلات متقدمة للحضور خلال 30 يومًا" breadcrumb={t("group_insights")} />
      {!hasData ? <Card><EmptyState title="لا توجد بيانات حضور كافية للتحليل" /></Card> : (
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-lg font-bold">اتجاه نسبة الحضور اليومية</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} name="نسبة %" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-lg font-bold">توزيع حالات الحضور</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={dist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {dist.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-lg font-bold">مقارنة المواد</h3>
              {data.subject_comparison.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.subject_comparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                    <Bar dataKey="rate" radius={[6, 6, 0, 0]} fill="hsl(var(--chart-1))" name="نسبة %" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
