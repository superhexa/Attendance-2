import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Plus, ShieldCheck, KeyRound, SlidersHorizontal } from "lucide-react";

const EMPTY = { email: "", full_name: "", password: "", role: "READ_ONLY_ADMIN" };

export default function Users() {
  const { t } = useLang();
  const { meta, user: me } = useAuth();
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState("all");
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [perms, setPerms] = useState(null); // {user, desired:Set}

  const { data, isLoading } = useQuery({
    queryKey: ["users", roleFilter],
    queryFn: async () => (await api.get("/users", { params: { role: roleFilter !== "all" ? roleFilter : undefined, limit: 100 } })).data,
  });

  const roleLabel = (r) => meta?.role_labels?.[r]?.ar || r;

  const create = async () => {
    if (!form.email || !form.full_name || !form.password) { toast.error("جميع الحقول مطلوبة"); return; }
    try { await api.post("/users", form); toast.success("تم إنشاء المستخدم"); setDialog(false); setForm(EMPTY); qc.invalidateQueries({ queryKey: ["users"] }); }
    catch (e) { toast.error(apiError(e)); }
  };
  const changeRole = async (id, role) => { try { await api.patch(`/users/${id}`, { role }); qc.invalidateQueries({ queryKey: ["users"] }); toast.success("تم تحديث الدور"); } catch (e) { toast.error(apiError(e)); } };
  const toggleStatus = async (u) => { try { await api.patch(`/users/${u.id}`, { status: u.status === "active" ? "disabled" : "active" }); qc.invalidateQueries({ queryKey: ["users"] }); } catch (e) { toast.error(apiError(e)); } };
  const resetPw = async (id) => { try { const { data } = await api.post(`/users/${id}/reset-password`); toast.success(`كلمة المرور: ${data.temporary_password}`, { duration: 10000 }); } catch (e) { toast.error(apiError(e)); } };

  const openPerms = (u) => setPerms({ user: u, desired: new Set(u.permissions || []) });
  const togglePerm = (p) => setPerms((s) => { const d = new Set(s.desired); d.has(p) ? d.delete(p) : d.add(p); return { ...s, desired: d }; });
  const savePerms = async () => {
    const base = new Set(meta.role_permissions[perms.user.role] || []);
    const desired = perms.desired;
    const grant = [...desired].filter((p) => !base.has(p));
    const revoke = [...base].filter((p) => !desired.has(p));
    try { await api.patch(`/users/${perms.user.id}`, { permission_overrides: { grant, revoke } }); toast.success("تم حفظ الصلاحيات"); setPerms(null); qc.invalidateQueries({ queryKey: ["users"] }); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title={t("nav.users")} subtitle="إدارة المستخدمين والأدوار والصلاحيات" breadcrumb={t("group_people")}
        actions={<Button onClick={() => { setForm(EMPTY); setDialog(true); }} className="gap-2" data-testid="add-user-btn"><Plus className="h-4 w-4" /> مستخدم جديد</Button>} />

      <Card className="mb-4 p-4">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-56" data-testid="user-role-filter"><SelectValue placeholder="الدور" /></SelectTrigger>
          <SelectContent><SelectItem value="all">كل الأدوار</SelectItem>{(meta?.roles || []).map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent></Select>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? <LoadingState /> : (data?.items || []).length === 0 ? <EmptyState title="لا يوجد مستخدمون" icon={ShieldCheck} /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-start">الاسم</TableHead><TableHead className="text-start">البريد</TableHead>
              <TableHead className="text-start">الدور</TableHead><TableHead className="text-start">{t("status")}</TableHead>
              <TableHead className="text-start">{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                  <TableCell className="font-semibold">{u.full_name}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)} disabled={u.id === me?.id}>
                      <SelectTrigger className="h-8 w-40" data-testid={`role-${u.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{(meta?.roles || []).map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent></Select>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleStatus(u)} disabled={u.id === me?.id} data-testid={`status-${u.id}`}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"}`}>
                      {u.status === "active" ? "نشط" : "معطّل"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openPerms(u)} title="الصلاحيات" data-testid={`perms-${u.id}`}><SlidersHorizontal className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => resetPw(u.id)} title="إعادة تعيين كلمة المرور" data-testid={`resetpw-${u.id}`}><KeyRound className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create user */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent><DialogHeader><DialogTitle>مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} data-testid="user-name" /></div>
            <div className="space-y-1.5"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="user-email" /></div>
            <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="user-password" /></div>
            <div className="space-y-1.5"><Label>الدور</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}><SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>{(meta?.roles || []).map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>إلغاء</Button><Button onClick={create} data-testid="save-user">إنشاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission overrides */}
      <Dialog open={!!perms} onOpenChange={() => setPerms(null)}>
        <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>صلاحيات: {perms?.user?.full_name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">الصلاحيات الموروثة من الدور «{roleLabel(perms?.user?.role)}» قابلة للتخصيص لكل مستخدم.</p>
          <ScrollArea className="h-80 rounded-lg border p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              {perms && meta && Object.entries(meta.permission_groups).map(([grp, list]) => (
                <div key={grp}>
                  <p className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">{grp}</p>
                  <div className="space-y-1">
                    {list.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={perms.desired.has(p)} onChange={() => togglePerm(p)} className="accent-emerald-600" data-testid={`perm-${p}`} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter><Button variant="outline" onClick={() => setPerms(null)}>إلغاء</Button><Button onClick={savePerms} data-testid="save-perms">حفظ الصلاحيات</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
