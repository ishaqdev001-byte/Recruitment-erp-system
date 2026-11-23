export type ApprovalWorkflowKey = "expense_request" | "linked_requisition" | "standalone_requisition" | "leave"

export type ApprovalWorkflowAction = "approval" | "line_manager_review" | "initiate_requisition" | "verify" | "authorize" | "cashout"

export type ApprovalWorkflowStage = {
  stageKey: string

  label: string

  actionType: ApprovalWorkflowAction

  permissionCode: string

  roleIds: string[]

  instructions: string
}

export type ApprovalWorkflowHistoryEntry = {
  stageKey: string

  label: string

  actionType: ApprovalWorkflowAction

  decision: "approved" | "rejected" | "completed"

  note: string

  createdAt: string
}

export type ApprovalWorkflowState = {
  subjectId: string

  workflowKey: ApprovalWorkflowKey

  runStatus: "pending" | "completed" | "rejected"

  currentStage: ApprovalWorkflowStage | null

  canAct: boolean

  history: ApprovalWorkflowHistoryEntry[]
}
