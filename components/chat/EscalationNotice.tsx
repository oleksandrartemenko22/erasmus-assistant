// components/chat/EscalationNotice.tsx
export function EscalationNotice() {
  return (
    <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <strong>Need more help?</strong> For questions about specific individual circumstances, visa
      requirements, or matters not covered here, please contact the{' '}
      <a
        href="mailto:international@um.si"
        className="underline font-medium hover:text-amber-900"
      >
        International Relations Office
      </a>{' '}
      directly.
    </div>
  )
}
