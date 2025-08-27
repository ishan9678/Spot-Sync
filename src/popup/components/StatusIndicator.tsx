import { Wifi, WifiOff } from 'lucide-react'

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

interface StatusIndicatorProps {
  connectionStatus: ConnectionStatus
}

export function StatusIndicator({ connectionStatus }: StatusIndicatorProps) {
  return (
    <div className="status-indicator">
      {connectionStatus === 'connected' ? (
        <Wifi className="status-icon connected" size={16} />
      ) : (
        <WifiOff className="status-icon disconnected" size={16} />
      )}
      <span className={`status-text ${connectionStatus}`}>
        {connectionStatus === 'connected'
          ? 'Connected'
          : connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'}
      </span>
    </div>
  )
}

export default StatusIndicator
