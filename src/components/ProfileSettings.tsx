"use client";

import React, { useEffect, useState } from "react";
import { User, Mail, Phone, MapPin, FileText, Upload, Loader2, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

interface ProfileData {
  id: string;
  display_name: string;
  phone: string;
  branch: string;
  bio: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CurrentPhoto {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
}

interface ProfileSettings {
  displayName: string;
  phone: string;
  branch: string;
  bio: string;
}

const initialProfileSettings: ProfileSettings = {
  displayName: "",
  phone: "",
  branch: "",
  bio: "",
};

export default function ProfileSettingsComponent() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState<CurrentPhoto | null>(null);
  const [settings, setSettings] = useState<ProfileSettings>(initialProfileSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Fetch profile on mount
  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/workspace/profile", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch profile");
      }

      const data = await response.json();
      setProfile(data.profile);
      setCurrentPhoto(data.currentPhoto);

      setSettings({
        displayName: data.profile.display_name,
        phone: data.profile.phone,
        branch: data.profile.branch,
        bio: data.profile.bio,
      });

      if (data.profile.photo_url) {
        setPhotoPreview(data.profile.photo_url);
      }

      setIsDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load profile";
      setError(message);
      console.error("Profile fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(field: keyof ProfileSettings, value: string) {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setError("");
    setSuccess("");
  }

  async function handleSaveProfile() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/workspace/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: settings.displayName,
          phone: settings.phone,
          branch: settings.branch,
          bio: settings.bio,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save profile");
      }

      const data = await response.json();
      setProfile(data.profile);
      setIsDirty(false);
      setSuccess("Profile updated successfully!");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
      console.error("Profile save error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    try {
      setUploading(true);
      setError("");
      setSuccess("");

      // Validate file size
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error(`Photo must be smaller than ${maxSize / (1024 * 1024)}MB`);
      }

      // Validate MIME type
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("Only JPEG, PNG, WebP, and GIF images are allowed");
      }

      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api/workspace/profile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload photo");
      }

      const data = await response.json();
      setCurrentPhoto(data.photo);
      setProfile((prev) => (prev ? { ...prev, photo_url: data.photoUrl } : null));
      setPhotoPreview(data.photoUrl);
      setSuccess("Photo uploaded successfully!");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload photo";
      setError(message);
      console.error("Photo upload error:", err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto() {
    if (!currentPhoto) return;

    try {
      if (!window.confirm("Are you sure you want to delete this photo?")) return;

      setDeletingPhoto(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/workspace/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-photo",
          photoId: currentPhoto.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete photo");
      }

      setCurrentPhoto(null);
      setProfile((prev) => (prev ? { ...prev, photo_url: null } : null));
      setPhotoPreview(null);
      setSuccess("Photo deleted successfully!");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete photo";
      setError(message);
      console.error("Photo delete error:", err);
    } finally {
      setDeletingPhoto(false);
    }
  }

  function handlePhotoFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      handlePhotoUpload(file);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <p className="text-slate-300">Failed to load profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-850 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Profile Settings</h1>
          <p className="text-slate-400">Manage your profile information and photo</p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-green-200">{success}</p>
          </div>
        )}

        {/* Profile Photo Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-400" />
            Profile Photo
          </h2>

          <div className="flex gap-6">
            {/* Photo Preview */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 bg-slate-800 rounded-lg border-2 border-slate-700 flex items-center justify-center overflow-hidden">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-16 h-16 text-slate-600" />
                )}
              </div>
            </div>

            {/* Upload Area */}
            <div className="flex-1">
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-blue-400 transition">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <label className="cursor-pointer">
                  <span className="text-blue-400 hover:text-blue-300 font-medium">
                    Click to upload
                  </span>
                  <span className="text-slate-400"> or drag and drop</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileInput}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500 mt-2">
                  PNG, JPG, WebP, GIF up to 10MB
                </p>
              </div>

              {currentPhoto && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={handleDeletePhoto}
                    disabled={deletingPhoto || uploading}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingPhoto ? "Deleting..." : "Delete Photo"}
                  </button>
                </div>
              )}

              {uploading && (
                <div className="mt-4 flex items-center gap-2 text-blue-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Uploading...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Information Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Profile Information
          </h2>

          <div className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                Display Name
              </label>
              <input
                type="text"
                value={settings.displayName}
                onChange={(e) => handleInputChange("displayName", e.target.value)}
                maxLength={200}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your display name"
              />
              <p className="text-xs text-slate-500 mt-1">
                {settings.displayName.length}/200 characters
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-500" />
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                maxLength={60}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your phone number"
              />
              <p className="text-xs text-slate-500 mt-1">
                {settings.phone.length}/60 characters
              </p>
            </div>

            {/* Branch */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-500" />
                Branch / Location
              </label>
              <input
                type="text"
                value={settings.branch}
                onChange={(e) => handleInputChange("branch", e.target.value)}
                maxLength={200}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="e.g., Main Branch, Kampala Office"
              />
              <p className="text-xs text-slate-500 mt-1">
                {settings.branch.length}/200 characters
              </p>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                Bio
              </label>
              <textarea
                value={settings.bio}
                onChange={(e) => handleInputChange("bio", e.target.value)}
                maxLength={5000}
                rows={4}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                placeholder="Tell us about yourself..."
              />
              <p className="text-xs text-slate-500 mt-1">
                {settings.bio.length}/5000 characters
              </p>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={!isDirty || saving}
                className="flex-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
              {isDirty && (
                <button
                  onClick={() => {
                    setSettings({
                      displayName: profile.display_name,
                      phone: profile.phone,
                      branch: profile.branch,
                      bio: profile.bio,
                    });
                    setIsDirty(false);
                    setError("");
                  }}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Metadata */}
        <div className="mt-6 p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-500">
          <p>Profile created: {new Date(profile.created_at).toLocaleString()}</p>
          <p>Last updated: {new Date(profile.updated_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
