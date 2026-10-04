Design and add a complete **Recruitment ERP feature expansion** to the existing system. Keep the current branding, colors, typography, navigation style, spacing, and component system consistent with the existing ERP design. The new features should feel fully integrated rather than like separate modules.

## 1. Recruitment & Candidate Management

Enhance the **Candidates** section with a professional candidate management experience.

The candidate table should include:

* Candidate photo
* Candidate ID
* Full name
* Contact information
* Recruitment status
* Assigned agent
* Destination/company
* Payment status
* Document status
* Passport custody status
* Date added
* Last updated

### Candidate Attachments Drawer

At the **very beginning of every candidate row**, place a small attachment/document icon.

When clicked, the icon must open a **side drawer from the opposite side of the screen**.

The drawer must show attachments belonging specifically to that candidate.

Include:

* Candidate name and ID
* Candidate profile photo
* Total number of attachments
* Document categories
* File name
* File type
* Upload date
* Uploaded by
* Document status
* Preview button
* Download button
* Rename button
* Delete button

Add a highly visible:

**+ Add Attachment**

button.

Users with the correct permissions should be able to:

* Upload files
* Rename files
* Replace files
* Preview files
* Download files
* Delete files
* Add notes/descriptions

Include confirmation dialogs before deleting attachments.

Suggested attachment categories:

* Passport
* CV
* Medical
* ID
* Certificates
* Contracts
* Visa
* Payment Receipts
* Photos
* Other

---

## 2. Candidate Profile & Edit Function

Add a prominent **Edit Candidate** button to the candidate profile.

Allow authorized users to edit:

* Personal information
* Bio
* Contact details
* Address
* Education
* Employment history
* Skills
* Languages
* Certifications
* Candidate status
* Assigned agent
* Passport information
* Recruitment information
* Notes

Use a structured form with sections/tabs.

Include:

**Save Changes**
**Cancel**
**Unsaved Changes Warning**

Add an activity history showing who changed candidate information and when.

---

# 3. Finance Module

Create a dedicated **Finance** module for the recruitment company.

The finance dashboard should track:

### Income

* Candidate deposits
* Candidate payments
* Recruitment fees
* Placement fees
* Client/company payments
* Other income

### Expenses

* Recruitment expenses
* Medical expenses
* Transport
* Visa expenses
* Documentation expenses
* Passport-related expenses
* Staff expenses
* Office expenses
* Other operational expenses

### Paychecks / Payroll

Add a section for tracking employee/staff paychecks.

Track:

* Employee
* Salary/paycheck amount
* Payment date
* Payment status
* Payment method
* Reference number
* Notes
* Attached payslip

Statuses:

* Paid
* Pending
* Processing
* Failed

---

# 4. Candidate Deposits & Payment Tracking

Within each candidate profile, add a **Financial Overview**.

Display:

**Total Required**
**Total Deposited**
**Total Paid**
**Outstanding Balance**

Add a payment history table with:

* Date
* Amount
* Payment type
* Payment method
* Reference
* Recorded by
* Receipt
* Status

Allow authorized users to add new payments/deposits.

Payment statuses:

* Deposit Received
* Partially Paid
* Fully Paid
* Payment Pending
* Overdue

Automatically calculate the outstanding balance.

---

# 5. Finance Analytics & Company Growth

Create a management-level **Financial Analytics** dashboard.

Display KPI cards for:

* Total Income
* Total Expenses
* Net Profit
* Outstanding Payments
* Candidate Deposits
* Monthly Revenue
* Monthly Expenses
* Profit Margin
* Company Growth %

Create visual charts for:

* Revenue over time
* Expenses over time
* Profit over time
* Income vs expenses
* Candidate deposits
* Outstanding payments
* Monthly placements
* Revenue per candidate
* Cost per candidate
* Profit per placement
* Year-over-year growth

Allow filtering by:

* Today
* This week
* This month
* This year
* Custom date range
* Recruitment agent
* Candidate
* Client/company

---

# 6. AI Recruitment Module

Add a dedicated **AI Assistant** module.

The AI should automate repetitive recruitment documentation.

Inside the candidate profile, add prominent one-click actions:

### Generate CV

A button:

**✨ Generate CV with AI**

The AI should use the candidate's existing information to create a professional CV.

The generated CV should include relevant:

* Personal information
* Professional summary
* Employment history
* Education
* Skills
* Certifications
* Languages
* References

Allow the user to:

* Preview
* Edit
* Regenerate
* Save
* Attach to candidate
* Export

### Generate Medical Document

Add:

**✨ Generate Medical**

Use the candidate's stored information to automatically populate the company's medical-document template.

Include a review/approval step before finalizing the document.

Make AI actions fast and accessible directly from the candidate profile.

---

# 7. Passport Storage & Custody Tracker

Create a dedicated **Passport Custody Tracker**.

The purpose is to clearly track whether a candidate's passport is currently in the company's custody.

Each candidate should have a passport status:

* Candidate Has Passport
* **In Company Custody**
* Returned to Candidate
* With External Authority
* Expired
* Issue/Problem

When a passport is held by the company, display a clear status:

**🔐 PASSPORT IN COMPANY CUSTODY**

Track:

* Candidate
* Passport number
* Passport expiry date
* Date received
* Time received
* Received by
* **Assigned Agent**
* Current storage/location reference
* Date returned
* Returned by
* Return confirmation
* Notes

### Assigned Agent

Every passport custody record must have an **Assigned Agent** field.

Allow administrators or authorized users to:

* Assign an agent
* Change the assigned agent
* Filter passports by agent
* View all passports assigned to a particular agent

Create an agent-based dashboard showing:

**Agent → Candidates → Passports in Custody → Date Received → Current Status**

Add filters for:

* Agent
* Candidate
* Passport status
* Date received
* Expiry date
* Storage location

---

# 8. User Management & Permissions

Create a **Users & Roles** administration module.

The system must have a **Primary User / Super Administrator**.

The Primary User can:

* Create new users
* Edit users
* Deactivate users
* Assign roles
* Create custom roles
* Control module access
* Control editing permissions
* Control financial access
* Control document access

Create permission levels such as:

**View | Create | Edit | Delete | Approve | Export**

Allow permissions to be assigned individually for:

* Candidates
* Candidate profiles
* Attachments
* Finance
* Income
* Expenses
* Payments
* Paychecks
* Passport custody
* AI tools
* Reports
* Users
* Settings

Example roles:

* Primary Administrator
* Recruitment Manager
* Recruitment Agent
* Finance Manager
* Finance Officer
* Document Officer
* Medical Officer
* Viewer

The administrator should also be able to create completely **custom roles**.

---

# 9. Recruitment Agent Management

Add an **Agents** section.

For each agent display:

* Agent name
* Profile photo
* Contact information
* Number of assigned candidates
* Number of placements
* Candidates currently processing
* Passports in custody
* Payments collected
* Revenue generated
* Performance percentage

Add an agent performance dashboard with analytics.

---

# 10. Reports & Management Analytics

Create a comprehensive **Reports & Analytics** section.

Management should be able to see:

* Total candidates
* Candidates by recruitment stage
* Successful placements
* Revenue
* Expenses
* Profit
* Outstanding payments
* Deposits
* Staff/paycheck expenses
* Passport custody statistics
* Agent performance
* Revenue per agent
* Cost per placement
* Profit per placement
* Company growth

Allow reports to be filtered and exported.

---

# 11. Main Navigation

Update the ERP navigation to include:

**Dashboard**
**Candidates**
**Recruitment Pipeline**
**Agents**
**Finance**
**Payments & Deposits**
**Paychecks**
**Passport Custody**
**Documents**
**AI Assistant**
**Reports & Analytics**
**Users & Roles**
**Settings**

---

# 12. Important UX Requirements

Make the entire system feel like a modern enterprise SaaS ERP.

Use:

* Reusable components
* Data tables
* Search
* Advanced filters
* Side drawers
* Modals
* Dropdowns
* Tabs
* Status badges
* KPI cards
* Charts
* Notifications
* Empty states
* Loading states
* Error states
* Confirmation dialogs
* Permission-denied states
* Responsive layouts

Prioritize fast workflows and minimize unnecessary clicks.

Use clear visual hierarchy so users can immediately understand:

**Candidate → Documents → Passport → Agent → Payments → Recruitment Status → Financial Result**

---

# 13. End-to-End Candidate Workflow

Design the complete workflow:

**Candidate Created**
↓
**Candidate Information Added**
↓
**Agent Assigned**
↓
**Documents Uploaded**
↓
**Passport Custody Status Recorded**
↓
**Medical Generated with AI**
↓
**CV Generated with AI**
↓
**Candidate Deposit Recorded**
↓
**Recruitment Process**
↓
**Placement**
↓
**Remaining Payment Collected**
↓
**Expenses Recorded**
↓
**Revenue & Profit Calculated**
↓
**Management Analytics**

The final recruitment management system should combine candidate management, document management, AI automation, agent management, passport custody tracking, finance, payments, payroll/paychecks, permissions, and company growth analytics into one unified platform.
