'use client'

import { useState, useEffect, useRef } from 'react'

interface Thread {
  id: string
  channel_id: string
  contact_id: string | null
  status: string
  updated_at: string
  contact_name: string | null
  channel_type: string | null
}

interface Message {
  id: string
  direction: string
  type: string
  content: string | null
  created_at: string
}

// Helper function to safely extract string values from Go's sql.NullString
function getStringValue(value: any): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && value.String) {
    return value.String
  }
  return null
}

export default function Inbox() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  
  const [previousMessageCount, setPreviousMessageCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Mock workspace ID for now
  const workspaceId = 'f93a307d-4dc0-4c03-bbf5-63d0a5b48fa3'

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    // Small delay to ensure DOM is updated
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setIsAtBottom(true)
      setHasNewMessages(false)
    }, 100)
  }

  // Check if user is at bottom of messages
  const handleScroll = () => {
    if (!messagesContainerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isAtBottomNow = scrollHeight - scrollTop - clientHeight < 10 // 10px threshold
    
    setIsAtBottom(isAtBottomNow)
    
    // If user scrolls to bottom, clear new messages indicator
    if (isAtBottomNow) {
      setHasNewMessages(false)
    }
  }

  useEffect(() => {
    fetchThreads()
    
    // Simple polling instead of SSE for now
    const interval = setInterval(() => {
      fetchThreads()
      if (selectedThread) {
        fetchMessages(selectedThread.id)
      }
    }, 3000) // Poll every 3 seconds
    
    return () => {
      clearInterval(interval)
    }
  }, [selectedThread])

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id)
    }
  }, [selectedThread])

  // Smart auto-scroll logic - only when new messages arrive
  useEffect(() => {
    if (selectedThread && messages.length > 0) {
      const currentMessageCount = messages.length
      
      // If this is a new thread or first load, scroll to bottom
      if (previousMessageCount === 0) {
        scrollToBottom()
        setPreviousMessageCount(currentMessageCount)
        return
      }
      
      // Only auto-scroll if new messages arrived (count increased)
      if (currentMessageCount > previousMessageCount) {
        if (isAtBottom) {
          // User is at bottom, auto-scroll to show new message
          scrollToBottom()
        } else {
          // User is reading old messages, show new messages indicator
          setHasNewMessages(true)
        }
        
        // Update previous count AFTER handling the new message
        setPreviousMessageCount(currentMessageCount)
      }
    }
  }, [messages, selectedThread, isAtBottom, previousMessageCount])

  // Reset states when thread changes
  useEffect(() => {
    setIsAtBottom(true)
    setHasNewMessages(false)
    setPreviousMessageCount(0)
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
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getStringValue(thread.contact_name) || `Contact ${thread.id.slice(0, 8)}`}
                      </p>
                      {getStringValue(thread.channel_type) && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          getStringValue(thread.channel_type) === 'telegram' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {getStringValue(thread.channel_type) === 'telegram' 
                            ? '📱 Telegram' 
                            : getStringValue(thread.channel_type)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
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
              {/* Thread Header */}
              <div className="border-b border-gray-200 p-4 bg-white">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-medium text-sm">
                      {getStringValue(selectedThread.contact_name)?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {getStringValue(selectedThread.contact_name) || `Contact ${selectedThread.id.slice(0, 8)}`}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        getStringValue(selectedThread.channel_type) === 'telegram' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {getStringValue(selectedThread.channel_type) === 'telegram' 
                          ? '📱 Telegram' 
                          : getStringValue(selectedThread.channel_type)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        selectedThread.status === 'open' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedThread.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Messages */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 relative"
                onScroll={handleScroll}
              >
                {messages.slice().reverse().map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.direction === 'inbound' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                        message.direction === 'inbound'
                          ? 'bg-gray-100 border border-gray-200 text-gray-800'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      <p
                        className={`text-xs mt-2 ${
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
                {/* Invisible element for auto-scroll */}
                <div ref={messagesEndRef} />
              </div>
              
              {/* New messages button - outside messages container */}
              {hasNewMessages && (
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-50">
                  <button
                    onClick={scrollToBottom}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-full shadow-xl text-sm font-medium transition-colors duration-200 flex items-center space-x-2 border-2 border-white"
                  >
                    <span>New messages</span>
                    <span className="text-lg">↓</span>
                  </button>
                </div>
              )}
              

              {/* Message Input */}
              <div className="border-t border-gray-200 p-4 bg-white">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="px-6 py-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
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
