'use client'

import { useState, useEffect } from 'react'

interface Thread {
  id: string
  channel_id: string
  contact_id: string | null
  status: string
  updated_at: string
}

interface Message {
  id: string
  direction: string
  type: string
  content: string | null
  created_at: string
}

export default function Inbox() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)

  // Mock workspace ID for now
  const workspaceId = 'f93a307d-4dc0-4c03-bbf5-63d0a5b48fa3'

  useEffect(() => {
    fetchThreads()
  }, [])

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id)
    }
  }, [selectedThread])

  const fetchThreads = async () => {
    try {
      const response = await fetch(`http://localhost:8084/api/threads?workspace_id=${workspaceId}`)
      const data = await response.json()
      setThreads(data.threads || [])
      if (data.threads?.length > 0 && !selectedThread) {
        setSelectedThread(data.threads[0])
      }
    } catch (error) {
      console.error('Failed to fetch threads:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (threadId: string) => {
    try {
      const response = await fetch(`http://localhost:8084/api/threads/${threadId}/messages`)
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!selectedThread || !newMessage.trim()) return

    // TODO: Implement send message API
    console.log('Sending message:', newMessage, 'to thread:', selectedThread.id)
    setNewMessage('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading inbox...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <h1 className="text-xl font-semibold text-gray-900">Ally Inbox</h1>
        <div className="ml-auto text-sm text-gray-500">
          {threads.length} threads
        </div>
      </div>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Threads List */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Conversations</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                  selectedThread?.id === thread.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      Thread {thread.id.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-gray-500">
                      {thread.status} • {new Date(thread.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {threads.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p>No conversations yet</p>
              <p className="text-sm mt-1">Send a message to your Telegram bot to get started</p>
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col">
          {selectedThread ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.direction === 'inbound' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.direction === 'inbound'
                          ? 'bg-white border border-gray-200'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          message.direction === 'inbound' ? 'text-gray-500' : 'text-blue-100'
                        }`}
                      >
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 mt-8">
                    <p>No messages in this conversation</p>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg">Select a conversation</p>
                <p className="text-sm mt-1">Choose a thread from the left to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
