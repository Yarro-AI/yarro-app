type OutcomeButtonProps = {
  icon: React.ReactNode
  label: string
  selected: boolean
  color: 'green' | 'red' | 'amber'
  onClick: () => void
}

const colorMap = {
  green: {
    active: 'border-green-500 bg-green-50 text-green-700',
    idle: 'border-gray-200 text-gray-600 hover:bg-gray-50',
  },
  red: {
    active: 'border-red-500 bg-red-50 text-red-700',
    idle: 'border-gray-200 text-gray-600 hover:bg-gray-50',
  },
  amber: {
    active: 'border-amber-500 bg-amber-50 text-amber-700',
    idle: 'border-gray-200 text-gray-600 hover:bg-gray-50',
  },
} as const

export function OutcomeButton({ icon, label, selected, color, onClick }: OutcomeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors bg-white ${
        selected ? colorMap[color].active : colorMap[color].idle
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
