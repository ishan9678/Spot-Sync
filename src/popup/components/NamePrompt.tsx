import { useState } from 'react'

interface Props {
  onSubmit: (name: string) => void | Promise<void>
}

export default function NamePrompt({ onSubmit }: Props) {
  const [name, setName] = useState('')

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 360,
          maxWidth: '92vw',
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 12,
          padding: 18,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 10 }}>Welcome</h3>
        <p style={{ marginTop: 0, color: '#b0b4b9', fontSize: 13, lineHeight: 1.5 }}>
          What should we call you?
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Your name"
          aria-label="Your name"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #3a3a3a',
            background: '#0f0f0f',
            color: '#eaeaea',
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
          <button
            onClick={() => onSubmit(name.trim())}
            disabled={!name.trim()}
            style={{
              padding: '9px 14px',
              background: name.trim() ? '#1db954' : '#1a1a1a',
              color: name.trim() ? '#000' : '#777',
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              fontWeight: 700,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
