import { useState, useEffect } from "react";
import { Clock, X, Check, AlertCircle } from "lucide-react";

type OfflineStatus = {
  id: string;
  offlineDate: string;
  isAllDay: boolean;
  offlineStartTime?: string;
  offlineEndTime?: string;
  reason?: string;
};

interface Props {
  onClose: () => void;
}

export default function DoctorOfflineMode({ onClose }: Props) {
  const [offlineDate, setOfflineDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [isAllDay, setIsAllDay] = useState(true);
  const [offlineStartTime, setOfflineStartTime] = useState<string>("09:00");
  const [offlineEndTime, setOfflineEndTime] = useState<string>("17:00");
  const [reason, setReason] = useState<string>("");
  const [offlineStatuses, setOfflineStatuses] = useState<OfflineStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Fetch existing offline statuses on mount
  useEffect(() => {
    fetchOfflineStatuses();
  }, []);

  const fetchOfflineStatuses = async () => {
    try {
      const response = await fetch("/api/medical/doctor-offline", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        offlineStatuses?: OfflineStatus[];
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || "Unable to fetch offline statuses.");
      setOfflineStatuses(payload.offlineStatuses || []);
    } catch (err) {
      console.error("Fetch offline statuses error", err);
    }
  };

  const handleSetOffline = async () => {
    setError("");
    setSuccessMessage("");

    if (!offlineDate) {
      setError("Please select a date.");
      return;
    }

    if (!isAllDay && (!offlineStartTime || !offlineEndTime)) {
      setError("Please select start and end times.");
      return;
    }

    if (
      !isAllDay &&
      offlineStartTime &&
      offlineEndTime &&
      offlineStartTime >= offlineEndTime
    ) {
      setError("Start time must be before end time.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/medical/doctor-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offlineDate,
          isAllDay,
          offlineStartTime: isAllDay ? undefined : offlineStartTime,
          offlineEndTime: isAllDay ? undefined : offlineEndTime,
          reason: reason || undefined,
          action: "set",
        }),
      });

      const payload = (await response.json()) as {
        offlineStatus?: OfflineStatus;
        message?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || "Unable to set offline status.");

      setSuccessMessage(payload.message || "Offline status saved successfully.");
      await fetchOfflineStatuses();

      // Reset form
      setOfflineDate(new Date().toISOString().split("T")[0]);
      setIsAllDay(true);
      setOfflineStartTime("09:00");
      setOfflineEndTime("17:00");
      setReason("");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to set offline status.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOffline = async (id: string, date: string) => {
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/medical/doctor-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offlineDate: date,
          action: "remove",
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) throw new Error(payload.error || "Unable to remove offline status.");

      setSuccessMessage("Offline status removed.");
      await fetchOfflineStatuses();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove offline status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-title"
        className="w-full max-w-2xl border p-6 shadow-2xl rounded-lg"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2
              id="offline-title"
              className="text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              <Clock size={20} className="inline mr-2" aria-hidden="true" />
              Offline Mode
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              Set your unavailable times for medical appointments
            </p>
          </div>
          <button
            type="button"
            aria-label="Close offline mode"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {error && (
          <div
            className="mb-4 rounded border p-3 text-sm flex items-start gap-2"
            style={{
              background: "#ef444422",
              borderColor: "#ef4444",
              color: "#ef4444",
            }}
          >
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {successMessage && (
          <div
            className="mb-4 rounded border p-3 text-sm flex items-start gap-2"
            style={{
              background: "#10b98122",
              borderColor: "#10b981",
              color: "#10b981",
            }}
          >
            <Check size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {successMessage}
          </div>
        )}

        <div className="space-y-4 mb-6">
          {/* Date Selection */}
          <div>
            <label className="block text-xs font-600 mb-1" style={{ color: "var(--foreground)" }}>
              Date <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              value={offlineDate}
              onChange={(e) => setOfflineDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full border px-3 py-2 text-sm rounded"
              style={{
                background: "var(--secondary)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is-all-day"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--primary)" }}
            />
            <label htmlFor="is-all-day" className="text-sm font-600" style={{ color: "var(--foreground)" }}>
              Offline entire day
            </label>
          </div>

          {/* Time Range (visible only if not all day) */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 mb-1" style={{ color: "var(--foreground)" }}>
                  Start Time <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="time"
                  value={offlineStartTime}
                  onChange={(e) => setOfflineStartTime(e.target.value)}
                  className="w-full border px-3 py-2 text-sm rounded"
                  style={{
                    background: "var(--secondary)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-600 mb-1" style={{ color: "var(--foreground)" }}>
                  End Time <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="time"
                  value={offlineEndTime}
                  onChange={(e) => setOfflineEndTime(e.target.value)}
                  className="w-full border px-3 py-2 text-sm rounded"
                  style={{
                    background: "var(--secondary)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Reason (Optional) */}
          <div>
            <label className="block text-xs font-600 mb-1" style={{ color: "var(--foreground)" }}>
              Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Personal appointment, Training, etc."
              maxLength={100}
              className="w-full border px-3 py-2 text-sm rounded"
              style={{
                background: "var(--secondary)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {reason.length}/100 characters
            </p>
          </div>
        </div>

        {/* Current Offline Statuses */}
        {offlineStatuses.length > 0 && (
          <div className="mb-6 rounded border p-4" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
            <h3 className="text-xs font-700 uppercase tracking-wide mb-3" style={{ color: "var(--muted-foreground)" }}>
              Your Upcoming Offline Times
            </h3>
            <div className="space-y-2">
              {offlineStatuses.map((status) => (
                <div
                  key={status.id}
                  className="flex items-start justify-between gap-3 p-2 rounded"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}
                >
                  <div>
                    <div className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                      {new Date(status.offlineDate).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      {status.isAllDay
                        ? "All day"
                        : `${status.offlineStartTime} - ${status.offlineEndTime}`}
                      {status.reason && ` · ${status.reason}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveOffline(status.id, status.offlineDate)}
                    disabled={loading}
                    className="px-2 py-1 text-xs font-600 rounded border"
                    style={{
                      borderColor: "var(--border)",
                      color: "#ef4444",
                      background: "transparent",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <footer className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSetOffline}
            disabled={loading}
            className="px-6 py-2 text-sm font-600 rounded inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {loading ? "Saving…" : "Save Offline Status"}
          </button>
        </footer>
      </section>
    </div>
  );
}
