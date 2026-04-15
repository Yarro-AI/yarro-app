'use client'

import { Zap } from 'lucide-react'

interface SimulateTicketCardProps {
  onClick: () => void
}

/**
 * A ticket-shaped card that sits inline in the Needs Action column.
 * Blue, glowing, pulsing — looks like a premium action that demands clicking.
 * Triggers the maintenance simulation when clicked.
 */
export function SimulateTicketCard({ onClick }: SimulateTicketCardProps) {
  return (
    <>
      <style jsx>{`
        @keyframes sim-card-glow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(59, 130, 246, 0.2), 0 0 20px rgba(59, 130, 246, 0.08);
          }
          50% {
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.12);
          }
        }
        @keyframes sim-card-enter {
          0% {
            opacity: 0;
            transform: translateY(-12px);
            max-height: 0;
            margin-bottom: 0;
            padding-top: 0;
            padding-bottom: 0;
          }
          40% {
            opacity: 0;
            max-height: 80px;
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            max-height: 80px;
            margin-bottom: 12px;
          }
        }
      `}</style>
      <button
        onClick={onClick}
        className="w-full grid grid-cols-[auto_1fr_20px] items-center gap-3 p-4 rounded-xl border-2 border-primary/40 bg-primary cursor-pointer group transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary text-left"
        style={{
          animation: 'sim-card-glow 2s ease-in-out infinite, sim-card-enter 0.6s ease-out forwards',
        }}
      >
        {/* Icon */}
        <div className="flex items-center pr-3 border-r-2 border-white/20 self-stretch">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
        </div>
        {/* Text */}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white truncate">Simulate a Maintenance Emergency</p>
          <p className="text-sm text-white/70 truncate mt-0.5">See how Yarro dispatches automatically</p>
        </div>
        {/* Arrow */}
        <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center">
          <Zap className="w-3 h-3 text-white" />
        </div>
      </button>
    </>
  )
}
