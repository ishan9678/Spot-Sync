import { useState } from 'react'

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

interface IdleControlsProps {
  connectionStatus: ConnectionStatus
  onStart: () => Promise<void> | void
  onJoin: (code: string) => Promise<void> | void
}

export function IdleControls({ connectionStatus, onStart, onJoin }: IdleControlsProps) {
  const [joinCode, setJoinCode] = useState('')

  const handleJoin = () => {
    onJoin(joinCode.trim())
  }

  return (
    <div className="session-controls">
      <button
        className="primary-button start-button"
        onClick={onStart}
        disabled={connectionStatus === 'connecting'}
      >
        Start Session
      </button>

      <div className="divider">or</div>

      <div className="join-section">
        <input
          type="text"
          placeholder="Enter session code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          className="session-input"
          maxLength={6}
        />
        <button
          className="primary-button join-button"
          onClick={handleJoin}
          disabled={connectionStatus === 'connecting'}
        >
          Join Session
        </button>
      </div>
    </div>
  )
}

export default IdleControls
