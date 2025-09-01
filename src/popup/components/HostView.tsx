import { Users, Copy, LogOut } from 'lucide-react'

interface HostViewProps {
  sessionCode: string
  connectedPeers: number
  onCopy: () => Promise<void> | void
  onLeave: () => Promise<void> | void
  lastJoinedName?: string
}

export function HostView({ sessionCode, connectedPeers, onCopy, onLeave, lastJoinedName }: HostViewProps) {
  return (
    <div className="session-active hosting">
      <div className="session-info">
  <h3>Hosting Session</h3>
        <div className="session-code-container">
          <span className="session-code">{sessionCode}</span>
          <button
            className="copy-button"
            onClick={onCopy}
            title="Copy to clipboard"
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      <div className="peers-info" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Users size={16} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{connectedPeers} peer{connectedPeers !== 1 ? 's' : ''} connected</span>
          {lastJoinedName ? (
            <span style={{ fontSize: 12, color: '#b0b4b9' }}>
              {lastJoinedName} is connected
            </span>
          ) : null}
        </div>
      </div>

      <button
        className="danger-button leave-button"
        onClick={onLeave}
      >
        <LogOut size={16} />
        End Session
      </button>
    </div>
  )
}

export default HostView
