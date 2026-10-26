# Medical Appointments System - Implementation Summary

## Overview
Comprehensive medical appointments system with doctor/hospital management, fee tracking, auto-invoicing, and appointment slips for the Recruitment ERP.

## Features Implemented

### 1. Database Schema (Migration: 202610260001_hospitals_and_enhanced_medical.sql)

#### New Tables:
- **hospitals**: Medical centers/facilities with contact details
  - id (uuid, PK)
  - company_id (uuid, FK)
  - name (text, unique per company)
  - contact_phone, contact_email, address, city, country (text)
  - is_active (boolean)
  - created_by, created_at, updated_at

- **doctor_hospital_affiliations**: Links doctors to hospitals with fee tracking
  - id (uuid, PK)
  - company_id, doctor_user_id, hospital_id (uuid, FKs)
  - fee_to_doctor (numeric) - amount paid to doctor per medical service
  - is_primary (boolean) - default hospital for doctor
  - unique constraint: (doctor_user_id, hospital_id, company_id)

#### Enhanced medical_appointments Table:
- doctor_user_id (uuid FK) - doctor performing examination
- hospital_id (uuid FK) - hospital where appointment takes place
- doctor_fee_amount (numeric) - amount to be paid to doctor/hospital
- candidate_amount_after_doctor_fee (numeric) - candidate's payment after doctor fee deduction
- appointment_slip_generated (boolean) - slip PDF generated
- invoice_id (uuid FK) - auto-generated invoice for doctor fee
- remarks (text) - additional appointment notes
- received_by_name, booked_by_name (text) - staff names for audit trail

### 2. API Endpoints

#### /api/medical/hospitals (GET, POST)
**GET**: List all active hospitals for company
- Returns: `{ hospitals: Hospital[] }`

**POST**: Create or update hospital
- Actions:
  - `create-hospital`: Add new hospital
  - `update-hospital`: Modify hospital details
- Returns: `{ hospital: Hospital }`
- Permissions: finance.create / finance.edit

#### /api/medical/doctor-affiliations (GET, POST)
**GET**: List doctor-hospital links with fee info
- Returns: `{ affiliations: DoctorAffiliation[] }`

**POST**: Link doctor to hospital or update affiliation
- Actions:
  - `link-doctor-hospital`: Create new affiliation
  - `update-affiliation`: Modify fee or primary status
- Parameters:
  - doctorUserId (uuid)
  - hospitalId (uuid)
  - feeToDoctor (numeric) - per-service fee
  - isPrimary (boolean) - make default hospital
- Returns: `{ affiliation: DoctorAffiliation }`
- Permissions: finance.create / finance.edit

#### /api/medical/book-appointment (POST)
**Enhanced medical appointment booking with comprehensive fee handling**
- Parameters:
  - candidateId (optional, uuid)
  - firstName, lastName, dateOfBirth, passportNumber, phone
  - incomeTypeId (uuid) - medical service type
  - hospitalId (uuid) - hospital for appointment
  - doctorUserId (uuid) - doctor performing service
  - appointmentAt (ISO datetime)
  - totalFeeAmount (numeric) - total candidate payment
  - doctorFeeAmount (numeric) - amount to pay doctor/hospital
  - remarks (text, optional)
  - receivedByName, bookedByName (text, optional)

- Processing Flow:
  1. Validates all candidate and appointment details
  2. Creates medical_appointments record
  3. Records income transaction for candidate payment (totalFeeAmount - doctorFeeAmount)
  4. **Auto-creates invoice** for doctor/hospital as supplier with doctorFeeAmount
  5. Updates candidate stage to "Medical Booked" if applicable
  6. Returns appointment with all details and payment reference

- Returns:
  ```json
  {
    "appointment": {
      "id": "...",
      "fee_amount": 500000,
      "doctor_fee_amount": 150000,
      "candidate_amount_after_doctor_fee": 350000,
      "income_type_name": "General Medical Examination",
      "hospital_name": "Mulago Hospital",
      "payment_reference": "MED-ABC123XYZ",
      "status": "booked"
    }
  }
  ```

#### /api/medical/appointment-slip (GET)
**Generate appointment slip PDF**
- Parameters: appointmentId (query parameter)
- Returns: PDF file with:
  - Candidate information (name, DOB, age, passport, phone)
  - Appointment details (date/time, medical service, remarks)
  - Hospital information (name, phone, email, address)
  - Doctor information and specialty
  - Fee breakdown (total, doctor fee, candidate amount)
  - Booking details (booked by, received by, booking date, reference)
  - Professional formatting with company branding

### 3. Frontend Components

#### HospitalManagement Component
**Location**: /src/components/HospitalManagement.tsx
**Features**:
- Tab 1: Hospitals
  - List hospitals in card grid
  - Edit hospital details
  - Add new hospital
  - Status indicator (Active/Inactive)

- Tab 2: Doctor Affiliations
  - Table view of doctor-hospital links
  - Display doctor name and email
  - Show per-service fee amount
  - Indicate primary hospital
  - Edit affiliation fee and primary status

**Access**: Available in main app navigation under "Hospital Management"

#### Enhanced MedicalAppointments Component
**Location**: /src/components/MedicalAppointments.tsx
**Updates**:
- Hospital selection dropdown (populated from active hospitals)
- Fee breakdown section:
  - Total fee amount input
  - Doctor/hospital fee input
  - Auto-calculated candidate amount display
- Additional fields:
  - Remarks (optional notes)
  - Received by name
  - Booked by name
- Updated booking flow to use new /api/medical/book-appointment endpoint
- All forms pre-filled with calculated values

### 4. PDF Generation Utility

**Location**: /lib/appointment-slip-pdf.ts
**Function**: `generateAppointmentSlipPDF(data: AppointmentSlipData)`
- Generates professional PDF appointment slip
- Sections:
  1. Header: Company name and appointment ID
  2. Candidate Information: Full details with DOB, age, passport
  3. Appointment Details: Service type, date/time, remarks
  4. Hospital & Doctor Information: Contact details, specialty
  5. Fee Breakdown: Table format with total, doctor fee, candidate amount
  6. Booking Information: Dates, staff names, reference number
  7. Footer: Security and generation timestamp

- Features:
  - Professional color scheme and formatting
  - Currency formatting (UGX)
  - Text wrapping for long content
  - Company branding support
  - A4 page layout

### 5. App Integration

**File**: /src/App.tsx
- Added "hospital-management" to View type union
- Added HospitalManagement dynamic import
- Added case in renderView switch statement
- Added "Hospital Management" to view titles
- Accessible from main navigation menu

## Data Flow: Complete Medical Appointment Booking

```
1. User accesses Medical Appointments view
   ↓
2. User fills form:
   - Candidate details (search or manual)
   - Medical service (income type)
   - Hospital (dropdown)
   - Doctor (dropdown)
   - Appointment date/time
   - Total fee amount
   - Doctor fee amount (deducted from total)
   - Additional remarks, received by, booked by names
   ↓
3. Form validation and doctor availability check
   ↓
4. POST to /api/medical/book-appointment
   ↓
5. Backend processing:
   a. Create medical_appointments record
   b. Create income transaction for candidate payment
      (totalFeeAmount - doctorFeeAmount)
   c. Create invoice for doctor/hospital as supplier
      (doctorFeeAmount)
   d. Update candidate stage to "Medical Booked"
   ↓
6. Return success with appointment details
   ↓
7. User can download appointment slip PDF
   ↓
8. Finance can view:
   - Income transaction for candidate payment
   - Invoice for doctor/hospital payment
   - Appointment details in medical appointments list
```

## Finance Integration

### Income Recording
- **Candidate Payment**: Recorded as income credit in company account
  - Amount: totalFeeAmount - doctorFeeAmount
  - Transaction type: income
  - Source: medical_appointment
  - Reference: MED-{timestamp}

### Invoice Generation
- **Doctor/Hospital Payment**: Auto-created invoice
  - Supplier: Hospital (auto-created if new)
  - Amount: doctorFeeAmount
  - Invoice type: doctor_service
  - Description: Medical service — {candidate} at {hospital}
  - Linked to appointment record

## Permissions

### Required Permissions:
- `finance.view`: View appointments and hospitals
- `finance.create`: Book appointments, create hospitals, link doctors
- `finance.edit`: Edit hospitals, affiliations, and appointments
- `doctor.view`, `doctor.manage`: Doctor-specific offline status

### User Roles with Access:
- Company Owner
- CEO
- General Manager
- Finance Manager
- Finance User (create only)

## Testing Checklist

### Hospital Management
- [ ] Create hospital with all details
- [ ] Update hospital information
- [ ] Link doctor to hospital with fee
- [ ] Set doctor primary hospital
- [ ] View all hospitals in list
- [ ] View all doctor affiliations

### Medical Appointment Booking
- [ ] Search and select candidate
- [ ] Manual candidate entry
- [ ] Select medical service
- [ ] Select hospital
- [ ] Select doctor
- [ ] Doctor availability check (online/offline)
- [ ] Enter total fee and doctor fee
- [ ] View calculated candidate amount
- [ ] Add remarks and staff names
- [ ] Book appointment successfully
- [ ] Verify income transaction created
- [ ] Verify invoice created for doctor fee

### Appointment Slip
- [ ] Download appointment slip PDF
- [ ] Verify PDF content:
  - Candidate details correct
  - Hospital information displays
  - Doctor name shows
  - Fee breakdown accurate
  - Booking details present
  - Professional formatting

### Finance Integration
- [ ] Income transaction appears in Finance → Accounts
- [ ] Candidate amount correctly deducted
- [ ] Invoice appears in Finance → Invoices
- [ ] Doctor/hospital shown as supplier
- [ ] Fee amounts match appointment record

## Database Considerations

### Migrations to Apply (in order):
1. 202610260001_hospitals_and_enhanced_medical.sql
   - Creates hospitals table
   - Creates doctor_hospital_affiliations table
   - Alters medical_appointments with new columns
   - Adds RLS policies

### Indexing:
- hospital_id on medical_appointments (performance)
- doctor_user_id on medical_appointments (performance)
- (doctor_user_id, is_primary) on affiliations (lookup primary)

## Future Enhancements

1. **SMS/Email Notifications**: Send appointment confirmation to candidate and doctor
2. **Appointment Reminders**: Auto-remind candidates/doctors before appointment
3. **Doctor Schedule Management**: Visual calendar for doctor availability
4. **Batch Appointments**: Book multiple appointments at once
5. **Appointment Status Tracking**: Track from booked → completed → follow-up
6. **Medical History**: Link past medical appointments to candidates
7. **Invoice Automation**: Auto-generate and email invoices to hospitals
8. **Payment Tracking**: Track which doctor fees have been paid

## API Error Responses

All endpoints follow standard error format:
```json
{
  "error": "Descriptive error message"
}
```

Status codes:
- 200: Success
- 201: Created
- 400: Bad request (validation error)
- 403: Forbidden (permission denied)
- 404: Not found
- 409: Conflict (duplicate entry)
- 500: Server error
- 503: Service unavailable (missing credentials)

## Files Modified/Created

### New Files:
1. supabase/migrations/202610260001_hospitals_and_enhanced_medical.sql
2. src/app/api/medical/hospitals/route.ts
3. src/app/api/medical/doctor-affiliations/route.ts
4. src/app/api/medical/book-appointment/route.ts
5. src/app/api/medical/appointment-slip/route.ts
6. src/lib/appointment-slip-pdf.ts
7. src/components/HospitalManagement.tsx

### Modified Files:
1. src/components/MedicalAppointments.tsx
2. src/App.tsx

## Deployment Checklist

- [ ] Apply database migration: 202610260001_hospitals_and_enhanced_medical.sql
- [ ] Verify Supabase service role key is set: SUPABASE_SERVICE_ROLE_KEY
- [ ] Verify mail encryption key if enabling notifications: MAIL_TOKEN_ENCRYPTION_KEY
- [ ] Test appointment booking end-to-end
- [ ] Verify Finance integration (income transactions and invoices)
- [ ] Test appointment slip PDF generation
- [ ] Configure SMSUG_API_KEY if SMS reminders needed
- [ ] Test doctor availability checking
- [ ] Monitor API performance during load testing
