"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  Maximize2,
  MessageCircle,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react"

type StaffMember = { id: string; name: string }
type ChatMessage = {
  id: string
  sender_id: string
  sender_name: string
  recipient_id: string | null
  body: string
  created_at: string
  read_by?: { id: string; name: string; read_at: string }[]
  can_delete_for_everyone: boolean
  can_delete_for_me: boolean
}

export default function StaffChat({
  companyId,
  userId,
  presentation,
  onExpand,
  onBack,
}: {
  companyId: string
  userId: string
  presentation: "launcher" | "page"
  onExpand?: () => void
  onBack?: () => void
}) {
  const isPage = presentation === "page"
  const [open, setOpen] = useState(isPage)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [peerId, setPeerId] = useState("")
  const [directMode, setDirectMode] = useState(false)
  const [message, setMessage] = useState("")
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [checkingMessages, setCheckingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState("")
  const [error, setError] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldScrollRef = useRef(true)
  const requestInFlightRef = useRef(false)
  const hasLoadedMessagesRef = useRef(false)
  const loadMessagesRef = useRef<() => Promise<void>>(async () => {})
  const conversationKey = `${companyId}:${directMode ? peerId : "group"}`
  const conversationKeyRef = useRef(conversationKey)
  conversationKeyRef.current = conversationKey

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    })
    const payload = (await response.json()) as {
      error?: string
      staff?: StaffMember[]
      messages?: ChatMessage[]
      unreadCount?: number
    }
    if (!response.ok) throw new Error(payload.error ?? "Staff chat is unavailable.")
    return payload
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const result = await request(
        `/api/staff-chat?mode=summary&companyId=${encodeURIComponent(companyId)}`,
      )
      setUnreadCount(result.unreadCount ?? 0)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load staff chat.")
    }
  }, [companyId, request])

  const loadDirectory = useCallback(async () => {
    try {
      const result = await request(
        `/api/staff-chat?mode=directory&companyId=${encodeURIComponent(companyId)}`,
      )
      setStaff(result.staff ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load staff.")
    }
  }, [companyId, request])

  const loadMessages = useCallback(async () => {
    if (directMode && !peerId) return
    if (requestInFlightRef.current || document.visibilityState === "hidden") return
    requestInFlightRef.current = true
    const requestedConversation = `${companyId}:${directMode ? peerId : "group"}`
    if (hasLoadedMessagesRef.current) setCheckingMessages(true)
    else setLoading(true)

    try {
      const peer = directMode ? `&peerId=${encodeURIComponent(peerId)}` : ""
      const result = await request(
        `/api/staff-chat?mode=messages&companyId=${encodeURIComponent(companyId)}${peer}`,
      )
      if (conversationKeyRef.current !== requestedConversation) return
      const nextMessages = result.messages ?? []
      setMessages((current) => {
        const unchanged =
          current.length === nextMessages.length &&
          current.every((item, index) => {
            const next = nextMessages[index]
            return (
              item.id === next.id &&
              item.body === next.body &&
              item.read_by?.map((reader) => `${reader.id}:${reader.read_at}`).join(",") ===
                next.read_by?.map((reader) => `${reader.id}:${reader.read_at}`).join(",")
            )
          })
        return unchanged ? current : nextMessages
      })
      setUnreadCount(result.unreadCount ?? 0)
      setError("")
    } catch (loadError) {
      if (conversationKeyRef.current === requestedConversation) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load messages.")
      }
    } finally {
      requestInFlightRef.current = false
      if (conversationKeyRef.current === requestedConversation) {
        hasLoadedMessagesRef.current = true
        setLoading(false)
        setCheckingMessages(false)
      } else {
        window.setTimeout(() => void loadMessagesRef.current(), 0)
      }
    }
  }, [companyId, directMode, peerId, request])
  loadMessagesRef.current = loadMessages

  useEffect(() => {
    if (isPage || open) void loadDirectory()
  }, [isPage, loadDirectory, open])

  useEffect(() => {
    if (isPage || open) {
      if (directMode && !peerId) {
        setMessages([])
        return
      }

      void loadMessages()
      const timer = window.setInterval(() => void loadMessages(), 5000)
      return () => window.clearInterval(timer)
    }
    void loadSummary()
    const timer = window.setInterval(() => void loadSummary(), 30000)
    return () => window.clearInterval(timer)
  }, [directMode, isPage, loadMessages, loadSummary, open, peerId])

  useEffect(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages])

  useEffect(() => {
    if (!directMode) setPeerId("")
    setMessages([])
    hasLoadedMessagesRef.current = false
    shouldScrollRef.current = true
  }, [directMode, peerId])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending || !message.trim() || (directMode && !peerId)) return

    setSending(true)
    setError("")
    try {
      await request("/api/staff-chat", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          message: message.trim(),
          recipientId: directMode ? peerId : null,
        }),
      })
      setMessage("")
      await loadMessages()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send this message.")
    } finally {
      setSending(false)
    }
  }

  const deleteMessage = async (messageId: string, scope: "everyone" | "me") => {
    if (deletingMessageId) return
    setDeletingMessageId(messageId)
    setError("")
    try {
      await request("/api/staff-chat", {
        method: "DELETE",
        body: JSON.stringify({ companyId, messageId, scope }),
      })
      setMessages((current) => current.filter((item) => item.id !== messageId))
      await loadMessages()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this message.",
      )
    } finally {
      setDeletingMessageId("")
    }
  }

  const selectedPeer = staff.find((member) => member.id === peerId)
  const chatContents = (
    <>
      {checkingMessages && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden"
          role="progressbar"
          aria-label="Checking for new messages"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--primary)]" />
        </div>
      )}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        {isPage ? (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded px-2 py-1.5 text-sm font-600" style={{ color: "var(--foreground)" }}>
            <ArrowLeft size={17} aria-hidden="true" />
            Back
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              <MessageCircle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>Staff chat</div>
              <div className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>
                {selectedPeer ? `Private · ${selectedPeer.name}` : "Company group"}
              </div>
            </div>
          </div>
        )}
        {isPage ? (
          <h1 className="min-w-0 flex-1 truncate text-right text-lg font-700" style={{ color: "var(--foreground)" }}>Staff chat</h1>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Expand staff chat" onClick={onExpand} className="rounded p-2" style={{ color: "var(--muted-foreground)" }}>
              <Maximize2 size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Close staff chat" onClick={() => setOpen(false)} className="rounded p-2" style={{ color: "var(--muted-foreground)" }}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <button type="button" onClick={() => setDirectMode(false)} aria-pressed={!directMode} className="rounded px-3 py-1.5 text-xs font-600" style={{ background: directMode ? "transparent" : "var(--primary)", color: directMode ? "var(--muted-foreground)" : "var(--primary-foreground)" }}>
          <Users size={14} className="mr-1 inline" aria-hidden="true" />
          Group
        </button>
        <button type="button" onClick={() => setDirectMode(true)} aria-pressed={directMode} className="rounded px-3 py-1.5 text-xs font-600" style={{ background: directMode ? "var(--primary)" : "transparent", color: directMode ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>
          Private message
        </button>
        {directMode && (
          <select aria-label="Choose a staff member" value={peerId} onChange={(event) => setPeerId(event.target.value)} className="ml-auto min-w-0 max-w-[55%] rounded border px-2 py-1 text-xs" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option value="">Choose staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        role="log"
        aria-live="polite"
        aria-label={directMode ? "Private staff messages" : "Staff group messages"}
        onScroll={(event) => {
          const element = event.currentTarget
          shouldScrollRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
      >
        {directMode && !peerId ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Choose a staff member to start a private conversation.</p>
        ) : loading && messages.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No messages yet. Start the conversation.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((item) => {
              const ownMessage = item.sender_id === userId
              return (
                <div key={item.id} className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[88%] rounded-2xl px-3 py-2" style={{ background: ownMessage ? "var(--primary)" : "var(--secondary)", color: ownMessage ? "var(--primary-foreground)" : "var(--foreground)" }}>
                    {!ownMessage && <div className="mb-1 text-[11px] font-700 opacity-80">{item.sender_name}</div>}
                    <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
                    <time className="mt-1 block text-right text-[10px] opacity-70" dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </time>
                    {ownMessage && item.recipient_id && (
                      <div className="mt-1 text-right text-[10px] opacity-80">
                        {item.read_by?.length
                          ? `Read ${new Date(item.read_by[0].read_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                          : "Sent"}
                      </div>
                    )}
                    {ownMessage && !item.recipient_id && (
                      <details className="mt-1 text-right text-[10px] opacity-80">
                        <summary className="cursor-pointer list-none">
                          {item.read_by?.length
                            ? `Seen by ${item.read_by.length}`
                            : "Not seen yet"}
                        </summary>
                        {Boolean(item.read_by?.length) && (
                          <div className="mt-1 space-y-0.5">
                            {item.read_by?.map((reader) => (
                              <div key={reader.id}>
                                {reader.name} · {new Date(reader.read_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </div>
                            ))}
                          </div>
                        )}
                      </details>
                    )}
                    {(item.can_delete_for_everyone || item.can_delete_for_me) && (
                      <button
                        type="button"
                        disabled={deletingMessageId === item.id}
                        onClick={() =>
                          void deleteMessage(
                            item.id,
                            item.can_delete_for_everyone ? "everyone" : "me",
                          )
                        }
                        className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-75 hover:opacity-100 disabled:opacity-40"
                        aria-label={
                          item.can_delete_for_everyone
                            ? "Delete message for everyone"
                            : "Delete message for me"
                        }
                      >
                        <Trash2 size={11} aria-hidden="true" />
                        {item.can_delete_for_everyone ? "Delete" : "Delete for me"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && <p role="alert" className="border-t px-3 py-2 text-xs text-red-500" style={{ borderColor: "var(--border)" }}>{error}</p>}

      <form onSubmit={(event) => void sendMessage(event)} className="flex shrink-0 items-end gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          maxLength={4000}
          rows={1}
          placeholder={directMode ? "Write a private message…" : "Message the staff group…"}
          aria-label="Write a message"
          className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
        <button type="submit" disabled={sending || !message.trim() || (directMode && !peerId)} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
          <Send size={17} aria-hidden="true" />
        </button>
      </form>
    </>
  )

  if (isPage) {
    return <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden" style={{ background: "var(--background)" }}>{chatContents}</section>
  }

  return (
    <>
      {open ? (
        <section
          aria-label="Staff chat"
          className="fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col overflow-hidden border shadow-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(38rem,calc(100dvh-8rem))] sm:w-[min(24rem,calc(100vw-2.5rem))] sm:rounded-2xl"
          style={{ background: "var(--card)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {chatContents}
        </section>
      ) : (
        <button
          type="button"
          aria-label={`Open staff chat${unreadCount ? `, ${unreadCount} unread messages` : ""}`}
          onClick={() => setOpen(true)}
          className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-xl"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <MessageCircle size={23} aria-hidden="true" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-700 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
      )}
    </>
  )
}
