import { Users, LogOut } from 'lucide-react'

interface JoinedViewProps {
  connectedPeers: number
  hostName?: string
  onLeave: () => Promise<void> | void
}

export function JoinedView({ connectedPeers, hostName, onLeave }: JoinedViewProps) {
  return (
    <div className="session-active joined">
      <div className="session-info">
        <h3>Session Joined</h3>
  <p>Connected to {hostName ? `${hostName}'s` : 'host'} session</p>
      </div>

      <div className="peers-info">
        <Users size={16} />
        <span>{connectedPeers} total participant{connectedPeers !== 1 ? 's' : ''}</span>
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

export default JoinedView
