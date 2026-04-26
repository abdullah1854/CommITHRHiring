import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useListUsers, useCreateUser, useUpdateUser } from "@workspace/api-client-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Users, Settings, Plus, Shield, ShieldAlert, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Role = "recruiter" | "admin";

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const { data: usersData, isLoading: usersLoading, refetch } = useListUsers();
  const { mutateAsync: createUser, isPending: isCreating } = useCreateUser();
  const { mutateAsync: updateUser, isPending: isUpdating } = useUpdateUser();

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role>("recruiter");
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "recruiter" as Role, password: "" });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({
        data: {
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          ...(newUser.password ? { password: newUser.password } : {}),
        },
      });
      toast.success("User created successfully!");
      setIsAddUserOpen(false);
      setNewUser({ email: "", name: "", role: "recruiter", password: "" });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create user.");
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    if (currentUser?.id === userId && currentStatus) {
      toast.error("You cannot deactivate your own account.");
      return;
    }
    try {
      await updateUser({ id: userId, data: { isActive: !currentStatus } });
      toast.success(`User ${currentStatus ? "deactivated" : "activated"}.`);
      refetch();
    } catch {
      toast.error("Failed to update user status.");
    }
  };

  const openEditRole = (userId: string, role: Role) => {
    setEditingUserId(userId);
    setEditRole(role);
  };

  const handleSaveRole = async () => {
    if (!editingUserId) return;
    try {
      await updateUser({ id: editingUserId, data: { role: editRole } });
      toast.success("Role updated.");
      setEditingUserId(null);
      refetch();
    } catch {
      toast.error("Failed to update role.");
    }
  };

  return (
    <DashboardLayout title="Administration">
      <div className="bg-card border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="flex border-b border-slate-200">
          <button
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === "users" ? "text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setActiveTab("users")}
          >
            <Users className="w-4 h-4" /> Users & Roles
          </button>
          <button
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === "system" ? "text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setActiveTab("system")}
          >
            <Settings className="w-4 h-4" /> System Settings
          </button>
        </div>

        {activeTab === "users" && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Manage Team Members</h3>
                <p className="text-sm text-slate-500 mt-1">{usersData?.users.length ?? 0} team members in your organization</p>
              </div>
              <button
                onClick={() => setIsAddUserOpen(true)}
                className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Add User
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm font-semibold text-slate-600">Name</th>
                    <th className="p-4 text-sm font-semibold text-slate-600">Email</th>
                    <th className="p-4 text-sm font-semibold text-slate-600">Role</th>
                    <th className="p-4 text-sm font-semibold text-slate-600">Status</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersLoading && (
                    <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                  )}
                  {!usersLoading && (usersData?.users ?? []).length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500">No team members yet. Add your first user above.</td></tr>
                  )}
                  {(usersData?.users ?? []).map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-900">
                        {user.name}
                        {currentUser?.id === user.id && (
                          <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-600">{user.email}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                          {user.role === "admin" ? <ShieldAlert className="w-3 h-3 mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${user.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                          {user.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openEditRole(user.id, user.role as Role)}
                            className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
                          >
                            Edit Role
                          </button>
                          <button
                            onClick={() => handleToggleStatus(user.id, user.isActive)}
                            disabled={currentUser?.id === user.id && user.isActive}
                            className={`text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${user.isActive ? "text-red-500 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"}`}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "system" && (
          <div className="p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-6">System Configuration</h3>
            <div className="space-y-6 max-w-2xl">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-5 rounded-xl border border-purple-100">
                <h4 className="font-semibold text-slate-900 mb-2">OpenAI Integration</h4>
                <p className="text-sm text-slate-500 mb-4">AI screening, JD generation, and candidate summaries are powered by OpenAI via Replit AI Integrations.</p>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                  <CheckCircle className="w-3 h-3" /> Connected & Active
                </span>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Email Notifications</h4>
                <p className="text-sm text-slate-500 mb-4">Configure SMTP templates for candidate emails and interview invites. Email sending is handled server-side.</p>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                  Configure SMTP to enable
                </span>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Data Retention</h4>
                <p className="text-sm text-slate-500 mb-4">All candidate data, resumes, and screening results are stored in your private PostgreSQL database.</p>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                  <CheckCircle className="w-3 h-3" /> Encrypted at rest
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {isAddUserOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add New User</h3>
            <p className="text-sm text-slate-500 mb-6">Send them an invite to join your GIQ workspace.</p>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. Jane Smith"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Work Email</label>
                <input
                  required
                  type="email"
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="jane@company.com"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                <select
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value as Role })}
                >
                  <option value="recruiter">Recruiter — Can manage candidates & interviews</option>
                  <option value="admin">Admin — Full access including team management</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Temporary Password <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="password"
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Leave blank to send an invite link"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddUserOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isCreating} className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCreating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUserId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingUserId(null)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Change Role</h3>
            <p className="text-sm text-slate-500 mb-6">Update this user's permission level.</p>
            <div className="space-y-2">
              {(["recruiter", "admin"] as Role[]).map(r => (
                <button
                  key={r}
                  onClick={() => setEditRole(r)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${editRole === r ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="flex items-center gap-2">
                    {r === "admin" ? <ShieldAlert className="w-4 h-4 text-purple-600" /> : <Shield className="w-4 h-4 text-blue-600" />}
                    <span className="font-semibold text-slate-900 capitalize">{r}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 ml-6">
                    {r === "admin" ? "Full access, team management, settings" : "Manage candidates, jobs, and interviews"}
                  </p>
                </button>
              ))}
            </div>
            <div className="pt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUserId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSaveRole} disabled={isUpdating} className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
