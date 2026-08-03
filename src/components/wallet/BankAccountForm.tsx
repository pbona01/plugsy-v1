import { useState, useEffect, useRef } from "react"
import { useAuth } from "@clerk/clerk-react"
import { getStableIdempotencyKey } from "../../utils/idempotency"
import { CheckCircle2, ChevronDown, ChevronUp, Search, Loader2 } from "lucide-react"

interface Bank {
  name: string
  code: string
}

interface BankAccountFormProps {
  userId: string
  userEmail: string
  currentBank?: {
    bank_code: string
    bank_name: string
    account_number: string
    account_name: string
  } | null
  onSaved: () => void
}

export default function BankAccountForm({
  userId,
  userEmail,
  currentBank,
  onSaved
}: BankAccountFormProps) {
  const { getToken } = useAuth()
  const [banks, setBanks] = useState<Bank[]>([])
  const [loadingBanks, setLoadingBanks] = useState(true)
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)
  const [accountNumber, setAccountNumber] = useState("")
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(!currentBank)
  const resolveSequenceRef = useRef(0)
  const resolveAbortRef = useRef<AbortController | null>(null)

  const clearResolution = () => {
    resolveSequenceRef.current += 1
    resolveAbortRef.current?.abort()
    resolveAbortRef.current = null
    setResolvedName(null)
    setResolveError(null)
    setResolving(false)
  }

  const restoreCurrentBank = () => {
    if (!currentBank) return
    const savedBank = banks.find((bank) => bank.code === currentBank.bank_code)
    setSelectedBank(savedBank || {
      code: currentBank.bank_code,
      name: currentBank.bank_name,
    })
    setAccountNumber(currentBank.account_number)
    clearResolution()
  }

  // Fetch bank list once, cache in sessionStorage
  useEffect(() => {
    const cached = sessionStorage.getItem("plugsy_banks")
    if (cached) {
      setBanks(JSON.parse(cached))
      setLoadingBanks(false)
      return
    }

    getToken().then(token => fetch("/api/wallet?action=list-banks", {
      headers: { Authorization: `Bearer ${token}` },
    }))
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBanks(data.banks)
          sessionStorage.setItem(
            "plugsy_banks",
            JSON.stringify(data.banks)
          )
        }
        setLoadingBanks(false)
      })
      .catch(() => setLoadingBanks(false))
  }, [])

  useEffect(() => {
    if (!currentBank) return
    const savedBank = banks.find((bank) => bank.code === currentBank.bank_code)
    setSelectedBank(savedBank || {
      code: currentBank.bank_code,
      name: currentBank.bank_name,
    })
    setAccountNumber(currentBank.account_number)
  }, [
    banks,
    currentBank?.bank_code,
    currentBank?.bank_name,
    currentBank?.account_number,
  ])

  // Auto-resolve account when both bank + 10-digit number present
  useEffect(() => {
    clearResolution()

    if (!editing || !selectedBank || accountNumber.length !== 10) return

    const sequence = resolveSequenceRef.current
    const timer = setTimeout(async () => {
      if (sequence !== resolveSequenceRef.current) return
      setResolving(true)
      const controller = new AbortController()
      resolveAbortRef.current = controller
      try {
        const token = await getToken()
        const res = await fetch("/api/wallet?action=resolve-account", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            accountNumber,
            bankCode: selectedBank.code
          }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (sequence !== resolveSequenceRef.current) return
        if (data.success) {
          setResolvedName(data.accountName)
        } else {
          setResolveError(data.error || "Could not verify account")
        }
      } catch (e) {
        if (controller.signal.aborted || sequence !== resolveSequenceRef.current) return
        setResolveError("Network error verifying account")
      } finally {
        if (sequence === resolveSequenceRef.current) {
          setResolving(false)
          resolveAbortRef.current = null
        }
      }
    }, 500)

    return () => {
      clearTimeout(timer)
      if (resolveAbortRef.current === null || sequence === resolveSequenceRef.current) {
        resolveAbortRef.current?.abort()
        resolveAbortRef.current = null
      }
    }
  }, [selectedBank, accountNumber, editing])

  const filteredBanks = banks.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!selectedBank || !resolvedName || accountNumber.length !== 10) return

    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/wallet?action=save-bank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": getStableIdempotencyKey("bank-account"),
        },
          body: JSON.stringify({
            accountNumber,
            bankCode: selectedBank.code,
            bankName: selectedBank.name,
          })
      })
      const data = await res.json()
      if (data.success) {
        setEditing(false)
        onSaved()
      } else {
        setResolveError(data.error || "Failed to save")
      }
    } catch (e) {
      setResolveError("Network error saving bank details")
    } finally {
      setSaving(false)
    }
  }

  // SAVED STATE - show masked account, allow deliberate edit
  if (currentBank && !editing) {
    const masked = `••••${currentBank.account_number.slice(-4)}`

    return (
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-brand-text-secondary/80 mb-2.5">
          WITHDRAWAL ACCOUNT
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-text-primary text-sm font-semibold mb-0.5">
              {currentBank.account_name}
            </p>
            <p className="text-brand-text-secondary text-xs m-0">
              {currentBank.bank_name} · {masked}
            </p>
          </div>
          <button
            type="button"
            aria-label="Edit bank account"
            onClick={() => {
              restoreCurrentBank()
              setEditing(true)
            }}
            className="bg-brand-background/50 border border-brand-border rounded-lg text-brand-text-secondary px-3.5 py-2 text-xs font-semibold cursor-pointer hover:bg-brand-background/80 hover:text-brand-text-primary transition-colors"
          >
            Edit Bank
          </button>
        </div>
      </div>
    )
  }

  // EDITING STATE - bank dropdown + account number input
  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl p-4">
      <p className="text-[10px] font-bold tracking-widest uppercase text-brand-text-secondary/80 mb-3">
        {currentBank ? "Edit Bank Account" : "Add Bank Account"}
      </p>
      {currentBank && (
        <div className="mb-3 rounded-xl border border-brand-border bg-brand-background/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-text-secondary">
            Current verified account
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-text-primary">
            {currentBank.account_name}
          </p>
        </div>
      )}
      {currentBank && (
        <p className="mb-3 text-[11px] leading-relaxed text-brand-text-secondary">
          Changing your bank affects future withdrawals only. Existing withdrawal records will not be changed.
        </p>
      )}

      {/* Bank selector */}
      <div className="relative mb-3">
        <label className="text-brand-text-secondary text-[11px] font-semibold tracking-wide uppercase block mb-1.5">
          BANK
        </label>
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className={`w-full bg-brand-background border border-brand-border rounded-xl px-3.5 py-3 text-sm text-left cursor-pointer flex justify-between items-center transition-colors ${selectedBank ? 'text-brand-text-primary' : 'text-brand-text-secondary/50'} hover:border-brand-accent/50`}
        >
          <span>{selectedBank ? selectedBank.name : "Select your bank"}</span>
          <span className="text-brand-text-secondary/50 flex">
            {showDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {showDropdown && (
          <div className="absolute top-[100%] left-0 right-0 mt-1.5 bg-brand-surface border border-brand-border rounded-xl max-h-[280px] overflow-y-auto z-50 shadow-xl">
            <div className="p-2.5 border-b border-brand-border sticky top-0 bg-brand-surface z-10">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary/50" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search bank..."
                  className="w-full bg-brand-background border border-brand-border rounded-lg text-brand-text-primary pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-accent/50 transition-colors"
                />
              </div>
            </div>

            {loadingBanks ? (
              <div className="p-4 text-center text-brand-text-secondary text-xs flex justify-center items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading banks...
              </div>
            ) : filteredBanks.length === 0 ? (
              <div className="p-4 text-center text-brand-text-secondary text-xs">
                No banks found
              </div>
            ) : (
              <div className="p-1">
                {filteredBanks.map((bank, index) => (
                  <button
                    key={`${bank.code}-${index}`}
                    onClick={() => {
                      clearResolution()
                      setSelectedBank(bank)
                      setShowDropdown(false)
                      setSearch("")
                    }}
                    className={`w-full border-none px-3.5 py-2.5 text-sm text-left cursor-pointer block rounded-lg transition-colors ${
                      selectedBank?.code === bank.code
                        ? "bg-brand-accent/10 text-brand-text-primary"
                        : "bg-transparent text-brand-text-secondary hover:bg-brand-background hover:text-brand-text-primary"
                    }`}
                  >
                    {bank.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account number */}
      <div className="mb-3">
        <label className="text-brand-text-secondary text-[11px] font-semibold tracking-wide uppercase block mb-1.5">
          ACCOUNT NUMBER
        </label>
        <input
          value={accountNumber}
          onChange={e => {
            clearResolution()
            setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
          }}
          placeholder="0123456789"
          inputMode="numeric"
          maxLength={10}
          className="w-full bg-brand-background border border-brand-border rounded-xl px-3.5 py-3 text-brand-text-primary text-sm outline-none tracking-widest focus:border-brand-accent transition-colors"
        />
      </div>

      {/* Resolved account name preview */}
      {resolving && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-background/50 rounded-xl mb-3 border border-brand-border">
          <Loader2 size={14} className="animate-spin text-brand-accent" />
          <span className="text-brand-text-secondary text-xs">
            Verifying account...
          </span>
        </div>
      )}

      {resolvedName && !resolving && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl mb-3">
          <CheckCircle2 size={14} className="text-green-500" />
          <p className="text-green-500 text-sm font-semibold m-0">
            {resolvedName}
          </p>
        </div>
      )}

      {resolveError && !resolving && (
        <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl mb-3">
          <p className="text-red-500 text-sm m-0">
            {resolveError}
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!resolvedName || resolving || saving}
          className={`flex-1 border-none rounded-xl py-3 text-sm font-bold transition-colors ${
            resolvedName && !saving
              ? "bg-brand-accent text-white cursor-pointer hover:bg-opacity-90"
              : "bg-brand-background border border-brand-border text-brand-text-secondary/50 cursor-not-allowed"
          }`}
        >
          {saving
            ? "Saving..."
            : currentBank
              ? "Verify & Update"
              : "Save Account"}
        </button>

        {currentBank && (
          <button
            type="button"
            onClick={() => {
              restoreCurrentBank()
              setEditing(false)
            }}
            className="bg-transparent border border-brand-border rounded-xl text-brand-text-secondary px-4 py-3 text-sm cursor-pointer hover:bg-brand-background transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
