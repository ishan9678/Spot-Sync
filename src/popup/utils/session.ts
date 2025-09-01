import type { SessionState, ConnectionStatus, SavedState } from '@/types'
import { SESSION_EVENTS } from '@/constants'

export function isValidSessionCode(code: string): boolean {
	return /^\d{6}$/.test(code)
}

export async function getSavedState(): Promise<Required<SavedState>> {
	const result = await chrome.storage.local.get([
		'sessionState',
		'sessionCode',
		'connectionStatus',
		'connectedPeers',
		'lastJoinedName',
	])
	return {
		sessionState: (result.sessionState as SessionState) ?? 'idle',
		sessionCode: (result.sessionCode as string) ?? '',
		connectionStatus: (result.connectionStatus as ConnectionStatus) ?? 'disconnected',
		connectedPeers: (result.connectedPeers as number) ?? 0,
		lastJoinedName: (result.lastJoinedName as string) ?? '',
	}
}

export async function getStatus(): Promise<{ 
  connected: boolean; 
  peerCount: number; 
  peerId: string | null; 
  sessionCode: string;
  sessionState: SessionState;
} | undefined> {
	try {
		const status = await chrome.runtime.sendMessage({ type: SESSION_EVENTS.STATUS })
		return status
	} catch {
		return undefined
	}
}

export async function startHostSession(): Promise<{ error?: string; sessionCode?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.START })
}

export async function joinSessionRequest(sessionCode: string): Promise<{ success?: boolean; error?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.JOIN, sessionCode })
}

export async function leaveSessionRequest(): Promise<{ success?: boolean; error?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.LEAVE })
}

export async function endSessionRequest(): Promise<{ success?: boolean; error?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.END })
}

export async function setDisplayName(name: string): Promise<void> {
	await chrome.runtime.sendMessage({ type: 'SET_NAME', name })
}

export async function getDisplayName(): Promise<string> {
	const res = await chrome.storage.local.get(['displayName'])
	return (res.displayName as string) || ''
}