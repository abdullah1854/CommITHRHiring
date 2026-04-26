import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Bell, Mail, Calendar, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "giq-notification-preferences";

type Preferences = {
  candidateUpdates: boolean;
  interviewReminders: boolean;
  aiScreeningComplete: boolean;
  weeklyDigest: boolean;
};

const DEFAULT_PREFS: Preferences = {
  candidateUpdates: true,
  interviewReminders: true,
  aiScreeningComplete: true,
  weeklyDigest: false,
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, []);

  const save = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    toast.success("Notification preferences saved on this device");
  };

  const toggle = (key: keyof Preferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <DashboardLayout title="User Settings">
      <div className="max-w-3xl space-y-6">
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Notification Preferences</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose which recruitment events should notify you. These MVP preferences are stored locally on this device.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <PreferenceRow
              icon={<Mail className="w-4 h-4" />}
              title="Candidate updates"
              description="Status changes, shortlist/reject actions, and new applications."
              checked={prefs.candidateUpdates}
              onToggle={() => toggle("candidateUpdates")}
            />
            <PreferenceRow
              icon={<Calendar className="w-4 h-4" />}
              title="Interview reminders"
              description="Upcoming interviews, invite delivery, and schedule changes."
              checked={prefs.interviewReminders}
              onToggle={() => toggle("interviewReminders")}
            />
            <PreferenceRow
              icon={<Sparkles className="w-4 h-4" />}
              title="AI screening complete"
              description="Alerts when AI screening or candidate summaries finish."
              checked={prefs.aiScreeningComplete}
              onToggle={() => toggle("aiScreeningComplete")}
            />
            <PreferenceRow
              icon={<Bell className="w-4 h-4" />}
              title="Weekly digest"
              description="A weekly summary of funnel movement, interviews, and open jobs."
              checked={prefs.weeklyDigest}
              onToggle={() => toggle("weeklyDigest")}
            />
          </div>

          <div className="pt-6 mt-6 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-border hover:bg-muted text-left transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform mt-0.5 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
