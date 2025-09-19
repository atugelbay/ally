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
  const [newMessageThreads, setNewMessageThreads] = useState<Set<string>>(new Set())
  const [threadMessageCounts, setThreadMessageCounts] = useState<Record<string, number>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [lastReadMessageId, setLastReadMessageId] = useState<Record<string, string>>({})
  
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
      
      // Clear new message indicator for this thread when switching to it
      setNewMessageThreads(prev => {
        const newSet = new Set(prev)
        newSet.delete(selectedThread.id)
        return newSet
      })
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
      
      // Handle message count changes
      if (currentMessageCount !== previousMessageCount) {
        if (currentMessageCount > previousMessageCount) {
          // New messages arrived
          
          
          if (isAtBottom) {
            // User is at bottom, auto-scroll to show new message
            
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
              setIsAtBottom(true)
              setHasNewMessages(false)
            }, 50)
          } else {
            // User is reading old messages, show new messages indicator
            setHasNewMessages(true)
          }
        } else if (currentMessageCount < previousMessageCount) {
          // Thread changed (fewer messages), reset and scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            setIsAtBottom(true)
            setHasNewMessages(false)
          }, 50)
        }
        
        // Update previous count AFTER handling the change
        setPreviousMessageCount(currentMessageCount)
      }
    }
  }, [messages, selectedThread, isAtBottom, previousMessageCount])

  // Reset states when thread changes
  useEffect(() => {
    setIsAtBottom(true)
    setHasNewMessages(false)
    setPreviousMessageCount(0)
    
    // Force scroll to bottom when switching threads
    if (selectedThread) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [selectedThread])

  const fetchThreads = async () => {
    try {
      const response = await fetch(`http://localhost:8084/api/threads?workspace_id=${workspaceId}`)
      const data = await response.json()
      const newThreads = data.threads || []
      
      // Check for new messages in other threads
      if (selectedThread) {
        newThreads.forEach(async (thread: Thread) => {
          if (thread.id !== selectedThread.id) {
            try {
              const messagesResponse = await fetch(`http://localhost:8084/api/threads/${thread.id}/messages`)
              const messagesData = await messagesResponse.json()
              const threadMessages = messagesData.messages || []
              const currentCount = threadMessages.length
              const previousCount = threadMessageCounts[thread.id] || 0
              
              // If message count increased, mark as new
              if (currentCount > previousCount && previousCount > 0) {
                setNewMessageThreads(prev => new Set([...prev, thread.id]))
              }
              
              // Update the count for this thread
              setThreadMessageCounts(prev => ({
                ...prev,
                [thread.id]: currentCount
              }))
            } catch (error) {
              console.error(`Failed to check messages for thread ${thread.id}:`, error)
            }
          }
        })
      }
      
      setThreads(newThreads)
      
      // Initialize message counts for all threads on first load
      if (Object.keys(threadMessageCounts).length === 0) {
        const initialCounts: Record<string, number> = {}
        newThreads.forEach(async (thread: Thread) => {
          try {
            const messagesResponse = await fetch(`http://localhost:8084/api/threads/${thread.id}/messages`)
            const messagesData = await messagesResponse.json()
            const threadMessages = messagesData.messages || []
            initialCounts[thread.id] = threadMessages.length
          } catch (error) {
            console.error(`Failed to initialize count for thread ${thread.id}:`, error)
            initialCounts[thread.id] = 0
          }
        })
        setThreadMessageCounts(initialCounts)
      }
      
      if (newThreads.length > 0 && !selectedThread) {
        setSelectedThread(newThreads[0])
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

    try {
      const response = await fetch(`http://localhost:8084/api/threads/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newMessage.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to send message')
      }

      const result = await response.json()
      
      // Clear input
      setNewMessage('')
      
      // Refresh messages to show the sent message
      await fetchMessages(selectedThread.id)
      
      // Auto-scroll to bottom after sending message
      // Force scroll to bottom when sending a message
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        setIsAtBottom(true)
        setHasNewMessages(false)
      }, 100)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading inbox...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{
      background: 'radial-gradient(1200px 600px at 80% -100px, rgba(79,70,229,0.08), transparent 60%), radial-gradient(1000px 500px at -200px 80%, rgba(79,70,229,0.06), transparent 60%), #f7f8fb'
    }}>
      <div className="grid grid-cols-[320px_1fr] gap-4 h-screen p-5">
        {/* Sidebar */}
        <aside className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-[0_10px_30px_rgba(17,24,39,0.08)] flex flex-col overflow-hidden border border-white/20">
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="flex items-center gap-2.5 font-bold text-lg text-gray-800">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4f46e5] shadow-[0_0_0_6px_#eef2ff]"></span>
              Ally Inbox
            </div>
            <div className="mt-3 relative">
              <span className="absolute top-1/2 left-2.5 transform -translate-y-1/2 text-sm text-[#8a93a3]">🔎</span>
              <input 
                type="text" 
                placeholder="Search conversations" 
                className="w-full pl-9 pr-3 py-2.5 border border-white/30 rounded-[10px] outline-none bg-white/40 backdrop-blur-sm focus:border-[#4f46e5] focus:shadow-[0_0_0_4px_#eef2ff] transition-all duration-200"
              />
            </div>
          </div>
          <div className="p-2 px-4 flex gap-2 flex-wrap">
            <div className="px-2.5 py-1.5 rounded-full bg-white/30 backdrop-blur-sm text-[#4f46e5] text-xs font-semibold cursor-pointer">All</div>
            <div className="px-2.5 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-gray-600 text-xs cursor-pointer hover:bg-white/30 transition-colors">Open</div>
            <div className="px-2.5 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-gray-600 text-xs cursor-pointer hover:bg-white/30 transition-colors">Closed</div>
            <div className="px-2.5 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-gray-600 text-xs cursor-pointer hover:bg-white/30 transition-colors">Telegram</div>
          </div>
          <div className="overflow-y-auto p-2">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`grid grid-cols-[40px_1fr_auto] gap-3 items-center p-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                  selectedThread?.id === thread.id 
                    ? 'bg-white/40 backdrop-blur-md border-r-4 border-blue-500 shadow-lg' 
                    : newMessageThreads.has(thread.id)
                    ? 'bg-green-400/20 border-r-2 border-green-400 shadow-md animate-pulse backdrop-blur-sm'
                    : 'hover:bg-white/20'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm tracking-wide">
                  {getStringValue(thread.contact_name)?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-sm text-gray-800 truncate">
                      {getStringValue(thread.contact_name) || `Contact ${thread.id.slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-gray-500 flex-shrink-0">
                      {new Date(thread.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 truncate mt-0.5">
                    {thread.status} • {getStringValue(thread.channel_type) === 'telegram' ? '📱 Telegram' : getStringValue(thread.channel_type)}
                  </div>
                </div>
                {(unreadCounts[thread.id] || 0) > 0 && (
                  <span className="bg-[#4f46e5] text-white text-xs px-1.5 py-0.5 rounded-full">
                    {(unreadCounts[thread.id] || 0) > 99 ? '99+' : (unreadCounts[thread.id] || 0)}
                  </span>
                )}
                {newMessageThreads.has(thread.id) && (
                  <span className="bg-[#eab308] text-white text-xs px-1.5 py-0.5 rounded-full">
                    !
                  </span>
                )}
              </div>
            ))}
          </div>
          {threads.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p>No conversations yet</p>
              <p className="text-sm mt-1">Send a message to your Telegram bot to get started</p>
            </div>
          )}
        </aside>

        {/* Chat Area */}
        <section className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-[0_10px_30px_rgba(17,24,39,0.08)] grid grid-rows-[auto_1fr_auto] overflow-hidden border border-white/20">
          {selectedThread ? (
            <>
              {/* Chat Header */}
              <header className="flex items-center justify-between p-3.5 px-4 border-b border-white/20 bg-white/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-lg">
                    {getStringValue(selectedThread.contact_name)?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-semibold text-base text-gray-800">
                      {getStringValue(selectedThread.contact_name) || `Contact ${selectedThread.id.slice(0, 8)}`}
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs px-2 py-1 rounded-full bg-white/30 backdrop-blur-sm text-gray-700">
                        {getStringValue(selectedThread.channel_type) === 'telegram' ? '📱 Telegram' : getStringValue(selectedThread.channel_type)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        selectedThread.status === 'open' 
                          ? 'bg-green-100/80 text-green-800 border border-green-200/50' 
                          : 'bg-white/30 backdrop-blur-sm text-gray-700'
                      }`}>
                        ● {selectedThread.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-2.5 py-1.5 rounded-full bg-white/30 backdrop-blur-sm text-gray-600 text-xs cursor-pointer hover:bg-white/40 transition-colors">Assign</button>
                  <button className="px-2.5 py-1.5 rounded-full bg-white/30 backdrop-blur-sm text-gray-600 text-xs cursor-pointer hover:bg-white/40 transition-colors">Close</button>
                </div>
              </header>
              
              {/* Messages */}
              <div 
                ref={messagesContainerRef}
                className="overflow-y-auto p-5 pb-4 bg-gradient-to-b from-transparent via-white/5 to-white/10 flex justify-center"
                onScroll={handleScroll}
              >
                <div className="w-full max-w-4xl">
                <div className="text-center my-4">
                  <span className="bg-white/40 backdrop-blur-sm text-gray-600 text-xs px-3 py-1.5 rounded-full shadow-sm">Сегодня</span>
                </div>
                {messages.slice().reverse().map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.direction === 'inbound' ? 'justify-start' : 'justify-end'
                    } my-2`}
                  >
                    <div
                      className={`min-w-[120px] max-w-[60%] p-3 px-4 rounded-2xl relative shadow-lg ${
                        message.direction === 'inbound'
                          ? 'bg-white border border-gray-200 rounded-tl-md'
                          : 'bg-blue-500 text-white rounded-tr-md'
                      }`}
                    >
                    <div className={`text-sm leading-relaxed font-medium pr-12 ${
                      message.direction === 'inbound' 
                        ? 'text-gray-900' 
                        : 'text-white'
                    }`}>{message.content}</div>
                      <div className={`absolute bottom-2 right-3 text-xs font-medium ${
                        message.direction === 'inbound' 
                          ? 'text-gray-500/70' 
                          : 'text-white/70'
                      }`}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                  {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-8">
                      <p>No messages in this conversation</p>
                    </div>
                  )}
                  
                  {/* New Messages Button */}
                  {hasNewMessages && (
                    <div className="fixed bottom-20 right-8 z-50">
                      <button
                        onClick={scrollToBottom}
                        className="px-4 py-2 bg-[#4f46e5] text-white rounded-full shadow-lg hover:bg-[#4338ca] transition-colors flex items-center space-x-2"
                      >
                        <span>New messages ↓</span>
                      </button>
                    </div>
                  )}
                  {/* Invisible element for auto-scroll */}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              
              

              {/* Message Input */}
              <div className="p-3 border-t border-white/20 bg-white/10 backdrop-blur-md flex justify-center">
                <div className="w-full max-w-4xl grid grid-cols-[1fr_auto] gap-2.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Напишите сообщение…"
                      className="w-full px-3.5 pr-11 py-3 rounded-xl border border-gray-200 outline-none bg-white text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:shadow-[0_0_0_4px_#eef2ff] transition-all duration-200"
                    />
                    <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-lg text-gray-500 cursor-pointer">📎</span>
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="px-4 border-none bg-blue-500 text-white rounded-xl font-semibold cursor-pointer transition-all duration-200 shadow-md hover:brightness-105 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отправить
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
        </section>
      </div>
    </div>
  )
}
