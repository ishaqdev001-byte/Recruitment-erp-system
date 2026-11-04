# User Profile Management Implementation

## Overview
This document outlines the complete implementation of user profile management with photo upload and editing capabilities for the Recruitment ERP system. Users, agents, and staff can now update their profiles, add profile photos, and include a bio through both:
1. **Quick Edit Modal** - Accessible from user avatar in TopBar (name, phone, photo)
2. **Full Profile Page** - New dedicated view with extended profile information (bio, branch, location details)

## Features Implemented

### 1. Database Schema

#### New Migration: `20261105120000_profile_management_enhancements.sql`
- **Extended `profiles` table** with:
  - `bio` field (text, max 5000 characters) for user bio/description
  - Works with existing `avatar_url` field (from `20261104093919_user_profile_photos.sql`)
  - Also uses existing fields: `display_name`, `phone`, `branch`

- **Audit Logging**:
  - `audit_profile_update()` trigger logs changes to:
    - `display_name`
    - `phone`
    - `branch`
    - `bio`
    - `avatar_url` (avatar changes logged)

#### Existing Storage Setup:
- **Supabase Storage bucket**: `profile-photos`
  - File size limit: 5MB (configurable)
  - Allowed MIME types: JPEG, PNG, WebP
  - Path format: `{user_id}/avatar`
  - Private bucket (requires authentication to access)

### 2. API Endpoints

#### `/api/workspace/my-profile` (existing endpoint)
Already handles:
- **GET**: Retrieve profile and photo
  - `?photo=1` returns the actual photo file
  - Otherwise returns profile metadata
  
- **PATCH**: Update profile text fields (display_name, phone)
  
- **POST**: Upload profile photo
  - Accepts multipart form data with `photo` file
  - Validates file size and MIME type
  - Stores as `{user_id}/avatar` in Supabase Storage

- **DELETE**: Remove profile photo
  - Removes avatar_url reference and deletes from storage

#### `/api/workspace/profile` (newly created endpoints)
Additional endpoints for the new full profile page:
- **GET**: Retrieve comprehensive profile info
- **POST**: Update all profile fields (display_name, phone, branch, bio)
- **POST with file**: Upload profile photo
- **PATCH**: Delete profile photo

Note: The TopBar component continues to use `/api/workspace/my-profile`, while the new ProfileSettings component can use either endpoint.

### 3. React Components

#### `ProfileSettings.tsx` (NEW)
Full-page profile management component
- **Location**: `src/components/ProfileSettings.tsx`
- **Features**:
  - Display current profile photo with fallback avatar
  - Upload new profile photos with drag-and-drop support
  - Edit profile text fields:
    - Display Name (1-200 chars)
    - Phone Number (0-60 chars)
    - Branch/Location (0-200 chars)
    - Bio (0-5000 chars)
  - Delete profile photo with confirmation
  - Real-time character count validation
  - Save/cancel buttons with dirty state tracking
  - Success and error notifications
  - Loading states for async operations
  - Profile metadata display (created/updated timestamps)

- **Validations**:
  - Display name: 1-200 characters
  - Phone: up to 60 characters
  - Branch: up to 200 characters
  - Bio: up to 5000 characters
  - Photo: JPEG, PNG, WebP only, max 10MB

#### `ProfileCard.tsx` (NEW)
Compact reusable profile display component
- **Location**: `src/components/ProfileCard.tsx`
- **Two modes**:
  1. **Compact mode**: Small avatar + name + branch (for sidebars, lists)
  2. **Full mode**: Avatar, name, email, phone, branch, bio, edit button

- **Features**:
  - Fetches profile data automatically
  - Shows photo or generates initials avatar
  - Optional edit button callback
  - Responsive design
  - Used for dashboard widgets, employee cards, etc.

#### `TopBar.tsx` (UPDATED)
- **Added**: "My full profile" button alongside "Edit profile"
- **Existing functionality retained**:
  - Quick profile edit modal
  - Photo upload in modal
  - Name and phone editing
- **New button** navigates to full profile page (`onNavigate("profile")`)

### 4. Navigation Integration

#### View Type Addition (`App.tsx`)
- Added `"profile"` to the `View` type
- Added profile preloading in `viewPreloaders`
- Added case statement for profile view rendering:
  ```typescript
  case "profile":
    return <ProfileSettings />
  ```
- Dynamic import of `ProfileSettings` component with loading state

#### TopBar Integration (`TopBar.tsx`)
User profile dropdown menu now shows:
1. User avatar, name, and email
2. User role
3. **"My full profile"** button → Opens full profile page
4. **"Edit profile"** button → Opens quick-edit modal

## File Structure
```
/supabase/migrations/
  ├── 20261104093919_user_profile_photos.sql       (Existing: Supabase Storage setup)
  └── 20261105120000_profile_management_enhancements.sql (New: bio field + audit)

/src/app/api/workspace/
  ├── my-profile/route.ts                          (Existing: photo upload/retrieval)
  └── profile/route.ts                             (New: extended profile endpoints)

/src/components/
  ├── ProfileSettings.tsx                          (New: full-page profile editor)
  ├── ProfileCard.tsx                              (New: reusable profile display)
  ├── TopBar.tsx                                   (Updated: added profile menu buttons)
  └── ...others unchanged

/src/App.tsx                                       (Updated: added profile view)

/PROFILE_MANAGEMENT_IMPLEMENTATION.md             (This file)
```

## Security Considerations

### Authentication & Authorization
- All endpoints require authenticated user (Supabase Auth)
- Users can only access/modify their own profile
- Service role used only for admin operations
- Company membership verified before access
- Audit logging tracks all profile changes

### File Upload Security
- File size validation (max 5MB in Supabase Storage)
- MIME type whitelist (JPEG, PNG, WebP)
- File type detection via file-type library
- Supabase Storage enforces additional validation
- Automatic filename generation prevents path traversal

### Storage
- Files stored in Supabase private storage bucket
- Path: `profile-photos/{user_id}/avatar`
- Only authenticated users can access their own photos
- Automatic cleanup when photos deleted

### Audit Trail
- Profile updates logged with changed fields
- Photo operations logged
- Access to audit logs restricted by company and permissions

## Usage

### For End Users

#### Quick Edit (from TopBar)
1. Click user avatar (top-right corner)
2. Click "Edit profile"
3. Upload/change photo in modal
4. Edit name and phone
5. Click "Save changes"

#### Full Profile Page (Dedicated)
1. Click user avatar (top-right corner)
2. Click "My full profile"
3. Edit all profile information:
   - Photo (drag-drop or click to upload)
   - Display name
   - Phone number
   - Branch/location
   - Bio
4. Click "Save Changes" or "Cancel"

### For Developers

#### Using ProfileSettings Component
```typescript
import ProfileSettings from "@/components/ProfileSettings";

// In your page/component:
<ProfileSettings />
```

#### Using ProfileCard Component
```typescript
import ProfileCard from "@/components/ProfileCard";

// Compact mode
<ProfileCard compact userEmail="user@example.com" />

// Full mode
<ProfileCard onEditClick={() => navigate("profile")} />
```

#### API Calls (my-profile endpoint)
```typescript
// Fetch profile
const response = await fetch("/api/workspace/my-profile");
const { profile } = await response.json();

// Get photo URL
const photoUrl = "/api/workspace/my-profile?photo=1";

// Update profile
await fetch("/api/workspace/my-profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    display_name: "New Name",
    phone: "+256700123456"
  })
});

// Upload photo
const formData = new FormData();
formData.append("photo", fileInput.files[0]);
await fetch("/api/workspace/my-profile", {
  method: "POST",
  body: formData
});

// Delete photo
await fetch("/api/workspace/my-profile", {
  method: "DELETE"
});
```

#### API Calls (profile endpoint)
```typescript
// Get profile with all fields
const response = await fetch("/api/workspace/profile");
const { profile, currentPhoto } = await response.json();

// Update profile with all fields
await fetch("/api/workspace/profile", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    displayName: "John Doe",
    phone: "+256700123456",
    branch: "Kampala Main Office",
    bio: "Experienced recruitment specialist..."
  })
});

// Upload photo
const formData = new FormData();
formData.append("photo", fileInput.files[0]);
await fetch("/api/workspace/profile", {
  method: "POST",
  body: formData
});

// Delete photo
await fetch("/api/workspace/profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "delete-photo",
    photoId: "photo-uuid"
  })
});
```

## Migration & Deployment Steps

### 1. Apply Database Migrations
```bash
# The existing migration (if not yet applied):
supabase db push 20261104093919_user_profile_photos.sql

# The new migration:
supabase db push 20261105120000_profile_management_enhancements.sql
```

### 2. Verify Configuration
Ensure `.env.local` has:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Build & Deploy
```bash
npm run build
npm start
```

### 4. Test Profile Functionality
- [ ] Log in with test user
- [ ] Click profile avatar → "My full profile"
- [ ] Upload profile photo
- [ ] Edit all profile fields
- [ ] Verify changes saved
- [ ] Delete photo
- [ ] Verify photo deleted and cleared from profile
- [ ] Test quick-edit modal from avatar
- [ ] Verify audit logs show changes

## Existing Features Retained

The implementation preserves and enhances existing functionality:
- ✅ Existing `/api/workspace/my-profile` endpoint works unchanged
- ✅ Quick-edit modal in TopBar remains functional
- ✅ Photo upload via Supabase Storage
- ✅ User profile dropdown menu
- ✅ All authentication and authorization
- ✅ Existing audit logging
- ✅ Theme and density settings

## Testing Checklist

- [ ] Fetch profile data successfully
- [ ] Upload profile photo (all supported formats)
- [ ] View uploaded photo via URL
- [ ] Update individual profile fields
- [ ] Update all fields simultaneously
- [ ] Delete profile photo successfully
- [ ] Verify character limits enforced
- [ ] Verify file size limits enforced
- [ ] Test with invalid MIME types (should reject)
- [ ] Audit logs record all changes
- [ ] Multi-user isolation (can't see other profiles)
- [ ] Photo deleted from storage when removed
- [ ] Quick-edit modal works alongside full page
- [ ] Profile view accessible via "My full profile" button
- [ ] Navigation between views works correctly

## Future Enhancement Ideas

- [ ] Profile picture cropping/resizing UI
- [ ] Social profile links (LinkedIn, GitHub, Twitter)
- [ ] Department/team assignment display
- [ ] Signature image/file for contracts
- [ ] Profile visibility settings
- [ ] Photo gallery of past profile pictures
- [ ] Batch import profiles from CSV
- [ ] Department directory
- [ ] Generate QR code for profile sharing
- [ ] Integration with Gravatar as fallback
