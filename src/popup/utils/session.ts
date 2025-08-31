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
	])
	return {
		sessionState: (result.sessionState as SessionState) ?? 'idle',
		sessionCode: (result.sessionCode as string) ?? '',
		connectionStatus: (result.connectionStatus as ConnectionStatus) ?? 'disconnected',
		connectedPeers: (result.connectedPeers as number) ?? 0,
	}
}

export async function saveStateSnapshot(partial: SavedState): Promise<void> {
	await chrome.storage.local.set(partial)
}

export async function getStatus(): Promise<{ connected: boolean; peerCount: number; peerId: string | null } | undefined> {
	try {
		const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })
		return status
	} catch {
		return undefined
	}
}

export async function startHostSession(): Promise<{ error?: string; sessionId?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.START })
}

export async function joinSessionRequest(sessionCode: string): Promise<{ success?: boolean; error?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.JOIN, sessionCode })
}

export async function leaveSessionRequest(): Promise<{ success?: boolean; error?: string }> {
	return chrome.runtime.sendMessage({ type: SESSION_EVENTS.LEAVE })
}
