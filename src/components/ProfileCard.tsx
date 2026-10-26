"use client";

import React, { useEffect, useState } from "react";
import { User, Mail, Phone, MapPin, Edit2 } from "lucide-react";

interface ProfileInfo {
  id: string;
  display_name: string;
  phone: string;
  branch: string;
  bio: string;
  photo_url: string | null;
}

interface ProfileCardProps {
  compact?: boolean;
  onEditClick?: () => void;
  userEmail?: string;
}

export default function ProfileCard({
  compact = false,
  onEditClick,
  userEmail,
}: ProfileCardProps) {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const response = await fetch("/api/workspace/profile", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !profile) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {profile.photo_url ? (
          <img
            src={profile.photo_url}
            alt={profile.display_name}
            className="w-10 h-10 rounded-full object-cover border border-slate-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {profile.display_name || "User"}
          </p>
          {profile.branch && (
            <p className="text-xs text-slate-400 truncate">{profile.branch}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex gap-4">
          {/* Photo */}
          <div className="flex-shrink-0">
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.display_name}
                className="w-24 h-24 rounded-lg object-cover border border-slate-700"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                <User className="w-12 h-12 text-slate-600" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1">
              {profile.display_name || "User Profile"}
            </h3>
            {userEmail && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                <Mail className="w-4 h-4" />
                {userEmail}
              </div>
            )}
            {profile.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                <Phone className="w-4 h-4" />
                {profile.phone}
              </div>
            )}
            {profile.branch && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <MapPin className="w-4 h-4" />
                {profile.branch}
              </div>
            )}
          </div>
        </div>

        {onEditClick && (
          <button
            onClick={onEditClick}
            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
            title="Edit profile"
          >
            <Edit2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {profile.bio && (
        <div className="border-t border-slate-800 pt-4">
          <p className="text-sm text-slate-300">{profile.bio}</p>
        </div>
      )}
    </div>
  );
}
