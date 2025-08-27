import { Users, Copy, LogOut } from 'lucide-react'

interface HostViewProps {
  sessionCode: string
  connectedPeers: number
  onCopy: () => Promise<void> | void
  onLeave: () => Promise<void> | void
}

export function HostView({ sessionCode, connectedPeers, onCopy, onLeave }: HostViewProps) {
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

      <div className="peers-info">
        <Users size={16} />
        <span>{connectedPeers} peer{connectedPeers !== 1 ? 's' : ''} connected</span>
      </div>

      <button
        className="danger-button leave-button"
        onClick={onLeave}
      >
        <LogOut size={16} />
        Leave Session
      </button>
    </div>
  )
}

export default HostView
